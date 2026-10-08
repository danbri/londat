# Activity log: Docklands data curation

Newest last. One entry per working session: what changed, commit, measured effect, open items.
Fault ids (F1…) refer to the fault register in [SKILL.md](SKILL.md); check ids (ID-1, SP-6…) to
`../../quality/CATALOGUE.md`.

## 2026-10-02: corridor and Docklands 3D models

- Imported the supplied Canada Water to Surrey Quays 3D study (eb5eaae) and fixed the faults that stopped it
  working: the reserved word `do` used as a name, and a shadowed `cross` (4d44f1f).
- Built the corridor model from open data (12f0090): OSM API `map.json` for the box plus
  `relation/{id}/full.json` for water relations with missing members (the Thames between Rotherhithe and
  Wapping was absent without them); EA LiDAR DTM/DSM 1 m; Wikidata. WGS84 to BNG through OSTN15 (a Helmert
  transform was 1.8 m out).
- Built the Docklands model, London Bridge to Cody Dock (42cbadb onward). Overpass and Geofabrik were
  unreachable; the OSM source is the openstreetmap.fr Greater London extract (OSM data as of 2026-10-01
  01:43 UTC).
- Pipeline faults found and fixed (F10): `simplify()` collapsed closed rings (now split at the farthest
  point); fetch scripts ran their side effects when imported (main guards); the DLR was drawn on station
  roofs because the DSM sees the roof over a viaduct (bridge points more than 20 m above the ground are now
  interpolated: 42 points).
- Feeds catalogue (200 sources), cited facts (360), published levels, live panel, EA flood walls (19036e5,
  897fde6). Wrong links found in our own text and fixed (F11): an FSA search URL and a flood-check link
  that returned 404, a guessed Wikidata id (rule since: never guess ids).

## 2026-10-03: postcodes, events, registry, joins

- Postcodes (2b12097, 748411f, 5cb5bf4): every E14 candidate (4,000) checked against ONSPD August 2026
  (1,905 live, 1,076 terminated, 1,019 never allocated). The ONSPD hosted table times out on LIKE and range
  queries; ids-only then object-id batches of 200 works.
- Events catalogue (124 sources, 24e4bf4). A what's-on page was marked verified although it served an
  Incapsula challenge; corrected (F11).
- Registry (7760e6b, 9475f24): 1,129 buildings with `cwb-` ids; occupants from OSM, FSA, Wikidata (QLever:
  two-step queries, a variable predicate over a radius times out); joins to UPRN, TOID, INSPIRE, Companies
  House, price paid, LBSM. Privacy limits then in force: organisations only, minimum of 5 homes, no company
  addresses, company counts only in residential buildings (486 companies at one flat).
- Chain-store branches (9b22664): 271 branches of 211 brands; CWG directory read from Internet Archive
  copies because canarywharf.com serves a bot challenge.
- Wet areas and museum records (73f0664); riverbed from UKHO bathymetry (2479e3c).

## 2026-10-03: policy and the data register

- Owner policy (9896f41): restrictions on personal, organisation and address data suspended for this
  project during scoping, planning and prototyping; no proprietary or virally licensed data.
- Data register (32c1f09): every committed data file with sources, licences and OSM use. Found: four pages
  showed OSM data without the "© OpenStreetMap contributors" notice (fixed); the postcode page lacked the
  ONS, OS and Royal Mail notices (fixed); the brands README named Geofabrik as the OSM source (F11, fixed).
- Owner: ODbL allowed for now and to be reviewed; keep track of its use. Website crawls (direct, Internet
  Archive, Common Crawl) allowed for scoping (b209725).

## 2026-10-03: atlas

- Atlas page joining every collection (02da9a3).
- F1 found and fixed: One Canada Square's Wikidata record was on both the tower and the Cabot Place mall.
  Rule: an item named by an OSM `wikidata` tag is not attached to a second outline by coordinate. Effect:
  7 buildings changed; buildings with Wikidata 93 → 89; companies matched to a building 5,345 → 6,355.
- F5 fixed for the atlas: LiDAR heights from the 3D model joined to registry outlines (1,079 of 1,129).
- Seen but not patched (owner direction, below): "Boots in The Ivy"; "Unit Unit 14" addresses.

## 2026-10-03: data-quality audit

- Owner direction: catalogue and analyse data-quality and error classes systematically instead of patching
  individual mistakes; this is the basis for the compositing layers.
- `tools/audit-quality.mjs`, `quality/README.md` (analysis and five compositing layers), atlas section
  `#quality`, map layer, quality notes in records (60180d7). 27 checks, 1,564 issues.
- Two first-draft checks were wrong and were corrected before commit: a repeated-word check flagged real
  names ("Tian Tian Market"); a postcode check flagged valid OSM ";" lists. A coverage claim in the draft
  analysis ("no source sees more than 60% of branches") was wrong: OSM sees 79%.
- Pipeline faults found by the audit, catalogued, not fixed: F2 (";" lists: 79 features, 247 postcode links
  lost) and F3 ("Unit Unit": 52 addresses).

## 2026-10-03: mall placement class and this skill

- The "Boots in The Ivy" case traced: OSM Boots (Canada Place, Mall Level -1) placed by proximity (2 m) in
  The Ivy; FSA "Boots the Chemist (4)" (Jubilee Place) inside Northern Trust. Classified as F4 and measured
  with a new check, SP-6: 86 of 181 mall or below-ground occupants are in an outline that is not their mall,
  34 more below ground in a building with no basement record. Audit: 28 checks, 1,684 issues
  (8 high, 818 medium, 858 low); 159 buildings and 44 postcodes with issues.
- `quality/README.md`: new finding "the estate is three-dimensional; the joins are not", and an "occupant
  container" row in the precedence table.
- Skill renamed `cwplans-data` → `docklands-data-curation` at the owner's request, with a fault register
  (F1–F11) and this log.

## 2026-10-03: privacy limits, source survey, data in 3D

- Owner asked to remove the registry privacy limits. The code change was blocked by the environment's safety check ("PII data handling") before anything ran; nothing changed. The planned change list (care-of and address lines, minimum of 5 homes, residential company rule, OSM contact tags, Wikidata people, FSA home-based premises, GOV.UK tribunal decisions, EA owner fields) is reported to the owner, who decides how to proceed.
- Source survey: seven research agents, one per area, 341 new sources (461 of the 541 catalogue entries now verified), 135 recorded exclusions. Merged into `feeds/feeds.json` with an `area` field; tables in `feeds/SURVEY-2026-10-03.md`. Agents fetched every URL; none copied personal details (69 entries flagged `personal_data`, checked by hand). Several sites are blocked by bot challenges (met.police.uk, london.gov.uk, tfl.gov.uk web pages, pla.co.uk, canarywharf.com, Vertus); not bypassed.
- 3D view: the atlas build links 1,188 model buildings to 1,079 registry buildings (`mi`). The 3D page picks buildings off screen, opens their record, draws occupants at their floors, colours buildings by six measures, and shows heritage, quality and live police.uk pins. Tested headless (SwiftShader): 89 distinct buildings picked on a 40 px grid; no page errors.
- Satellite: `tools/build-imagery.mjs` colours the terrain from Sentinel-2 L2A (13 August 2026, 0.01% cloud). Options checked: EA vertical aerial photography is OGL but covers Canary Wharf only in 2007 (40 cm colour) and 2012 (20 cm, night-time); EOX cloudless mosaics after 2016 are CC BY-NC-SA (excluded: share-alike); Capella open SAR of London (CC BY 4.0, 0.33 m, 2024-11-27) stops west of the City; OpenAerialMap has four CC BY drone images at Canada Water and Deptford, none at Canary Wharf; Google photorealistic 3D tiles need a key and limit caching.

## 2026-10-03: underground walking network and routes

- Owner direction: the underground estate (multilevel malls, lifts, stations) must be represented in 3D with shopping, entertainment and routing.
- `tools/build-indoor.mjs` builds the OSM walking network by level (`docklands/data/indoor.js`); the 3D page draws it and finds routes, step-free optionally. First build: the Jubilee platforms were cut off, because OSM platforms are areas that paths do not share nodes with; area hubs fixed it (below-ground points in the main network 152 of 201 → 206 of 207).
- New audit checks NET-1 to NET-4 (fault F12); audit now 32 checks.
- Three research agents collecting estate maps (Internet Archive), station layouts (TfL API, Crossrail papers) and planning drawings: results to be catalogued.

## 2026-10-03: TfL step-free topology and live lifts in routing

- Station agent: TfL publishes step-free station topology (GTFS pathways, 2026-08-03: station points with a level index, lifts with the points they join; no stairs or escalators) and a live lift fault feed (`/Disruptions/Lifts/v2`, CORS open). Today lift LU 2 (ticket hall to Jubilee platforms, Canary Wharf) is out of service.
- `build-indoor.mjs` adds 68 TfL station points, 51 lift links and 29 paths. First version joined TfL points to OSM wherever the level numbers matched; a test route then reached the Jubilee platforms around the faulty lift through a false join (TfL -2 is the Jubilee platforms, OSM -2 the concourse above). Now joined at street level (0) only. New audit check NET-5 (22 of 68 TfL points differ from the nearest OSM level).
- 3D routes skip lifts that TfL reports out of service and list the faults; the network layer draws them red.

## 2026-10-03: ground images, phone layout, rail levels, underground sources

- Ground images (owner: "piece together some imagery to try"): EA survey downloads over the model (tiles TQ3075, TQ3080,
  TQ3575, TQ3580, 2.8 GB, not committed): colour aerial 2008 (40 cm), night-time aerial 2012 (20 cm), LiDAR
  intensity 2020 (1 m). The aerial photos are ECW; built the ECW 3.3 decoder from source and `tools/native/ecw2ppm.c`
  (skill, "Imagery"). `tools/build-aerial.py` mosaics each product to one 2500 × 1866 JPEG at 3 m a pixel
  (0.8 to 1.8 MB) in `docklands/data/tex/`. First build had 1-pixel black seams at tile edges (rounding); fixed by
  integer edges and one pixel of overlap. Source faults recorded, not corrected: the 2008 west tiles are from another
  flight (bluer); no 2008 tile in the north-west corner; the night survey stops near Whitechapel Road.
- 3D page redesigned for phones (owner: "tiny form widgets offscreen below are not practical"): full-screen model,
  search box, depth gauge on the left edge, bottom tabs with a resizable sheet, route ends set by press-and-hold on
  the model or from records, ground-image chips, night mode. Tested headless at 390 × 844 (touch) and 1280 × 800:
  no horizontal scroll, no page errors; press-and-hold at Cabot Square to Waitrose found a 486 m route and reported
  the faulty Jubilee lift.
- Tunnel agent: no public 3D model of a station or tunnel exists (TfL drawings are TfL copyright; Sketchfab CC BY
  items need a login and are trains or one rotunda). TfL FOI-0493-2223 (2022) gives Jubilee rail levels; checked
  against the live CSV. Added as tunnel controls; the Wikipedia and interview depths at Canada Water and North
  Greenwich were 4 m and 6 m deeper (F13; new check AT-5: 2 issues). Rebuilt `area.js` and `cwplans-data.js`.
- Estate agent: CWG estate and mall maps 2003 to 2025 in the Internet Archive (all rights reserved); Living Map runs
  map.canarywharf.com (venue API without key: 9 levels -4 to 2, 8 areas; no licence stated, reference only);
  AccessAble 2022 guides give lift floors and step counts. Catalogues of all four agents (117 sources, 64
  exclusions) committed in `feeds/underground/` with a generated README.
- Data register: textures, the four catalogues, the TfL FOI source, and `data/raw/docklands/tfl-stationdata-gtfs.zip`
  (committed in a1b0dd4 without an entry: found by the check). Audit: 34 checks, 1,686 records (9 high, 819 medium,
  858 low); before: 1,684 (8 high).

## 2026-10-03: F2 and F3 fixed in the parsers

- `tools/osm-values.mjs`: `osmList` (split ";" lists) and `unitLabel` (add "Unit" only to a bare designator), with
  fixture tests (`node --test magpie/cwplans/tools/test/*.test.mjs`: 2 tests, pass). Used by `postcodes.mjs`,
  `build-registry.mjs` and `build-branches.mjs`. `postcodes.mjs osm` reruns the OSM address tally without the
  network steps.
- PL-1 redefined to measure our loss, not the source lists: for each OSM feature with a postcode list, are all its
  postcodes in the registry record that holds it? Before the fix 57 of 59; after 0. PL-2: 52 → 0.
- Effects: registry postcode links 1,050 → 1,146 (the audit's earlier estimate of 247 lost links counted list
  values, many of which the buildings already had from other features); companies matched to a building
  6,355 → 9,787; 299 E14 postcodes gained 312 OSM features (all gains inside the box trace to a list feature).
- SE-1 rose 24 → 36: 12 more residential buildings with 20 or more registered companies, made visible by the
  recovered postcode links (the same class, not new errors). No other count changed.
- Audit: 34 checks, 1,567 records (9 high, 752 medium, 806 low).

## 2026-10-03: drone, splats, glow, Wikidata through QLever

- 3D page: facade shader (window grid, night lights, aerial roofs), glow outlines by occupant kind, free camera and
  capture mode, Gaussian splats synthesised from the model (`tools/build-splats.mjs`, 669,306 splats) with depth
  compositing. Two subagents: drone flight and capture, CPU 3DGS training.
- `tools/build-categories.mjs`: occupant kinds from stated classes only. First version fetched Wikidata classes with
  wbgetentities and hit "too many requests". Owner: pace ourselves, or one well-posed query; QLever. Now
  `tools/lib.mjs` `qlever()` (one call at a time, 1.5 s apart, backoff on 429/5xx) and two queries in total, which
  also fetch the P580/P582 qualifiers and P576 dissolution of every occupant link (F8, partly fixed).
- Effect: of 34 Wikidata occupant links 4 are current, 6 former (FCA left 25 North Colonnade in 2018; FSA, NYSE
  Euronext Liffe, Allianz Trade at One Canada Square; Banc of America Securities at 5 Canada Square), 24 undated.
  Finance glow 18 → 17 buildings. TM-4 34 → 30 issues (6 medium, 24 low). Audit 1,563 records.

## 2026-10-03: provenance manifest; level parsing (VA-2)

- Owner: selected sources will go through a data integration pipeline into a knowledge graph; record sources and
  transforms with that in mind. Added `pipeline.json` (one PROV activity a tool: used, generated, rules, network,
  deterministic, after; drafted by a subagent from the code), its checks in `tools/check-data-register.mjs`, and the
  export `pipeline.jsonld` (PROV-O, DCAT, Dublin Core). Policy line "knowledge_graph" in `data-register.json`.
- Level parsing: one parser for OSM levels in `tools/osm-values.mjs` (`osmLevels`: ";" and "," lists, ranges
  expanded, fractions), with fixture tests; used by `build-indoor.mjs`, `build-docklands.mjs` (its own parser kept
  only the ends of a range) and `build-registry.mjs` (occupants now carry `levels` next to the raw `level`).
- VA-2 redefined as values our parser cannot read: 100 → 0 (86 ";" lists, 11 comma lists, 2 fractions, 1 range, all
  read). No other count changed. Audit: 1,463 records (9 high, 758 medium, 696 low).

## 2026-10-03: skyline by year; provenance manifest checked

- `tools/fetch-dsm.sh` and `tools/build-skyline.mjs`: EA LiDAR DSM tiles 1999 to 2022 over the estate (16 ZIPs,
  1 GB, local), heights of 2,389 model buildings per survey, with flight dates; `docklands/data/skyline.json`
  (85 kB) and a year slider with play in the 3D page. Faults found and handled: the 2012 1 m request for TQ3580
  returns a server error (only 0.5 m exists); the 2015 survey did not fly the estate (tile 99% empty), so years that
  fly under 20% of the buildings are left out and listed; a cleared site with hoardings measured 5 to 8 m and showed
  future towers as low blocks, so "standing" now needs a quarter of today's height. Buildings a survey did not fly
  are drawn in slate blue at today's height.
- Checked against known dates: 8 Canada Square absent 1999, 209 m from 2007; Landmark Pinnacle 87 m (2018) then
  234 m; Newfoundland 160 m (2018) then 218 m.
- `pipeline.json` (57 activities + fetch-dsm, 5 libraries, 2 tests) committed; its 11 header mismatches corrected
  in the tools, which now point to their activity; 9 source keys added to the register (OSTN15 grid, PLA and CRT
  ArcGIS, VOA, GOV.UK search, Wikipedia search, FSA API, EA DSM history, feed providers); register entries that
  disagreed with the code corrected (postcodes/queries.json sources, hand-made museum and UKHO files).

## 2026-10-03: pixel art, declutter, towers, trees, facades, trained splats

- Pixel-art style: zoomed out, one art pixel per CSS pixel and no windows or outlines (no speckle); district colours;
  water 1.2 m above its level. A variable used before its declaration stopped the page from loading; the headless
  load test found it before the push.
- Declutter (owner: "The city is the star not our endless word buttons"): a menu button opens a left drawer with the
  views, Layers, Route and About (help text there); the record is a card at the bottom; labels are plain text.
- Towers: 27 towers fitted from the LiDAR (roof RMSE 0.8 to 3.7 m) drawn as tiers; One Canada Square's pyramid.
- Trees: 81,875 trees and 15,708 green areas from open sources; real trees in pixel art and under Show > Trees.
- Facades: facts for 31 towers, 56 open photos with attribution; not yet used by the shader.
- Splats: first trained set (OpenSplat, CPU, 3,000 steps), 167,073 splats after the crop, in the splat set menu.
- Register: a check failure was committed once because the check output went through `tail`, which hid its exit
  status; fixed in the next commit. Run the check on its own and read its exit code.

## 2026-10-03: gestures, music, pixel materials, photo facades

- Two-finger twist turns the view in both styles; pixel art tilts with two fingers. Pinches that started on a label
  did nothing before; fixed.
- Music: starts inside the tap; a now-playing bar with stop; the own-file button opens the phone's picker.
- Pixel art: materials instead of a height ramp; measured facade colours on the towers.
- Photo facades: 16 tower tiles from CC BY photos (atlas 243 kB), credited in About.

## 2026-10-03: CWG directory joined into the registry; OSM contact tags kept; six new categories

- `fetch-cwg.mjs` parse faults (F14) fixed with `registry/sources/brands/tools/cwg-fields.mjs` and fixture tests
  (`tools/test/cwg-fields.test.mjs`); re-run from the cached archive pages (no new fetch except 2 failed retries for
  pages that were never archived). Categories now on 339 of 374 entries (was 0); 4 wrong levels, 1 wrong mall, 5
  missing malls, 3 missing E22 postcodes corrected. `build-branches.mjs` re-run: 271 branches, no change.
- `registry-osm.mjs` keeps business phone, email, website and contact:* (F15); same 12,793 features. Occupants now
  carry opening_hours, cuisine, wheelchair, check_date, start_date, opening_date, operator, url, website, phone,
  email, contact links. Buildings keep addr:housename.
- `build-registry.mjs` CWG join (F16). Entries: 148 linked by the branch join (before and after), 82 joined by name and
  place (23 same mall, 32 same street or square, 12 shared postcode, 15 same building), 106 added as new occupants (19
  street address, 79 mall host outline, 8 by postcode; confidence 17 high, 81 medium, 8 low), 38 unplaced. Linked to
  an occupant: 148 → 336 of 374. Occupants 1,161 → 1,267. Mall hosts derived from OSM name or addr:housename: Cabot
  Place cwb-0411, Canada Place cwb-0466, Jubilee Place cwb-0586, Crossrail Place cwb-0358, One Canada Square cwb-0413,
  The Park Pavilion cwb-0460, West Wintergarden cwb-0584; Churchill Place has none (2 entries placed by the one retail
  building of E14 5RB, low).
- Unplaced classes (CV-3): street address on no registry building 13 (mostly Wood Wharf), car park 5, no archived page
  5, page with no address 4, estate-wide 3, postcode names several buildings and no address 3, postcode on no building
  2, E22 postcode and no address 1, no postcode and a street place 1, two OSM records in two buildings 1 (Vertus Edit,
  "3 & 15 West Lane"). Also: 6 entries join OSM and FSA records that sit in different buildings (F4/F7 evidence);
  "London Museum Docklands" does not join the museum's old name.
- `build-categories.mjs`: bar, alcohol, education, health, sport, arts from stated classes (OSM, FSA type, Wikidata
  P31, CWG section and single-class CWG labels; "Sport & Fitness" and the vet in "Healthcare" left out after reading
  the examples). Totals (buildings/occupants): finance 17/28 → 18/30, shop 79/225 → 81/256, catering 144/505 →
  145/540, leisure 28/31 → 28/32, entertainment 6/7 → 6/7; new: bar 28/42, alcohol 3/3, education 20/24, health
  29/38, sport 19/29, arts 5/6. The 3D page glows only the first five (its list is in docklands/index.html).
- `tools/scan-model-pois.mjs` → `registry/model-box-pois.json`: OSM POIs of the six classes in the whole model box
  (total / in the registry / in the registry box but not in it / outside the registry box): bar 569/29/0/540, alcohol
  51/4/0/47, education 303/19/3/281, health 336/35/2/299, sport 817/31/22/764, arts 97/7/1/89. In the registry box the
  28 missing are 21 unnamed (the registry takes named features only) and 7 named (Boots node/4558839860, South Quay
  College, Poplar Bowls Club and others) that lie more than 12 m from any outline.
- Audit 34 checks / 1,463 issues → 36 / 1,481. New CV-3 (38) and SP-7 (8 low-confidence placements). CV-2 (CWG-only
  entries) 205 → 162. SP-2 now leaves out key placements (173, unchanged). SP-6 reads addr:housename as a mall name:
  issues 120 → 119 with population 181 → 304 (CWG malls now on 123 more occupants). Rises from new evidence, not
  new faults: AT-3 46 → 59 (more OSM/CWG level pairs, F9), ID-2 83 → 84 (Third Space has two CWG pages), ID-3 20 → 22
  (CWG entries named after their building). Tests: 8 of 8 pass.
- Register: entries updated for buildings.json, categories.json, cwg-directory.json, issues.json; new
  model-box-pois.json; pipeline.json: fetch-cwg, registry-osm, build-registry, build-categories, audit-quality
  updated, scan-model-pois added, cwg-fields.mjs as a library, its test. The register check still fails on two tools
  of the parallel sessions (tools/crawl-sites.mjs, tools/fetch-registers.mjs: not in pipeline.json).

## 2026-10-03: regulatory and public registers

- New tool `tools/fetch-registers.mjs` (polite per-host queue, >= 1 s, backoff on 429/5xx). Output
  `registry/sources/registers/<source>.json` ({meta, records}) and README.md; raw in `data/raw/registers/`
  (gitignored). Entries for data-register.json and pipeline.json are in `registry/sources/registers/register-entries.json`
  for the main session to merge (not merged by this agent). Not committed by this agent.
- Kept per source (in the box / E14): GIAS 23 / 63 (OGL); CQC directory 47 / 84 (OGL); NHS ODS 258 / 422 (OGL);
  Charity Commission 131 / 316 (OGL); Ofsted childcare on non-domestic premises 16 / 45 (OGL); Gambling Commission
  premises 8 / 14 (OGL per data.gov.uk record only); Sport England Active Places 13 / 37 sites, 103 facilities
  (CC BY 4.0); FSA Pub/bar/nightclub 17 / 37 (OGL, from the FHRS snapshot).
- Catalogued, not patched: 16 GIAS "Fieldwork Overseas Establishments" (schools abroad) use 30 Skylines Village,
  E14 9TS as a correspondence address (`address_role`); 82 ODS records in the box sit at E14 5HU, the
  registered-office service at 5 Churchill Place (class of SE-1); charity contact addresses are not premises.
- Not reached: Tower Hamlets premises licence register (alcohol-entertainment.towerhamlets.gov.uk: TLS handshake
  failure, HTTP 503; only the start page in the Internet Archive). Rejected: PRA lists (Bank of England terms:
  non-commercial internal use); FCA register and NHS service search (keys, terms unread); OfS register (refused
  this client).

## 2026-10-03: website crawl

- Website crawl, tools/crawl-sites.mjs (new). 859 URLs on 393 hosts from buildings.json occupants, branches.json, storelocator.json and cwg-directory.json (FSA, OSM, Wikidata, Wikipedia, Companies House and Land Registry links skipped by rule). 737 pages read (369 CWG pages as Internet Archive copies reused from fetch-cwg.mjs, 368 direct); 122 not read (bot challenge 59, 404/410 18, 401/403 15, TLS 10, timeout 7, DNS 4, robots.txt 4, 429 2, connection 2, 5xx 1). Direct pages: JSON-LD 246, opening hours 61, schema.org telephone 77, names the branch 154 (235 are home pages). 61 new feed URLs (registry/sources/web/discovered-feeds.json), not yet verified. Out: registry/sources/web/site-facts.json, discovered-feeds.json, README.md. Open: merge register-entries.json into data-register.json and pipeline.json; verify the feeds; script-rendered store pages give no facts without a browser.

## 2026-10-03: regulatory and public registers joined into the registry

- `build-registry.mjs`: the registers in `registry/sources/registers/` (GIAS, CQC, ODS, charities, Ofsted childcare,
  gambling, Active Places, FSA pubs) join occupants with a link per record (`occupant.registers[]`: register, id,
  kind, status, key, precision, confidence) and the source ids on the occupant. Keys: UPRN, register point, named mall
  (F4), street address with postcode, street address alone, name at the same postcode, postcode alone (guarded, F19).
  Occupants 1,267 → 1,486.
- Per register (placed / joined an existing occupant / added / unplaced in the box / outside the box or not a place):
  GIAS 7 / 3 / 4 / 1 / 39 outside + 16 correspondence; Active Places 12 / 3 / 9 / 3 / 22; ODS 157 / 36 / 121 / 26 / 153
  + 86 not places; CQC 40 / 27 / 13 / 9 / 35; Ofsted childcare 13 / 3 / 10 / 3 / 29; gambling 6 / 0 / 6 / 2 / 6;
  charities 58 / 3 / 55 / 46 / 179 + 33 not places; FSA pubs 16 / 15 / 1 / 2 / 19.
- New faults F17 (shared UPRN), F18 (addresses that are not places), F19 (postcode alone), F20 (provider and site
  pairs). Categories: education 20/24 → 26/38, health 29/38 → 44/79, sport 19/29 → 22/35, bar 28/42 → 28/43, shop
  81/256 → 83/262 (betting shops), new charity 26/58; others unchanged.
- Audit 36 checks / 1,481 issues → 39 / 1,750: new CV-4 (92 in the box with no building), ID-5 (9), SE-3 (135);
  SP-7 8 → 30 low-confidence key placements (population 325); ID-2 84 → 89 (F20); ID-3 22 → 25; SP-6 119 → 122. Tests
  8 of 8. Register check exit 0.

## 2026-10-03: structured data from rendered pages, store finders, Factoidal

- New tools: `tools/render-structured-data.mjs` (headless Chromium render of every entity URL, robots.txt per
  navigation, 3 pages at once, one per host, 2 s gap; store-finder searches with the branch postcode, owner rule of
  2026-10-03), `tools/structured-dom.mjs` (in-page JSON-LD / microdata / RDFa extractor), `tools/jsonld-clean.mjs`
  (repairs by class; tests `tools/test/jsonld-clean.test.mjs`, 7 of 7), `tools/extract-structured-data.mjs`
  (Factoidal: JSON-LD to RDF, named graph per page, SPARQL). `@factoidal/core` ^0.7.1 added to the root
  devDependencies. Not committed by this session; register and pipeline entries are in
  `registry/sources/web/structured-register-entries.json` for the main session to merge.
- URLs: 1,025 (559 hosts) from buildings.json occupants (website, cwg_website, store_url), branches.json,
  storelocator.json, cwg-directory.json and 171 registered-charity websites; 369 are Internet Archive CWG copies read
  from cache. Rendered 901 of 1,067 attempts (including 42 store-finder result pages); failures: bot challenge 63,
  dns 33, 404/410 21, 401/403 11, tls 10, timeout 8, HTTP error 6, 5xx 4, connection 3, robots disallowed 2,
  robots.txt 5xx 3, 429 2.
- Pages with JSON-LD 695, microdata 72, RDFa 798 (schema.org RDFa 1); only after scripts: JSON-LD 22 pages,
  microdata 4, RDFa 5. Store finders: 247 searches for 201 brands; 29 branch pages that name the branch.
- `structured-facts.json`: 232 records for 210 entity keys; opening hours for 109 keys at branch scope (95 high
  confidence), 5 chain, 7 organisation; telephone 126 branch; events on 2 keys (12 events). Every OSM opening_hours
  string parses. No audit counts changed (the registry is not yet joined to these facts).
- Open: join structured-facts.json into the registry and the atlas (hours, phone) with its confidence; a check
  for hours that disagree with OSM `opening_hours`; all.nq is 12 MB (gzip it, or keep only schema.org quads, if the
  repository size matters); store finders still fail for 100 brands with no finder link and 50 with no postcode box.

## 2026-10-03: methods audit and METHODS.md

Owner instruction, 2026-10-03: "record ALL our data methods in skills or other concrete committed artifacts".

- Audit of every tool against its `pipeline.json` activity (75 activities, read from the code). Gaps found, by class:
  politeness not stated or incomplete (27 activities: User-Agent, pauses, retries, timeouts, concurrency); cache or
  re-fetch behaviour not stated (19); units, coordinates or rounding not stated (15); no known-fault (F-number)
  links on any activity; hand
  judgement not marked (20 tools); hand steps with no activity (13: sourced levels, facts.json, the underground and
  feeds catalogues, FSA/CWG decisions, store-locator URLs, records-open subset, UKHO wrecks clip, facade photos and
  regions, palette and music, licence decisions, provenance upkeep, quality analysis); out of date (7: build-skyline
  named `data/raw/dsm/fetch.sh` and listed one input twice; four notes about register errors already fixed; the
  register gave `postcodes.mjs fetch` as producer of `postcodes/canary-wharf-ward.geojson` (the build mode writes
  it); the skill said 34 audit checks in eight classes (39 in nine); the `match-osm.mjs` header said the NSI match is at
  One Canada Square (it is at the feature's position)); vague method (2: match-osm, fetch-raw-lidar); one script not
  listed (`tools/native/ecw2ppm.c`).
- `pipeline.json`: new `areas` (22 subject areas), `area` on every activity, `faults` (F-numbers) on 19 activities,
  `judgement` on 20, rules added from the code, `manual_activities` (13 hand steps; `gap` names 4 one-off scripts
  that are not committed), `tools/native/ecw2ppm.c` as a library.
- `tools/check-data-register.mjs`: fails on an empty method or rules, an unknown area, a fault id not in the fault
  register; lists `tools/native`, `tools/test`, `registry/sources/*/*` and `feeds/*` scripts; `--write` also writes
  `METHODS.md` (from `methods-intro.md`, `pipeline.json`, the fault table in SKILL.md and `quality/issues.json`) and
  exports hand steps, areas, faults and judgement to `pipeline.jsonld`.
- New: `methods-intro.md` (hand-written policy and owner rules, crawl and hand-curation rules), `METHODS.md`
  (generated), both registered. SKILL.md: "Methods" section; audit count corrected.
- Check: `check-data-register.mjs --write` exit 0; `node --test tools/test/*.test.mjs` 15 of 15. Not committed by
  this session.
- Found, not fixed (code): `registry-wikidata.mjs` calls QLever with no pause and no retry (it does not use
  `tools/lib.mjs` `qlever()`); `fetch-dsm.sh` does not send the project User-Agent; `check-feeds.mjs` and
  `check-events.mjs` run 6 requests at once with no per-host gap.
  Fixed the same day (main session): `registry-wikidata.mjs` now uses `lib.mjs` `qlever()` (output unchanged: 288
  items, 3 memorials dropped, 17 headquarters); `fetch-dsm.sh` sends the project User-Agent; the two feed checkers
  send at most one request at a time to a host, 1 s apart.

## 2026-10-04: skills split ("Wrap it all up into skills")

Owner instruction, 2026-10-04: "Wrap it all up into skills". Three new skills, each checked against the code:
- `docklands/skills/docklands-3d-page/` (the 3D page: programs, vertex formats, interface, styles, splats, Night, fp16,
  testing, shipping); `skills/cwplans-web-harvest/` (crawl, render, store finders, JSON-LD repair, Factoidal, scopes,
  join-web-facts, opening hours, proxy CA); `skills/cwplans-public-registers/` (licences, fields dropped, join keys,
  F17 to F20, rejected sources). Symlinked in `.claude/skills/`; `npm run skills:check`: 23 of 23 discoverable, 0
  problems. Rows added to the skills table in the repo `CLAUDE.md`.
- This skill slimmed from 331 to 264 lines: "Page rendering lessons", "Splats and drone frames" and "Structured data
  from rendered pages" moved out (headings kept as pointers, because tool headers name them); the Wikidata / QLever
  lesson has its own section; `join-web-facts.mjs` added to the rebuild order; a skill index with the pending sky,
  time, weather and tide skill (another agent is building that code). Every removed line was checked against the new
  skills.
- `tools/check-data-register.mjs`: `skills/` directories are skipped at any depth (`docklands/skills/` was counted as
  an unregistered data file). Fault table unchanged, METHODS.md not regenerated.
- Measured while verifying (headless SwiftShader, `?view=rotherhithe`, working tree with the sky agent's uncommitted
  sky.js): no page errors at 1600 x 900 DPR 1 and 390 x 844 DPR 3 (canvas 780 x 1688: DPR is capped at 2);
  `NIGHT.n` 84 roofs, 587 red lights, 1,449 lamps, 160 columns, 1,769 reflections, 12 signs; `renderNow()` returns in
  2 ms and the frame is drawn in the next `readPixels` (about 2.2 s at 1600 x 900); the fp16 emulation in Node gives 0
  for 3,554 of 3,600 window cells; `opening-hours.js` reads all 156 distinct opening_hours strings in the registry;
  `node --test tools/test/*.test.mjs` 15 of 15.
- Stale statements found: README "Isometric pixel art" says one art pixel per 3 screen pixels (the code uses 2 CSS px,
  1 when zoomed out); README "Night" says the photos are not in the repo (they are in `docklands/reference/night-2026-10-03/`
  since 2d76be0); the atlas tile host answered curl through the proxy on 2026-10-04. README not edited (another agent's
  file today).

## 2026-10-04 sky, time, weather and tide (sky agent)

- Added `docklands/sky.js` (Menu > Sky, `?t=`, `?t=photo`): page clock; astronomy-engine 2.1.19 (MIT) sun, moon phase and
  limb, planets, Jupiter's moons, rise/set, twilight; Bright Star Catalogue stars (public domain) with a London star limit;
  d3-celestial constellation lines (BSD-3); a computed Milky Way band (Vieira outlines refused: no licence); CelesTrak
  satellites with satellite.js 7.1.0 (MIT; CelesTrak states no licence, marked for review); Open-Meteo cloud and haze
  (CC BY 4.0); EA tide readings interpolated along the Thames to the viewpoint (OGL), drawn through `setTidal`. Replaced
  the old moon code in `index.html` with small hooks. Commits 7025728, 956f3e0.
- Tool `tools/fetch-sky.mjs` (pipeline activity `fetch-sky`, new area "sky"); snapshots `docklands/data/sky/` for
  3 October 2026; five sources and six files added to `data-register.json`; check exits 0 (142 registered).
- Photo time solved from the moon: 3 October 2026 23:56 BST, about ±4 min (method and table in
  `docklands/reference/night-2026-10-03/README.md`). Weather then 15% low cloud, 14 km; Thames −1.20 m OD, falling.
- README "Sky, time, weather and tide" added; the two stale README lines fixed. Skill `docklands-sky` written.
- Open: One Canada Square's model apex projects about 0.9° above the photo's apex in both photos (cause not found);
  no tide predictions (no open source); CelesTrak licence to review before prototyping ends.

## 2026-10-04 permits, works, closures and what's on (works agent)

- Owner: "look into local authority permissioning for events, street closures, markets and events across entire zone"
  and "get tfl and road/bus/train planned works". New tool `tools/fetch-works.mjs` (activity `fetch-works`), snapshots
  in `feeds/works/` (one per source, `{meta, items}`) and `works.json` (1,552 items), page
  https://danbri.github.io/glitchcan-minigam/magpie/cwplans/feeds/whatson.html, skill `cwplans-permits-and-works`.
- Zone: the model box plus a Royal Docks margin (0.015 to 0.085 E). Items: TfL lines 29, TfL buses 53, TfL roads 59
  (9 planned events), Street Manager permits 1,035 open of 3,909 in the zone (September archive) and activities 44,
  Gazette 72 (16 TTROs), Tower Hamlets licence notices 11 (8 TENs), planning 18, markets 28, venue events 203.
- Owner feedback on the first page: "looks like all roads and busses" (85% Street Manager). Page split into "What's on"
  (default, 284 items) and "Closures and works" (rail first, buses, road closures and works grouped by street); venue
  programmes harvested from every verified event feed in `feeds/events.json` at run time.
- Traps met (in the skill): TfL affected stops have lat/lon 0 (NaPTAN 910/930/940 used); the Gazette geo point is the
  publisher's office and each notice names the council's own office postcode (removed before reading districts);
  Gazette robots.txt Crawl-delay 10 (one disallowed `data.jsonld` was fetched by mistake while probing); "press" matched
  "WordPress"; Royal Docks Atom mixes articles with events.
- Not reached or rejected: Tower Hamlets eLR register (TLS reset again); other boroughs' Idox licensing registers (forms:
  owner decision needed); NRE and Network Rail feeds (accounts); Street Manager live (SNS endpoint); Internet Archive
  (proxy drops).
- 10 new event sources added to `feeds/events.json` and an `EVENTS.md` section.

## 2026-10-04: London Datastore walk (London Datastore agent)

- Owner, 2026-10-04: "Can we work our way through open data London portal?" New tool `tools/walk-london-datastore.mjs`
  (walk, triage, harvest), skill `cwplans-london-datastore`, results in `feeds/london-datastore/README.md`.
- API found: the site is DataPress; `/api/v3/datasets/export.json` gives all 1,305 datasets in one response;
  `/api/action/package_search` ignores q/rows/start; `organization_list` and `license_list` answer 410. Terms read:
  any purpose, state that the GLA cannot warrant the data.
- Catalogue (`catalogue.json`, one dataset per line): 1,305 datasets, 11,348 resources, 312 links.
- Triage (`triage.json`, written rules, reasons per dataset): licence ogl 872, cc-by 68, public-domain 9, odc-by 7,
  share-alike 8, restricted 15, other 2, none 324. Relevance zone-place 6, zone-borough 12, london-fine 263,
  london-borough 362, london-coarse 255, other-area 54, unknown 353. Sensitive 7 (never harvested). The project held
  2 before (public realm trees, LBSM 2), listed 45, had excluded 3; held 15 after this commit.
- Harvested 13 open datasets clipped to the 3D model box (features in zone): cultural venues 662 (UPRN on 599),
  Southwark local list 599, designated open space 517, brownfield sites 229, site allocations 137, conservation
  areas 112, LVMF 2026 views 35, air quality sites 28, SIL 14, safeguarded wharves 10, Article 4 office to residential
  9, LSIS 8, CAZ 1. Flood Risk harvested and dropped (no flood zone class; the EA source is better).
- New faults: F22 (UPRNs rounded by a spreadsheet in the Cultural Infrastructure Map: 56 of 599 zone venues) and F23
  (Planning Constraints Map GeoPackages with geometry only; the brownfield GPKG OBJECTID is not the CSV objectid:
  127 of 238 zone polygons over 500 m from the CSV point with that id). Rules in the tool; checks in the meta counts.
- Mistake made and repaired: a Python one-liner opened `CLAUDE.md` for writing before reading it and emptied the
  file for about a minute; restored from HEAD plus the other agent's uncommitted crown-lighting row. Read first,
  then write.
- Open: the ranked backlog in the README (Town Centre Boundaries, Opportunity Areas, High Street Boundaries and BIDs
  first); join the cultural venues to the registry by UPRN (minus `uprn_suspect`) and the brownfield sites by address;
  the 353 "unknown" datasets were not opened; 324 datasets with no licence wait on the GLA.

## 2026-10-04 live state: helicopters, hire bikes, lifts, cranes (live-state agent)

- Owner, 2026-10-04: "Do we know anything about the periodic Chinook helicopter and other copter flights? ... Hire bike
  parking and pickup points. What else might be measured or have interesting state?" New tool `tools/fetch-live.mjs`
  (pipeline activity `fetch-live`, area feeds), snapshots in `feeds/live/` (8 files and README), skill
  `cwplans-live-state`, six sources in `data-register.json`, 7 verified sources added to `feeds/feeds.json`.
- Snapshots of 4 Oct 2026 08:24-08:27 UTC: 138 Santander Cycles docks in the zone (1,889 bikes, 132 e-bikes, 3,897 docks,
  347 docks neither free nor holding a bike); 4 lift outages (Canary Wharf: no step-free access to the Jubilee line);
  busyness for 20 of 65 stations; 115 JamCams; 1 UKPN incident (restored); 17 storm overflow monitors (none discharging);
  18 NOTAMs (12 cranes with heights, up to 719 ft AMSL at Gracechurch Street; 6 temporary drone areas over the Thames by
  Southwark); 8 helicopter facts (H4 Isle-of-Dogs and London Bridge points, EGR158, EGR159 Isle of Dogs SFC-1400 ft, EGR160).
- Helicopters: route, points, altitudes and restricted areas are published (UK AIP; facts only). Live positions are not
  available under an allowed licence (OpenSky, adsb.fi, airplanes.live, ADS-B Exchange restricted; adsb.lol ODbL needs the
  owner's agreement): no position sample committed. CAA CAP 1455 daily counts may not be reproduced: four sums quoted.
  Chinook transits: no published schedule or flight plan.
- Hire bikes: no open live feed or bay dataset for London dockless operators (GBFS 404/401; none in the MobilityData list).
- Traps: NATS eAIP issues after 2024-03-21 answer 404 from the container (the 2024-03-21 issue is used; re-check); the
  first " H4 " in the EGLL page is another table; a NOTAM appears twice in the PIB; canarywharf.com bot challenge and an
  Internet Archive reset left the estate's hire-bike rules unread.
- Mistake made and repaired: an insertion script wrote `CLAUDE.md` with `open(p, 'w').write(f(open(p).read()))`, which
  truncates before it reads (the same fault the London Datastore agent logged); the file was empty for about a minute
  and was restored from HEAD plus the uncommitted crown-lighting row. The scripts now read first and refuse to shrink.
- Open: the ranked backlog in `feeds/live/README.md` (TfL arrivals, Tower Bridge lifts, AIS, EV charger OCPI feeds, flood
  warnings, air quality); the 3D page layers proposed in the skill; ask the owner about ODbL for adsb.lol.

## 2026-10-04 crown lighting (crown lighting agent)

Owner's questions: how the colours at the top of One Canada Square are chosen, and whether past colours are recorded.
- Found: CWG lights the top ("the halo", CWG press release of 2 December 2024) for campaigns with a partner, in the
  campaign's colour (NHS blue Jan 2021, Elizabeth line purple May 2022, World AIDS Day red with Positive East Dec 2024,
  NSPCC green Jun 2025, UN orange with Tower Hamlets Nov 2025). No request form, criteria or calendar found. The apex
  light is a separate white flashing aviation light (London City Airport study, CAP 168; LED since Nov 2012).
- No complete history exists in public: `registry/sources/lighting/crown-lighting.json` holds 15 policy sources,
  9 campaigns (1991 to 2025) and 14 dated observations (2010 to 2026: 9 CC BY-SA photos as facts, 2 owner photos,
  2 press, 1 social post). Open photos 2012 to 2018 show white pyramid faces before 23:00; the owner's 3 October 2026
  photos (23:56 BST) show dark faces and a red halo (measured #9d3f3c); no campaign found for that date.
- Tool `tools/fetch-crown-lighting.mjs` (activity `fetch-crown-lighting`, new area "lighting"; hand step
  `crown-lighting-judgement`); outputs `press-pages.json`, `commons-photos.json` (217 photos); README; skill
  `cwplans-crown-lighting`; four sources and four files registered.
- Network: web.archive.org reset every connection from the container all session (archive.org availability API
  answered), so CWG pages were read through search summaries and republished copies; upload.wikimedia.org gave 429
  after 31 thumbnails. Re-run `--press` and `--thumbs` later; 186 photos (27 CC BY or public domain) not yet judged.
- Not done (another agent owns the files): Night mode colour by date in `docklands/index.html`.

## 2026-10-04 open issues of the 3D page (moon, names, clouds, tide, apex, phones)

- Tide along the river: per-vertex Thames levels by chainage between the EA gauges; F21 (Tower Pier faulty readings
  around low water, 5 of 119 left out by a gauge-difference rule). The page also hid any tide below the LiDAR water
  surface (2.8 m OD): the river ground now sinks under a measured tide (photo view: dark ground before, water and
  reflections after). Commit aa90987 and 3a92f8c.
- Moonlight (Night, sun down; strength from magnitude, airmass, cloud; cool tint; Lambert on face normals from screen
  derivatives) and the moon's glitter path (+8 to 11 mean luma under the moon at the photo time). The pick buffer was
  never cleared (`gl.clear` inside a comment): fixed. 3a92f8c.
- Star names (IAU WGSN, CC BY, 324) and Messier objects (NASA HEASARC, public domain, 109; OpenNGC refused: CC BY-SA),
  only what the star limit shows, not behind buildings (`__docklands.horizon`). a2f0d48. That commit also carried another
  agent's staged London Datastore deletion and pipeline entries (their work, consistent with their tree).
- Clouds: EUMETSAT Meteosat cloud mask (CC BY 4.0, Core data) places the Open-Meteo layer cover; snapshot 23:00 UTC 3 Oct,
  live with Fetch through EUMETView (CORS). dae0a56; dae0a56 also dropped the works agent's register and pipeline entries
  (built on an older copy): restored in 3364c30.
- Phone GPUs: tools/check-fp16-shaders.mjs; the glow pulse failed in fp16 after 10 minutes: fixed. dc90c84.
- Aircraft: no source allows live use on a public page (OpenSky, adsb.fi, ADS-B Exchange, adsb.lol ODbL, airplanes.live
  unreadable); London City Airport approach paths (OSM thresholds, 5.5 degrees) as the stub. c03e167.
- One Canada Square apex 0.87 degrees high in the photo fit: not the tower, curvature, eye or radial distortion; no single
  pinhole camera fits the landmarks better than about 0.5 degree; numbers in docklands/README.md. No model change.
- Open: cloud heights; tide predictions (no open source); moonlight calibration against a moonlit photo; a phone test of
  the list in the 3D-page skill; the apex question needs a photo with EXIF.

## 2026-10-04 river, docks, locks, water quality and boats (river agent)

- New tool `tools/fetch-river.mjs` (pipeline activity `fetch-river`, area water) and 14 snapshots in `feeds/river/`
  (README there), skill `cwplans-river-and-water`. Counts on 2026-10-04: 13 PLA notices to mariners (facts only, from the
  PLA ArcGIS layer NtMs_Live; pla.co.uk blocks scripts), 18 CRT notices of 1,076 national (the JSON endpoint behind the
  notices page, found by watching the page's requests), 8 Thames Barrier planned tests (GOV.UK, OGL), 0 flood warnings,
  17 level series (Thames gauges, 6 barrier DIFF stations, Lee, Ravensbourne, Quaggy), 9 locks with rules from
  `locks-facts.json` (hand-written), Eden Dock 4 samples (May to August 2026, all Excellent) and 16.6 °C, Royal Docks 6
  samples of 9 September 2026 (all Excellent), 20 EA sonde series, 41 WIMS points, TfL 12 piers, 18 timetables, 48
  arrival predictions, 632 OSM features, 8 PLA visitor moorings, 22 Wikidata vessels.
- Catalogued, not patched: F24 (BARIERA sonde values impossible; flagged); a conflict between two CRT pages on the West
  India Dock Entrance Lock window (both kept); "Royal George V Dock" in the RoDMA certificate (alias, written form
  kept). Storm overflows are not repeated here (`feeds/live/overflows.json`).
- Rejected: open live AIS does not exist for this use (aisstream: key, server only, no stated licence; AISHub: receiver
  required; GFW: CC BY-NC; MarineTraffic, VesselFinder: proprietary); EA bathing-water API (403 from the container);
  CRT ArcGIS layers (no commercial use); boat occupants (no open source).
- Feeds catalogue: 6 entries added to `feeds/feeds.json` (CRT notices endpoint, Sea Lanes water quality, RoDMA
  certificate, EA sondes at Cadogan Pier and Erith, GOV.UK barrier tests, Wikidata vessels).
- Open: lock state from the tide (needs high-water times: ADMIRALTY key), St Katharine and Royal Docks lock rules, an
  AIS decision for the owner, the 3D page layers proposed in the skill.

## 2026-10-04 rounded UPRNs amended in a copy (UPRN amendment agent)

- Owner, 2026-10-04: "Can we record a methodology for fixing this by copying and amending the spreadsheet?" Method
  written in `cwplans-london-datastore`, "Amending rounded UPRNs": keep the source untouched; copy; amend only cells in
  a rounded class; record every change and every unknown in a separate amendments file; never choose between two
  candidates; measure each route blind before trusting it. F22 row updated; new fault F25.
- New tool `tools/amend-uprns.mjs` (generic flags, recipe `cultural-infrastructure`). Out:
  `feeds/london-datastore/cultural-infrastructure/cultural-infrastructure.uprn-amended.geojson` and
  `cultural-infrastructure.uprn-amendments.json`. Raw references in `data/raw/uprn-amend/` (gitignored, new line in
  `.gitignore`). Register: 2 files, 3 sources (lds-2ko88, lds-2zj1y, gla-cim-arcgis); pipeline activity `amend-uprns`.
- Route a (other releases): 116 files, 82,223 rows from 23697, 2ko88, 2zj1y and the GLA ArcGIS service. The rounding
  is in every release (2018-2020 CSVs already show 1.00E+11; the ArcGIS field is text and rounded). The editable GLA
  FeatureServers need a token; the 2025 list has no licence (not used).
- Counts (F22): 56 rounded rows, 49 venues. Fixed 12 rows: route a 6 (high), route b OS Open UPRN in the building
  outline 6 (medium), route c registers 0 (they cover E14; no rounded venue is in E14). Unknown 44 rows: 3 low (not
  applied), 41 with no single candidate (28 venues with 2 to 74 points in range, 7 with none).
- Measured on 160 valid 12-digit UPRNs rounded blind: route a (older releases) 61 of 61 and 63 of 63 correct; route b
  "only point in range in the building" 38 right and 9 wrong (k = 3), so route b alone is low; route b medium rule
  (point within 1 m, outline of 25 points or fewer) 9 of 9.
- Catalogued (not changed): 18 duplicate values (4 rounded), 14 values not in OS Open UPRN, 14 more than 150 m from
  their point, 3 out of range, 31 text, 18 padded; F25: 114 venues in 10 layers a constant (-112, +54) m from their
  own UPRN point (theatres the opposite way), consistent with a missing OSGB36 / WGS84 datum change.
- Open: ask the GLA for the source .xlsx (the stored numbers keep every digit); hand checks of the 35 unknown venues
  as manual amendments with evidence; join the cultural venues to the registry from the amended copy (high and
  medium only); a position correction for F25 layers, after the owner agrees.

## 2026-10-04 London feed discovery (feed discovery agent)

- Owner asked for "a huge stash of London-related rss/Atom feeds". New tool `tools/discover-feeds.mjs` (pipeline
  activity `discover-feeds`, area feeds; stages seed, cc, autodiscover, verify, build) and skill
  `cwplans-feed-discovery`. Output `feeds/discovery/`: `candidates.json` (945 candidates from 18 methods),
  `london-feeds.opml` (414 live feeds), README. 179 verified zone feeds added to `feeds/events.json` as `disc-*`
  (124 -> 313 sources), with `harvest: false` except 2 event feeds, so `fetch-works.mjs` does not read news as programmes.
- The 61 feeds of the registry crawl: 38 verified, 17 live (newest item within a year); the rest empty, blocked or gone.
- Verified 594 of 945: news 303, business 183, council and public bodies 71, social 25, community forum 5, events 4,
  transport 3. Only 9 live feeds send CORS headers.
- Common Crawl CC-MAIN-2026-39 through the columnar index (the CDX server failed): 2,592 .london hosts and 8,157 .uk
  hosts with a London place in the name; 942 sampled; 755 pages about London; 277 feed URLs; 1,177 requests, 458 MB.
  First run: parallel column reads got 403 from CloudFront; now one request at a time with retries.
- Excluded with reasons: Facebook, Nextdoor, WhatsApp, X, Google Groups (no feeds, terms); Reddit and groups.io feeds
  (robots.txt; one exploratory Reddit request before robots.txt was read, recorded); JISCMail (Cloudflare challenge).
- Corrections found (F11 class, not changed in events.json): Time Out London has a feed (`/london/blog/feed.rss`);
  Southwark's ModernGov `mgRss.aspx`, listed as verified, is disallowed by its robots.txt, like six other boroughs'.
- Open: more Feedspot and ooh.directory categories; a larger Common Crawl sample or a second crawl; per-feed licence
  review before production; dedupe FeedBurner copies by final URL.

## 2026-10-04 crown halo by date, live state and London Datastore on the 3D page (overlay agent)

- Night: One Canada Square's halo takes the colour of the page clock's evening from `registry/sources/lighting/crown-lighting.json`
  (campaign, else dated observation, else neutral "not known"); `?t=photo` = #9d3f3c with the pyramid faces dark; apex light
  unchanged. Layers "Crown halo colour by date" (on by default in Night); record card, Sky panel and Layers say which. 725e470.
- Layers "Live state (snapshot)": hire bike docks, lift outages, NOTAM cranes (lit tips), H4 band 1,000-2,000 ft, EGR159 prism
  to 1,400 ft; tap = card with the snapshot time and the credit. f6d9bf4.
- Layers "London Datastore (GLA)": conservation areas, designated open space, safeguarded wharves (ground outlines), cultural
  venues (markers); card with the OGL credit and the GLA warranty line. 5e05cf4.
- Register: the page now loads crown-lighting.json, four feeds/live files and four london-datastore files (`shown_on` set).
- Fault F26 (arc centres listed as vertices in helicopters.json; the page draws the arcs). Lessons in the docklands-3d-page skill.
- Tests: four URLs x 1600 x 900 DPR 1 and 390 x 844 DPR 3, every layer on, no console error; numbers in the skill.
  check-fp16-shaders: prF 25 fragment uniform rows, 8 varyings (unchanged).
- Lost once: the first worktree (`scratchpad/wt`) was deleted by another agent mid-step; the edits were re-applied from scripts.

## 2026-10-04 London Datastore second walk: area from the data, a state for every dataset (London Datastore agent)

Owner: "No Open London Dataset Left Unexplored"; "Continue the walk. Also look into unknown area datasets - areas may
be specified within the data".
- Details walk finished: all 1,305 `/api/v3/dataset/<id>` records (0 archived, 0 hidden resources, geo as in the
  export); catalogue keeps kinds, md5 and the area words of each description (094a3eb).
- Zone references: `feeds/london-datastore/zone-codes.json` (ONSPD August 2026 postcodes in the box and the 20od9
  boundaries: OA/LSOA/MSOA 2001/2011/2021, wards 2011-2026, 20,315 postcodes); zone UPRNs (366,912) and TOIDs (65,589)
  in the raw cache (094a3eb).
- Probe (`tools/lds-probe.mjs`, `probe.json`): 671 open datasets with unknown, borough or London-wide metadata opened
  within written size caps; 558 read; 54 hold zone values (20 codes, 11 points, 3 postcodes, 1 UPRN, 19 place names);
  of the 190 open datasets with no area in the metadata, 20 have zone values. Rules were tightened after reading the
  first run (one place name or one publisher postcode is not enough; census table ids are not postcodes) (9e86ed9).
- Final state for all 1,305 in `triage.json` (sum checked by the tool): harvested 35, listed-for-harvest 219,
  not-relevant 539, not-open 346, deferred 142, unavailable 16, sensitive 8 (Fatal fires added to the sensitive titles).
- Harvested 18 more datasets clipped to the zone: town centres, Opportunity Areas, high streets, BIDs, LSOA/MSOA/ward
  boundaries, seven 2021 Census sets (zone ward and LSOA rows), heat demand (54,181 buildings), solar potential
  (55,261 TOIDs) (ff3e617); green roofs, urban heat island, LAEI 2019 focus areas, air quality annual objectives
  (this commit).
- Faults: F27 (metadata understates the area), F28 (Opportunity Areas GPKG geometry only), F29 (BIDs file name and
  Web Mercator, LAEI no .prj, encrypted HUDU workbook), F30 (solar map on 2012 LiDAR), F31 (WGS84 columns holding Web
  Mercator).
- Open: the backlog head in feeds/london-datastore/README.md; ask the owner about lift entrapment incidents (addresses)
  and the Assembly Member gifts register (named people); a streaming xlsx reader for workbooks over 20 MB.

## 2026-10-04 credits into the menu, window lock (credits and lock agent)

- 3D page: every credit over the city moved to Menu > About > "Credits and data licences" (grouped, licence and link each);
  the corner keeps "© OpenStreetMap contributors", shown when the model draws and folded to an (i) after 5 s or the first
  map interaction (OSMF Attribution Guidelines, interactive maps, revision 14786); toasts carry no credit. 6064852.
- Window lock on the 3D page, the atlas and What's on: viewport no zoom; no pinch, double-tap, ctrl+wheel, ctrl+plus or
  Safari gesture zoom; no pull-to-refresh or rubber-band; no drag-out; a dropped file never navigates (audio plays on the
  3D page); 3D page also no selection, callout or context menu outside fields. Atlas map credit folds the same way. 4405c42.
- Tests: CDP touch pinch on the old page gave visualViewport.scale 5, on the new 1; camera drag, pinch, pinch from a label and
  twist still move; drawer scrolls; no console errors at 1600 x 900 and 390 x 844 DPR 3. Lessons and the phone-only list in
  the docklands-3d-page skill, "Credits and the window lock".

## 2026-10-04 day photos and works in progress (construction agent)

Owner, 2026-10-04: "Several newly taken photos from middle of Greenland Dock Surrey Quays clipper pier, blue skies, calm
water, low wind, direct October sun. I am copyright holder but will CC0 them. Note the works in progress on far side of the
central tower - do we have an index of these?"

1. **Photos** (`docklands/reference/day-2026-10-04/`): the eight originals (no EXIF; exiftool shows the image size only),
   README with place, conditions, the CC0 dedication quoted, what each shows. New source `owner-photos-cc0`. Photo time from
   bitt shadows with `tools/solve-photo-sun.mjs` (new; camera fitted to four tower tops, rms 3.8 px, horizontal field 99.8°):
   about 11:30 BST, 11:05 to 12:10 BST (sun 150° to 168° true). Method in the docklands-sky skill.
2. **Index of works in progress** (`registry/sources/construction/`, `tools/build-construction-index.mjs`, skill
   `cwplans-construction`): 436 sites from 5,127 major Planning London Datahub records in 3,395 groups: on site 98 (S1 65,
   S1b 2, S2b 27, S4b 4), approved not started 112, completed recently 31, proposed 64, commenced long ago 131. By source:
   NOTAM cranes 7 sites (11 of 12 cranes), Street Manager 21, OSM construction 103 (57 OSM areas unmatched), brownfield 51,
   site allocations 107, Wikidata 241 (129 high), developer pages 2, owner photos 2. The photos: the "TIDE" core is
   **30 Marsh Wall** (Tide Construction for Vita Group, 48 storeys, PA/20/02588/A1, commenced 2025-10-03; core about 115 m OD
   in the photo), the "25 CUBA" wrap is **25 Cuba Street** (Ballymore with Penta, 52 floors, PA/20/02128/A1 + PA/24/00733/S,
   commenced 2025-09-01; about 80 m OD): two schemes, one line of sight (33.05° and 33.17° from the pier). Crawls (facts
   only) recorded in `facts.json`; the Tower Hamlets Idox register disallows crawling and was not fetched. New faults F32
   (commencements never closed), F33 (commencement lag, computed lapse dates), F34 (stale Wikidata "under construction"),
   F35 (point-marker polygons).
3. **3D page** (https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/?view=greenlandday&t=2026-10-04T11:30, Layers >
   Works in progress): status-coloured footprints, approved-height frames of thin edges, NOTAM crane masts, the built heights of
   30 Marsh Wall (core, about 115 m OD) and 25 Cuba Street (about 80 m OD) from the owner's photos; a record card per site; a
   credits group. New view `?view=greenlandday` matching the wide photo: landmarks within 4.0 px of 2576 (table in the
   docklands-3d-page skill). Tested headless: rotherhithe, greenland, pier, greenlandday and the default view at 1600 x 900
   DPR 1 and 390 x 844 DPR 3, no console error. First drafts that failed: see-through walls stacked into orange blocks; the
   built prism full-bright at night; a comment that cut a one-line block (caught by `node --check`).

## Open, in the order proposed

1. (Done: F2, F3, VA-2.)
2. F4: mall containers (CWG mall, OSM indoor areas) with levels; place mall occupants by mall.
3. F7: precision class and relation type on every position; no building placement from postcode centres.
4. Link records (method, distance, confidence) in the registry.
5. F9: per-mall level offset table.
6. F8: done for occupant links (QLever qualifiers); still to do: drop or mark former occupants in the registry itself, and company status dates.
7. Re-crawl the CWG directory and expire entries not seen.
8. Privacy limits: the owner approved removal (2026-10-03); the change was blocked by the environment's safety check. Waiting on the owner.
9. 3D: (skyline slider from the EA DSM series: done) add Wikidata inception and Tower Hamlets planning completions to it; live trains from TfL arrivals; Overture building heights where OSM has none. (Night texture: done.)
10. Mall levels: compare the Living Map venue levels (-4, -3, -2, -1, -1M, 0, M, 1, 2) and the AccessAble lift floors with OSM and CWG levels, as input to the F9 offset table.
11. Tunnel controls still unused: Blackwall Tunnel inverts (desk study), Silvertown Tunnel road levels (DCO sections), the Crossrail long section (digitised, licence not stated: ask the owner before committing).
12. CWG join leftovers: a mall container for Churchill Place (no outline names it); Wood Wharf outlines without
    addresses (13 street addresses match nothing); a postcode-to-building table; rename aliases (Museum of London
    Docklands); show bar, alcohol, education, health, sport, arts in the 3D glow menu.
13. Registers: a postcode-to-building table from OS Open UPRN (29 records wait on "postcode covers several buildings");
    merge ODS provider and site pairs (F20); CQC "HSCA Active Locations" columns for coordinates.
14. Methods: commit the one-off scripts named in `pipeline.json` `manual_activities` `gap` (facts.json quote check and
    FACTS.md, feeds/underground README, feeds README and EVENTS.md, pixel palette) when next run; pace
    `registry-wikidata.mjs` through `tools/lib.mjs` `qlever()`.
15. London Datastore: (backlog head harvested: town centres, Opportunity Areas, high streets, BIDs, census, heat,
    solar) next: Areas of Intensification, Biodiversity Hotspots, LGIF hex results; join heat and solar rows by TOID; join cultural venues by UPRN from the amended copy (high and medium; not `uprn_suspect`, F22) and brownfield sites by address into the registry.

## 2026-10-04 — AIS priority list (coordinator)
- Owner named four AIS sources for the priority list: Open Waters AIS, Kystverket/BarentsWatch, US Marine Cadastre/NOAA,
  Global Fishing Watch. Added a "Priority list" section with licence fit and coverage to the cwplans-river-and-water skill
  and to feeds/river/README.md. Nothing fetched yet. Open Waters first: check UK coverage, terms, per-event source filter.

## 2026-10-04 — Tower Bridge lift times: terms checked (river layer agent)
- towerbridge.org.uk: /lift-times redirects to /bridge-lifts; robots.txt 404. Legal statement clause 2.5 forbids scraping
  and text or data mining; clause 5.3 forbids reuse of data. Not fetched; recorded in feeds/feeds.json
  (tower-bridge-lifts), feeds/live/README.md backlog, the river and live-state skills. Waiting on the owner.

## 2026-10-04 — Open Waters AIS (priority list item 1)
- Read the Open Waters AIS terms (site, API docs, aiscast README, policy, limits, contributor agreement): licence per
  event (`source`, `license`, `attribution` on each), no key for the anonymous tier, CORS `*`, 120 HTTP requests a
  minute, 2 streams, 100 square degrees. Quotes and the CC0-per-reception / ODbL-aggregate reading: river skill, "AIS: Open Waters".
- Coverage of the zone envelope is good but not open: snapshot 107 vessels (aishub 95, aisstream 9, CC0 3 virtual AtoNs);
  15-minute curl listen 1,166 events / 56 vessels, 10-minute tool listen 813 events / 53 vessels, all AISHub or
  aisstream.io, latency p50 69 s. HANSEATIC SPIRIT (215973000) seen moored at HMS Belfast, source aishub.
- New tool `tools/fetch-ais.mjs` and `feeds/river/ais.json`: kept 3 CC0 aids to navigation, 0 vessels; would gain 78
  non-private vessels if the owner accepts AISHub and aisstream.io (counts only). Raw runs gitignored (`data/raw/ais/`).
- No page layer: it would show no ships under the rule. Owner decisions: AISHub events (Open Waters reports a written,
  revocable AISHub assurance); or a receiver of our own fed to Open Waters (CC0). No new fault.

## 2026-10-04 — aiscatcher.org community network (owner's lead: "M7AZV River Thames AIS")
- robots.txt of aiscatcher.org disallows `/api/`, `/hub/`, tiles and search for all, and the whole site for ClaudeBot
  and other AI agents: only robots.txt was fetched. Station facts (id 1370, about 51.47,-0.13, max range 32.1 nm) from a
  web search result. No data licence: the site says data is the operator's, "no license, no terms of use". Not used.
- M7AZV is not an Open Waters station. Open route: the operator adds the Open Waters output (CC0, kept by
  `tools/fetch-ais.mjs` unchanged) or states a licence; the owner decides whether to ask. No data file, no new fault.

## 2026-10-04 — River layer on the 3D page and River view in the atlas (river layer agent)
- 3D page: Menu > Layers > River (`docklands/river-layer.js`, seven one-line hooks in index.html): river-bus piers,
  routes and boats by timetable for the page clock (live TfL arrivals only after a tap), lock badges (tide window from
  the EA gauges, red on a CRT closure), PLA notice outlines on the water, swim-water chips (Eden Dock, Royal Docks at
  the east edge), OSM moorings and houseboats, PLA visitor moorings, named ships labelled, Thames Barrier banner in the
  Layers section and the Sky panel, Tower Bridge card (lift times not copied: terms). Credits block "River and water".
- Atlas: #river lists the 12 river snapshots with dates and sources; #map layer "River snapshots".
- Tests (SwiftShader WebGL): rotherhithe, greenland, pier x 1600x900 DPR 1 and 390x844 DPR 3, layers on and off, plus
  the map view: no console error; mean luma on/off 0.094/0.094, 0.067/0.067, 0.090/0.088, 0.066/0.066, 0.114/0.111,
  0.080/0.080; red share unchanged within 0.005 points. Cards, lock states for 4, 11 and 15 October, banner and live
  correction (TfL response fixture) checked. No shader changed.
- data-register.json: river-layer.js entry; shown_on and page loads for the river snapshots.

## 2026-10-04 — Locate button on the 3D page and the atlas (locate agent)
- 3D page (https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/): `docklands/locate.js`, round button at
  the bottom right: tap = permission (only on the tap) and centre on a blue dot with its accuracy circle; tap = turn with
  the compass (beam on the dot); tap = stop turning; a drag or any other camera move = located, dot kept; hold = off. Eye
  button in heading mode: camera at ground + 1.6 m, yaw and pitch from the phone. Outside the model box: distance and
  direction, "Show where I am" (nearest edge, looking towards the person). Commit cc1ebabc.
- Atlas (https://danbri.github.io/glitchcan-minigam/magpie/cwplans/atlas/#map): the same button as a Leaflet control
  (dot, accuracy circle, centre, follow, hold = off). Commit e78a8671, which also fixed a tap swallowed after a hold.
- Transform: the page's `geo()`; checked against proj4 BNG within 2 m. Grid convergence -1.55 degrees applied to headings.
- Privacy: the position is not sent, stored or put in the URL (About > Your location; under the atlas map).
- Tests: 3D page 29 + 28 checks (1600x900, 390x844 DPR 3), atlas 9 x 2, all pass; method and what needs a real phone: skill
  docklands-3d-page, "Location and heading". No data file, no shader, no new fault. Register entry for locate.js was
  added by the construction agent.

## 2026-10-04 — AIS: owner accepts AISHub and aisstream.io for scoping
- Owner: "Accept AISHub (and perhaps aisstream) events for scoping. Sounds fine. Flag it somewhere for review as we
  scale. Add to live by default now." `tools/fetch-ais.mjs` keeps them (class `scoping-accepted-2026-10-04`); small
  private craft still counted only. `feeds/river/ais.json`: 82 items (79 vessels, 3 CC0 AtoNs), 21 pleasure craft counted;
  HANSEATIC SPIRIT (215973000) moored at HMS Belfast, source aishub.
- Review flags: `review` on the ais.json register entry and items; sources `aishub-via-openwaters` and
  `aisstream-via-openwaters` with `review`; "Review before scaling" in the river skill and feeds/river/README.md. The
  CLAUDE.md bullet was not written by this agent (an agent message cannot authorise a CLAUDE.md change): for the owner
  or the main session.

## 2026-10-04 — 3D page: Ships (AIS) layer, on by default
- `docklands/ships-layer.js` + three lines in index.html (script tag, draw `OV.ships` lit like the ground, init). On load:
  committed `feeds/river/ais.json`, then the live Open Waters `/v1/vessels` snapshot from the browser every 60 s while
  visible (doubling pause on errors, up to 16 min). Private craft filtered in the page; record card; credits.
- Tests (SwiftShader, live fetch mocked with the 11:22 snapshot): default, rotherhithe, greenland, pier x 1600x900 DPR 1 and
  390x844 DPR 3: no console error, 60 drawn, 21 private craft not shown, 27 outside the box, HANSEATIC SPIRIT drawn alongside
  HMS Belfast. One real fetch: 62 drawn, card correct (moored, 139 m, HAMBURG, source aishub).
- Fault found and fixed before push: at full brightness the white hulls glared in the night photo views (Rotherhithe):
  drawn with the ground's night dim (max(nDim, 0.35)) now.

## 2026-10-04 — Open-data portals walk, batch 1: data.gov.uk and planning.data.gov.uk
- New tool `tools/walk-portals.mjs` with adapters `tools/portals/{dgu,pdg,index}.mjs`; new skill
  `skills/cwplans-open-portals/`; outputs in `feeds/portals/`; raw cache `data/raw/portals/` (gitignored).
- data.gov.uk: all 59,451 datasets read (63 requests); 25,492 in scope (S1 260, S2 23,863, S3 GLA 1,365, S4 4).
  Final states: not-relevant 9,035, walked-elsewhere 5,121, not-open 4,809, unavailable 3,199, deferred 1,991,
  listed-for-harvest 1,257, sensitive 72, held 8. Rule fixes from reading the first run: "Poplar" (a tree) matched the
  zone place list; short slugs matched project prose as held; airport and rail "safeguarding" areas read as sensitive;
  deleted records kept resources. Committed: catalogue 1.8 MB, triage 2.4 MB.
- planning.data.gov.uk: 222 datasets, zone counts by spatial query (478 requests). Harvested 26 (7.1 MB): listed
  buildings 1,769 and outlines 1,557, Heritage at Risk 58, Article 4 areas 344 (all directions, not only
  office-to-residential), area TPOs 141, EA flood zones 824 (cut at the box: 5.5 MB to 1.2 MB), AQMAs, LNRs, NSIPs
  (Silvertown Tunnel, Tideway, Heat Main), Greenwich section 106 agreements, plan records. Held 11, not-relevant 79,
  unavailable 106.
- Next: borough portals, Nomis and ONS Open Geography, national APIs; a service probe for the data.gov.uk backlog.

## 2026-10-04 — London Datastore: rule-driven harvest of the 219 listed datasets (batches)
- New tool `tools/lds-harvest-auto.mjs` (plan, run, register, index, zone-names): resources picked by written rules,
  every row read (CSV streamed, ExcelJS for large xlsx, SheetJS for xls/ods), zone rows by codes (any vintage, plus
  00BGGG wards and E36 merged wards from `refs-old-wards`), postcodes and sectors in profiled columns, UPRNs, TOIDs,
  coordinates, and station / town-centre names for datasets keyed by them; outcome per dataset in
  `feeds/london-datastore/harvest-log.json`, which triage reads (F8b no zone rows, F10b unreadable, F7 documents).
- Batch 1 (ranks 1-30): see the commit; sizes and outcomes in harvest-log.json. Big outputs cut by hand rules (housing-led
  projections: persons and components sheets; noise: Lden only).
- Joins and pages: `tools/join-lds.mjs` -> `registry/sources/lds/building-links.json` (heat 1,308 and solar 1,266 links
  by TOID, venues by UPRN 11 high + position, records by position, area of all 1,129 buildings) and `area-context.json`;
  `feeds/london-datastore/lds-building.js` renders them in the atlas dossier and the 3D page card. Atlas: new view
  "London Datastore" (#lds) with final-state counts, datasets by theme, a map layer per dataset or per theme. Faults
  F36-F41 catalogued. Tests: atlas #lds, map layer and dossier at 1600x900 DPR 1 and 390x844 DPR 3; 3D rotherhithe,
  greenland, pier at both sizes: no console error, screenshots looked at.
- Batches 1-9 done (223 datasets run): harvested 183 (143.6 MB), no zone rows 26, documents only 3, not readable 1,
  deferred by hand 6 (2r401, 2ry01, emxjy, epr1g, exynl, v8o0m; reasons in harvest-log.json), held for the owner 4
  (2g980, em8xy, 24r65, 2ogkn; e68wz stays deferred F3c). Final states of the 1,305: harvested 219, listed 4,
  not-relevant 565, not-open 346, deferred 147, unavailable 16, sensitive 8. Joins rerun on the final index: other
  point records 73 links on 35 buildings (was 31). Trap: a local `.git/info/exclude` rule hid `registry/sources/` from
  `git add`; use `git add -f` for the join outputs and check `git status --ignored`.

## 2026-10-04 — Open-data portals walk, batch 2: borough portals, Nomis, ONS Open Geography, national sources
- Adapters `tools/portals/{boroughs,nomis,onsgeo,national}.mjs`; skill `cwplans-open-portals` extended; faults F42-F44.
- Boroughs (662 requests): City of London map service 176 layers (licence per layer from its data.gov.uk INSPIRE
  records: OGL 35, OS INSPIRE end-user 34, none 94; F42), harvested 27 open layers in the zone (St Paul's Heights,
  Historic Land Use, cultural spaces with geometry withheld F43, cycleways, stations, safeguarding areas...). Tower
  Hamlets hub: no licence named; same layers held from planning.data.gov.uk. Southwark and Greenwich observatories:
  one Esri UK InstantAtlas library of 16,897/16,898 national indicators (walked-elsewhere 29,797, not-open 3,968, no
  council-own open indicator). Lewisham JKAN: EV charge points harvested; FixMyStreet and Commonplace deferred (written
  by residents). Newham: no portal of its own.
- Nomis: robots.txt disallows the API (two requests went to it before robots.txt was read; the answer was deleted);
  20 Census 2021 topic summaries harvested at OA from the bulk zips for the 1,509 zone OAs (1.5 MB); 54 listed.
- ONS Open Geography: 2,630 items; harvested OA 2021 polygons with rural-urban class, OA and LSOA centroids, the OA
  lookup, workplace zones 2011, wards May 2026 (1.9 MB); listed 426, not-relevant 2,023.
- National: DfT AADF 222 count points; STATS19 aggregates (10,363 collisions by LSOA x year x severity; F44: the
  LSOA column holds 2021 codes); police.uk 80,432 crimes aggregated to 2,782 snap points x 14 categories and by
  month; DESNZ electricity and gas by LSOA/MSOA 2010-2024 (2.0 MB). Ofcom refuses scripts (403).
- Size of batch 2: 7.6 MB harvests + 2.1 MB catalogues and triage. feeds/portals/ total about 21 MB.

## 2026-10-04 — Open-data portals walk, batch 3: all Nomis tables, OS Open Names and Open Rivers
- Nomis: every Census 2021 topic summary now harvested at its finest level (68: 52 at OA, 16 at MSOA; 3.7 MB);
  5 published from local authority up only; TS079 zip unreadable. F45: TS010's OA and LSOA CSVs are empty (0 bytes).
- OS Open Names: 4,066 named places, roads, stations, schools and waters in the box (postcode entries left out: held
  from ONSPD), 1.7 MB; OS Open Rivers: 34 features. GB downloads deleted after reading (disk was 1.9 GB free).
- data.gov.uk service probe running (WFS hits and ArcGIS counts in the box for the 387 listed datasets with a service).

## 2026-10-04 — Open-data portals walk, batch 4: data.gov.uk service probe and harvest; gzip rule
- `dgu probe`: 384 listed datasets with a map service, 876 requests: 208 with zone features, 110 none (not-relevant
  T7b), 66 errors. 14 harvested from it (1.9 MB): blue-space access points, Defra noise important areas and rail noise
  Lden round 3, EA rivers-and-sea flood risk extents, flood warning areas, recorded and historic flood outlines, main
  rivers, hydrometric points, TE2100 water-level nodes, water recreation, Natural England priority habitats and
  priority ponds, the Thames Path. Road noise, Living England, surface-water flood risk: available on request (size).
- National: IMD 2025 (File 7) for the 318 zone LSOAs.
- Coordinator's size rule applied: files over 1 MB now written gzipped by the tool; six existing files converted
  (dgu catalogue and triage, DESNZ energy, OS Open Names, EA flood zones, listed building outlines: 9.0 MB to 1.7 MB).

## 2026-10-05 — Bulk extracts moved to danbri/londat
- The owner created https://github.com/danbri/londat for bulk open-data extracts (main repository near the GitHub
  Pages 1 GB limit). Moved 400 data files, 189.7 MB: `feeds/london-datastore/` (237 files, 172.1 MB) and
  `feeds/portals/` (163 files, 17.7 MB), same paths under `cwplans/` in londat. `.js` code and READMEs stay here.
  Other files over 1 MB stay (first-load page data, owner photos, registry inputs): rule in the curation skill,
  "Data hosted in danbri/londat".
- londat has a README (licences per folder, "The GLA cannot warrant the quality or accuracy of the data", OSM
  attribution for the two cultural-infrastructure UPRN files), LICENSE-DATA.md (no blanket licence), `.nojekyll`
  and `cwplans/data-register.json` (copy of the 400 hosted entries and 383 sources, written by the check tool).
- Register: `"hosted": "londat"` on the 400 entries; `check-data-register.mjs` checks them in the londat checkout
  (`LONDAT_DIR`). Tools: `tools/londat.mjs` (`cwPath`); walk-london-datastore, lds-harvest-auto, join-lds, amend-uprns,
  build-construction-index and walk-portals read and write the londat checkout. Pages: `data-base.js` (`CwData.url`,
  one constant `DATA_BASE`), used by the atlas and the 3D page.
- Base in use: https://raw.githubusercontent.com/danbri/londat/main/cwplans/ (GitHub Pages is not on for londat;
  https://danbri.github.io/londat/ gave 404 on 2026-10-05). Switch `DATA_BASE` to Pages when it answers.
- Tests (headless Chromium, SwiftShader, local server, 390x844 @2 and 1280x800 @1): 3D page overlays from londat
  (wharves 10, open space 623, conservation areas 118, venues 662), building card cwb-0001 with heat, solar, 2021
  Census and the GLA statement; atlas London Datastore view 214 datasets, 229 file links to londat, the "Heritage and
  views" theme mapped (4 layers), dossier cwb-0001 with heat, solar, Census. No HTTP errors, no console errors, no
  request to the old paths. All 400 files answer 200 on the raw base.
- Offline tool check: `lds-harvest-auto.mjs index` and `walk-portals.mjs index` rebuilt identical indexes in the londat
  checkout (only the date changed; not committed). `walk-london-datastore.mjs triage` reads the same file set as
  before; its output differs from the committed triage.json in `have` counts because that file is older than later
  repository edits, not because of the move (not committed).
- Not done: gzip of the 40 London Datastore files over 1 MB (their tools read plain JSON). History not rewritten
  (owner decision): the old blobs stay in the pack.

## 2026-10-05 — photo view reconstruction: the owner's aircraft photo, ?view=plane, the docklands-view MCP (plane-view agent)

- The owner's evening photo through an aircraft window (`docklands/reference/plane-2026-10/`, owner-supplied; CC0 not yet
  asked; no EXIF; date assumed 4-5 Oct). Identified by overlaying the model's OSM water outlines on the photo: Canary Wharf
  from above (Newfoundland, Landmark Pinnacle, One Bank Street), Limehouse Reach, Greenland Pier, Greenland Dock, the South
  Dock marina, the Surrey Quays car park, the Rotherhithe north shore at the right edge.
- Camera solved (new `tools/view-mcp/solve.mjs`, Levenberg-Marquardt on 2 tower tops, Greenland Pier, 32 shoreline pixels as
  distances to the projected outlines, 12 horizon pixels): eye 51.5125 N 0.0161 W over Poplar, about 800 m (+-50), line of
  sight 225.3° true, pitch -13.6°, roll +9.2°, horizontal field 56.9°, rms 4.8 px. Hold-outs: right-edge shore rms 7.7 px
  (pass); Greenland Dock west end 16 px; Sir John McDougall Gardens 41 px (fail: misidentified, left out).
- Time from the bright sky under cloud: about 17:40 BST +-40 min if 4-5 Oct. Not on the LCY runway 09 final (360 m too high,
  650 m north); fits a westbound aircraft's left window, unproven.
- Page: `VIEWS.plane` with a roll (`rolledUp`); https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/?view=plane&t=2026-10-05T17:40
- New skill `photo-view-reconstruction` (docklands/skills/), MCP server `docklands-view` (`tools/view-mcp/server.mjs`, .mcp.json;
  `node tools/view-mcp/test.mjs` passes 17 checks); pipeline activity `solve-photo-view`; register entries for the 5 files.

## 2026-10-05 — 3D page navigation: momentum (step 1 of 3)
- `docklands/nav.js` (new, loaded after `locate.js`): momentum after a drag, pinch or twist; time-based decay (TAU 0.35 s);
  stopped by a touch, the wheel, reduced motion, the locate follow modes and any other camera mover. Skill
  docklands-3d-page, "Navigation: momentum, ground limit, share". Tests 7/7 (1600 x 900) and 8/8 (390 x 844 DPR 3, touch).

## 2026-10-05 — KML and KMZ on the 3D page and the atlas
- Owner: "Also look into basic KML support". New: `docklands/kml.js` (shared reader and writer, no dependency: DOMParser,
  zip central directory + DecompressionStream for KMZ, plain-text descriptions), `docklands/kml-layer.js` (3D page: Menu >
  Layers > My KML; file picker, drop, `?kml=`; record cards; Go to view; Export view as KML) and `atlas/kml-atlas.js`
  (Layers box: open, drop, export the layer in the map window). Three one-line hooks in `docklands/index.html`, one in
  `atlas/index.html`. Register entries added. Supported subset, limits and test numbers: skill docklands-3d-page, "KML".
- Exports carry their credits in the Document description; OSM-derived geometry (building outlines, OSM construction
  footprints, OSM river positions) is marked "© OpenStreetMap contributors, ODbL 1.0" per placemark. AIS ships are not
  exported (licence under review). Nothing is uploaded: visitors' files stay in the browser.

## 2026-10-05 — 3D page navigation: ground limit and pass into Below ground (step 2 of 3)
- `docklands/nav.js`: the eye stays 1 m above the LiDAR ground or water at its own position (soft wall, momentum damped);
  a push of 0.6 s or 480 px clicks (vibrate 15 ms; a ring and a line on iOS) and passes into Below ground; the same back up.
  One hook in index.html: the drag's pitch limit is `DocklandsNav.pitchMin()` (-1.35 below ground). Tests 8/8 at both sizes.

## 2026-10-05 — 3D page navigation: Share this view (step 3 of 3)
- `docklands/nav.js`: Menu > "Share this view" builds a link whose hash (v=1) holds the camera, field and roll, view,
  Night, clock, Below ground, every Menu checkbox, radio, select and range not at its default, and the record on the card;
  system share sheet on touch devices, else copied with a toast. Restored on load; `#at=` unchanged; the visitor's
  location is never put in the link. Hook in index.html: `__docklands.selected`. Tests 9/9 at both sizes.

## 2026-10-05 — KML sources for the zone (kmlsrc agent)

- Owner question: "Can you find any kml resources for the area?" New tool `tools/find-kml.mjs`; catalogue of 40
  entries in `feeds/kml/catalogue.json` and `feeds/kml/README.md`: 8 native KML/KMZ files, 12 zone-clipped copies,
  20 looked at and not usable (reason per entry). Licence classes: 18 OGL, 2 CC BY, 5 share-alike, 3 restricted,
  8 none, 4 per item.
- Native, open by URL (CORS *): GLA schools 2016 KMZ (163 in the model box), GLA wards 2014 KML (66), BIDs 2024 KML zip
  (7), Curio Canopy (share-alike: link only). Copies in danbri/londat `cwplans/feeds/kml/` (OGL): TfL cycle routes,
  river piers, river services; National Cycle Network (contains OSM, registered osm derived); CRT locks; Thames Path;
  listed buildings; World Heritage Sites; Heritage at Risk; parks and gardens; conservation areas; wards in the zone.
- All 17 `?kml=` links tested on the live page headless (390 x 844): every file opened and drew. Example KML buttons
  added to My KML (kml-layer.js), tested at 390 x 844 DPR 3 and 1600 x 900 DPR 1, no console error.
- Blocked: ArcGIS Hub KML downloads (generated on request, 202/404), hosted feature layers (no KML), planning.data.gov.uk
  (no KML), BGS and Open Plaques (robots.txt). `tools/londat.mjs` HOSTED_DIRS gains `feeds/kml/` (catalogue and README
  stay here). Skill: cwplans-open-portals, "KML sources".

## 2026-10-05 — 3D page: KML visible at any zoom, fly to fit, Show, KML sources panel (kmlvis agent)
- Owner (iPhone): "in general in the default view of a newly loaded KML view it is pretty hard to see anything at all. Can we
  pull the KML table of datasources function into the app too?" and later the "Show" request.
- `docklands/kml-layer.js`: lines and outlines as screen-space ribbons (at least 2.5 CSS px, dark halo, colour lifted for
  contrast); points as constant-size pins with clusters on a 2D canvas; names on the canvas when few; fills 0.15 to 0.35.
  Fly to fit after every load; Show (grow, colour cycle, float, walls) once after the flight and from the toast and the file
  row. Toast shorter and clear of the locate button. KML sources panel from `feeds/kml/catalogue.json` (Open / Link only /
  Not usable, licence chips, text filter). `docklands/index.html`: two hooks in `render()`, `gl`, `cv`, `MVP`, `PROJ` in the
  KML context, toast CSS, `<link rel="icon" href="data:,">` (the load-time 404 was /favicon.ico).
- Measured (fitted view, 390 x 844 DPR 3): pixels changed by a file went from 0.001% to 0.14% (piers, Thames Path) to 2% to
  3%; listed buildings 0.10% to 12% (clusters). No-KML photo views and Night: same mean luma as before. Skill:
  docklands-3d-page, "KML". No new data files.


## 2026-10-05 — KML sources button (coordinator)
- Owner: "Button". Added a "KML sources" button in the menu's views group (after "Share this view") and in the My KML row; both open the drawer on Layers, open the KML sources list and scroll to it (kml-layer.js). First attempt inserted before #shareOut, which is not a child of the button's parent: the module threw and DocklandsKML was undefined; the headless test caught it. Tested 390x844 DPR3 and 1600x900: list open, 40 rows, no console errors.

## 2026-10-05 — londat cache: SQLite history, latest.json for the pages, zone.gpkg (cache agent)
- Owner: "Now we have londata repo are we caching more fetches there and preloading? If not, we should! Sqlite files would
  be a simple start. Keep trying". New tools `tools/cache-londat.mjs` (runs fetch-live, fetch-river levels/river-bus,
  fetch-ais --listen=0 with their politeness, plus TfL line status and Open-Meteo current; appends to an SQLite per
  UTC month with node:sqlite) and `tools/build-zone-gpkg.mjs` (ogr2ogr; 163 layers, licences from the register).
- In londat: https://github.com/danbri/londat/blob/main/cwplans/cache/live-2026-10.sqlite (565 kB: 4 Oct snapshots
  and one live run on 5 Oct), `cache/latest.json` (46 kB, 13 kB gzipped), `cache/zone.gpkg` (67.9 MB; validate_gpkg.py
  passes after 59 empty geometries were set to NULL), and `.github/workflows/cache-live.yml` (hourly at :17; the push
  was accepted; starting it by API answered 403).
- Measured: about 22 kB per hourly run; 48 simulated commits packed to 683 kB. Pages: `live-cache.js` (CwLive); the 3D
  page and atlas live panels read the cache first, with a "Live" tick box for the publishers' APIs; third-party
  requests on "Load live data" 7 to 2 (3D page) and 6 to 2 (atlas). No console errors at 390 x 844 DPR 3 and 1600 x 900.
- Register: hosted entries `cache/live-*.sqlite` (check-data-register.mjs now accepts a `*` family), `cache/latest.json`,
  `cache/zone.gpkg`, `live-cache.js`; pipeline activities cache-londat and build-zone-gpkg; HOSTED_DIRS `cache/`.
  Skill: cwplans-londat-cache.

## 2026-10-05 — Drone (drone agent)
- Owner: a first-person "virtual drone" that flies in tunnels, works as a boat, copter or plane, with sensible defaults,
  autopilots that give way to input, and very fast acceleration. New `docklands/drone.js` (six vehicles: copter, plane,
  boat, tube, walk, under); `docklands/index.html`: hooks `tunnelY`, `par`, `tidalField`, and `cam.near` / `cam.far` read
  only when `cam.eye` is set; `docklands/nav.js`: Share this view carries `dr=`. Menu > "Drone"; `?drone=<mode>`.
- Measured (headless Chromium, SwiftShader WebGL, simulated time): every vehicle moves under autopilot from the Canary
  Wharf view (20 s: copter 206 m, plane 655 m, boat 94 m, tube 246 m on the Jubilee line, walk 28 m, under 130 m);
  input sets the autopilot share to 0, it stays 0 for 3 s and is back at 1 after 4 s; boat 60 s: height error 0.000 m
  from the water surface + 2 m, never closer than 24 m to the bank; tube 60 s: at most 0.001 m from the tunnel centre
  line (the page's tunnelY + 3 m), cut set to -11 m OD with the gauge open; walk Westbound platform 1 (level -3) to Rituals
  (Jubilee Place, level -2) in 155 s; copter flown at One Canada Square at 80 m with boost and dived at its roof: 0 of
  700 samples inside a building, stopped at the wall and at roof + 2 m; boost 32 -> 295 m/s in 2 s, back to 32 by 7 s;
  2 vs 60 fps: the same end point to 0.000 m for copter, plane, boat, tube; share round trip: boat restored to 0.05 m.
  Phone 390 x 844 DPR 3 (CDP touch): stick forward 28 m/s, look drag turns, two-finger lift climbs, Boost x 9.3 after 1 s,
  a tap sets the target, pinch scale 1, the select switches to boat, the cross exits. Reduced motion: no roll, boost
  x 3.75 of 4. Views with the drone off (drone.js blocked vs loaded; rotherhithe, greenland, plane, cw at 800 x 500):
  mean absolute difference 0.3 to 1.1 of 255 (live layers and the clock). No console errors.
- Fixed while testing: the copter started 0 to 14 m from a 159 m tower and could not move forward (start now 25 m over
  the roofs within 60 m); the drone's top bar sat under `#top` on a phone (moved 60 px down). Skill: docklands-3d-page,
  "Drone". Register: `docklands/drone.js` (code).


## 2026-10-05 — londat cache: sizes fixed after the coordinator's check (cache agent)
- Coordinator: a growing binary SQLite committed hourly could add several GB a month; zone.gpkg (68 MB) is over GitHub's
  50 MB warning. Changed: each run now writes only its new rows as `cache/runs/<day>/live-<time>.json.gz` (10.1 kB on a
  real run; about 25 kB a commit with latest.json, measured with `git count-objects`); the month's SQLite is written
  once by the first run of the next month (tested on a copy) and its run files removed. Projection: about 18 MB per 30
  days of hourly commits plus about 8 MB for the closed month. The first live-2026-10.sqlite became a seed run file.
- GeoPackage split: zone-core.gpkg 16.9 MB (17 layers), zone-lds.gpkg 38.0 MB (82), zone-portals.gpkg 13.2 MB (64);
  validate_gpkg.py passes on all three. The single zone.gpkg was removed (it stays in londat history, about 65 MB).
- check-data-register.mjs: a `*` may stand in a folder name; `"may_be_empty": true` for a family with no file yet.

## 2026-10-05 — what people built from TfL's axonometric station diagrams (research agent)
- Owner: "Do a deeper search to see what people have done (even if license unclear) using these resources as a
  baseline" (the 2015 FOI axonometric sheets; we hold Canada Water and Canary Wharf in londat third_party/tfl/am3d).
- New `feeds/underground/axonometric-uses.json` (54 entries) and `feeds/underground/AXONOMETRIC-USES.md` (ranked table,
  what it means for our modelling, gaps, sites not read). Links and facts only; no model or image copied.
- Found: no open 3D model, glTF or game level says it was made from the sheets. The only derived data: two OSM platform
  ways at Gloucester Road tagged `source=TfL axonometric` (changeset 178320189, 2026-02-09); one Baker Street note cites
  the redacted sheet. Canada Water has real OSM indoor mapping (Weltstaat 2018: corridors, rooms, doors; platforms at
  levels -2 and -3); Canary Wharf has platforms, 26 lifts and 114 step ways but no indoor ticket hall. Independent 3D
  work: Andrew Godwin's Station Viewer (2012, 8 stations incl. Shadwell, West Silvertown; CC BY-NC-SA), Station Master's
  surveyed 3D maps of all 270 Tube stations (app, all rights reserved), LT Museum JLE models of both our stations.
- Not read (robots.txt or a challenge): ianvisits.co.uk, architectsjournal.co.uk, brixtonbuzz.com, railforums.co.uk,
  x.com, reddit.com, skyscrapercity.com (robots.txt); whatdotheyknow.com, archpaper.com, tfl.gov.uk (challenge).
- Register: source `axo-uses-search-20261005`; both files `osm.use: ids`. check-data-register exit 0.

## 2026-10-05 — Blender station box models of Canada Water and Canary Wharf (Blender agent, Opus)
- Owner: "Use the sheets as a layout guide to model the station boxes ... Use Blender via its MCP running in your
  virtual machine. Take a screenshot of your work every 10 seconds ...".
- Blender 4.0.2 (apt) under Xvfb with the blender-mcp add-on (mcp-for-blender 2.1.8, MIT); every step sent through
  the MCP's execute_blender_code from `tools/blender-stations/`. New skill `blender-station-models`.
- Models: one collection per station, 67 and 78 objects, materials by class, `uncertainty` on every object.
  Levels: Canary Wharf JL rail -15.6 (TfL FOI), platforms -14.6, hall -3.1 and mezzanine 3.0 (judged), street 8.4
  (sheet 23.0 m); Canada Water JL rail -13.3 (TfL FOI; sheet and Wikipedia recorded), ELL platforms -5.6
  (Wikipedia 11 m, the page control; sheet 8.0 m), hall 0.9 (judged), drum 25 m centred on the OSM arc.
- Deliverables in danbri/londat `third_party/tfl/am3d/models/` (stations-blend.zip, stations-exports.zip with glb,
  obj, fbx, stl, usdc; making_of.zip with 102 captures, timelapse, contact sheet, scripts); index
  `feeds/underground/station-models.json`; register: source `tfl-am3d`, pipeline activity `blender-station-models`.
  check-data-register exit 0. No 3D page layer (no glTF loader in the WebGL1 page; skipped).

## 2026-10-05 — Station models on the 3D page; making-of again at 5 s (Opus)
- Owner: "Please redo zips but making of can be every 5 seconds", then "I expected you to create or use the relevant
  loader / converter. Full and correct integration may require iterative tweaking of the model and its scaling".
- Zips made again (londat f94783a): the same step scripts replayed through the MCP with a 5 s capture loop (68 captures,
  19:45 to 19:51 UTC). Geometry equal to the first build (same triangle counts, 0.000 m vertex difference in the STLs).
  `feeds/underground/station-models.json` has the new sizes and hashes.
- New converter `tools/build-station-mesh.mjs` (GLB read with no library) -> `docklands/data/stations.json` (127 parts,
  22,480 triangles; text labels, 79,572 triangles, left out; 416 kB, 86 kB gzipped). New layer `docklands/stations-layer.js`
  (Layers > Show > Station models, on), drawn with the page's own program `pr` and `Mesh` (flat shaded by `shade()`).
- Measured against the page: Jubilee rail levels agree (Canary Wharf -15.6 both; Canada Water page -13.5, model -13.3).
  The page's OSM indoor floors are at level x storey: Canary Wharf platforms -1.7 m OD against the model's -14.6
  (12.9 m high); Canada Water -9.4 and -6.6 against -12.3. So, with the models on, the page cuts its own tunnels
  (Liang-Barsky) and OSM indoor floors out of five rectangles (station boxes and hall volumes, +1.5 m), and the walking
  network (`vY`) and drone Walk (`vpos`) take OSM levels -3/-2/-1 to the model's floors inside the boxes. Drone Walk on
  the Canary Wharf platform: eye -13.0 m OD (was -0.7). Model tunnel stubs are not drawn: the page's tunnels run to the
  box faces.
- Finding, not fixed: `data/sourced-levels.json` `cw-ell-platform` is a platform depth (Wikipedia 11 m) but the page uses
  it as the Windrush tunnel floor (rail), so the page's Windrush tunnel there is about 1 m high against the model (rail
  -6.6, platform -5.6). A step of about 0.8 m shows at the slot ends.
- Tests (headless Chromium, SwiftShader WebGL): rotherhithe, greenland, pier, ?night and the default view at
  1600 x 900 DPR 1 and 390 x 844 DPR 3 touch: no console error; mean luma equal with the layer on and off to 4 decimals
  (the stations are hidden or a few pixels in those views); a mouse click and a touch tap on a station part open its
  card. Close views: see the skill. Register entry `docklands/data/stations.json`, pipeline activity `station-mesh`;
  check-data-register exit 0.

## 2026-10-05 — Blue only for water on the 3D page (Opus)
- Owner (screenshot of Canary Wharf, cut at 39 m OD): "What are the delicate light blue / cyan lines?", then "Yes please and
  do try to keep blues for water-related". They were OSM ways with a level tag drawn in the indoor-corridor colour, most of
  them outdoor deck paths.
- `tools/build-docklands.mjs`: indoor items get `out: 1` for outdoor level-tagged paths and steps (580 of 1,689); rebuilt
  `docklands/data/under.js` (only that field and the build date changed; `area.js` left as it was, only its date differed).
- Page colours: indoor corridors pale lilac, outdoor level paths sand, network lifts grey, glow Shops lime and Sport tan,
  building ramp magma, station-model parts warm or grey. Details: skill docklands-3d-page, "Colours: blue is for water".
- Tests (SwiftShader): owner's view cyan pixels 63,455 -> 0; rotherhithe, greenland, pier, ?night, default x 1600 x 900
  DPR 1 and 390 x 844 DPR 3: no console error, photo-view luma unchanged to 3 decimals.

## 2026-10-06 — Plotter SVG export on the 3D page (Opus)
- Owner: "Can you next make a vectorised version in SVG that I can send to my plotter?". New `docklands/plotter-svg.js`:
  Menu > views > "Plotter SVG of this view" (A4/A3/A2): edges rebuilt from the page's data, hidden lines removed with a
  CPU z-buffer, one Inkscape layer per pen (blue only for water), mm units, credit layer (OSM ODbL, EA LiDAR OGL).
- Measured: default wide view 23,739 building lines in 7.6 s (987 kB) after a size rule (under 1 mm on paper: not drawn;
  under 3 mm: roof outline only; first version 40,962 lines, 30 s); Rotherhithe photo view 563 lines; phone download
  through the button, portrait A4. Details: skill docklands-3d-page, "Plotter SVG". Register entry for the script;
  check-data-register exit 0.

## 2026-10-06 — schema.org harvest: idioms, sameAs links, fault F46, typed CWG directory (Opus)
- Owner: report on the schema.org harvest (https://claude.ai/artifact/8syFhnR1EaJEmJJQdqLmn5), then "the shape specs here
  are intended to be used to capture common multi-triple descriptive idioms, not necc for validation", "do 1-4", and
  "Please always try to use NPM Module Factoidal/core for RDF work" (now in the repo CLAUDE.md).
- 1. Idioms: `third_party/cwplans-structured-data/idioms/` (ShExC shapes, catalogue, SPARQL CONSTRUCT rewrites) and
  `tools/web-idioms.mjs` (Factoidal parse, SPARQL, shexValidate, serialize): 16 idioms, 4,341 nodes on 824 pages, per-page
  index, canonical layer of branch cards, weekly hours and organisation cards.
- 2. sameAs: `tools/web-coref.mjs` -> `coref/sameas.nq.gz` (one named graph per key rule), `descriptions.json`,
  `entities.json`: 890 descriptions, 396 entities (151 organisations, 245 places), 14 across sites. Two rule faults found
  and fixed on the way: same site and name joined a chain's branches (places now need the postcode too); a shared
  head-office telephone joined three Post Office branches (places with different postcodes are never linked).
- 3. Fault register: F46 (one branch, two building records from two sources). Web: 6 branch pages that link to two
  buildings (3 are F46). Registry: 48 of 101 names in more than one building fit the class by a heuristic, not yet checked.
- 4. `tools/cwg-directory-typed.mjs` -> `registry/sources/brands/cwg-directory-typed.json` and `.nq`: 374 directory
  entries with first listed and last edited dates, section, schema.org type from the CWG category, registry buildings.
- Factoidal 0.7.1 fault found: `serialize()` drops quads with blank nodes made by `BNODE()` in CONSTRUCT (labels like
  `p1__:fxbn…`); worked around with SHA-1 IRIs. Notes in the web-harvest skill, "Factoidal notes".
- Register: 14 entries; pipeline activities web-idioms, web-coref, cwg-directory-typed; check-data-register run.

## 2026-10-06 (later): site search, opening hours by mall, mall plan evidence

- The owner asked to file the Factoidal BNODE()/serialize() bug, and for a deep dive on SearchAction data, on opening
  hours by mall and area, and on whether mall plans can be rebuilt. The session could not post to danbri/factoidal
  (add_repo refused); the issue text is on the report page.
- `tools/probe-site-search.mjs` → `third_party/cwplans-structured-data/search/probe.json`: 111 SearchAction sites
  tested against a control query; 18 find a Canary Wharf branch page; 48 pages are not in the harvest yet.
- `tools/cwg-hours.mjs` → `registry/sources/brands/cwg-hours.json`: hours for 332 CWG directory occupants.
- `tools/hours-by-place.mjs` → `registry/sources/web/hours-by-place.json`: half-hour week grids, area and kind
  statistics, permutation tests (the mall explains 15% of closing time within a kind, p = 0.015), source agreement,
  postcode to mall.
- `tools/mall-plan-evidence.mjs` → `registry/sources/brands/mall-plan-evidence.json` (OSM-derived): 105 of 223 mall
  occupants placed, levels agree in 81 of 88 when `level:ref` is read first.
- `tools/web-idioms.mjs`: Factoidal renames blank nodes per query, so the branch and hours rewrites did not share
  nodes. Rewrites now run on a skolemized copy; recognition still runs on the page as published (a first try that
  skolemized both changed LogoIri and TargetIri counts; caught and fixed). All idiom counts are unchanged.
- Faults F47 (a fixed 09:00-17:00 week in web markup) and F48 (two level numberings) added.
- web.archive.org and index.commoncrawl.org reset every connection from the container this session:
  canarywharf.com/maps/ is not fetched yet.
- Trap found: this container's `.git/info/exclude` ignores `magpie/cwplans/registry/sources/`, although files there are
  tracked. The previous commit (2d83b25e) said it held `cwg-directory-typed.json` and `.nq`, but they were left out;
  they are added now with `git add -f`. After `git add`, check `git status` for every new file under registry/sources/.

## 2026-10-06 (end): what was only in chat is now in the repo

Owner: "don't waste good info by burying it in our chatlogs".
- Reports committed and served: `reports/schema-org/index.html` (snapshot) and `reports/hours-and-plans/` (template,
  `build.cjs`, built `index.html`). Their Pages and artifact URLs are in `cwplans-web-harvest`, "Reports".
- Factoidal: the unfiled issue text is `skills/cwplans-web-harvest/factoidal-issue-2026-10-06.md`;
  `tools/check-factoidal.mjs` re-tests the six known faults and behaviours (all STILL on 0.7.1). CLAUDE.md's RDF
  section points to both.
- `cwplans-web-harvest`: new "What the markup is for" (the first report's findings on entities and target search
  features), "Reports", and "Open (2026-10-06)" with the next steps; the description was cut to 860 characters
  (it was 1,652, over the 1,024 limit, and the listing truncated it).
- This skill, "Ship at once": the `.git/info/exclude` trap and how to check for it.

## 2026-10-06 (evening): CWG maps (PDF) and the Living Map service

- The owner supplied four PDFs from canarywharf.com/maps/ and asked for them in londat: saved unchanged in
  danbri/londat `third_party/cwg/maps/` with README and manifest (londat 5a1bdee). Source `cwg-maps`, manual step
  `cwg-maps-pdfs`. The July 2026 store guide has the mall plans by level with unit outlines and a grid-square index;
  its text is vector outlines (OCR needed).
- The owner asked whether map.canarywharf.com has a REST API. Yes: Living Map (`map-api.prod.livingmap.com`, vector
  tiles on `prod.cdn.livingmap.com`), no key, CORS *. The indoor tiles carry unit polygons per floor with names, mall,
  hours and telephone. Probed once with `tools/probe-cwg-map.mjs`; raw answers local only; not harvested (source
  `livingmap-cwg`, no published licence): the owner decides.
- Fix: `tools/check-factoidal.mjs` (previous commit) was not in pipeline.json, so `check-data-register.mjs` failed;
  my earlier report of exit 0 was wrong. Added as activity `check-factoidal`.
- Owner, later: "Archive everything including all map tiles into a mallmap subfolder, as is." New
  `tools/archive-cwg-mallmap.mjs` writes danbri/londat `third_party/cwg/mallmap/` (app, API answers, 5,747 tile URLs
  over zoom 0-19 indoor and 0-16 basemap, sprite, popup images, manifest with SHA-256). Gotham glyphs and usage POSTs
  left out. `@mapbox/vector-tile` and `pbf` added as devDependencies to read the tiles.

## 2026-10-06 (night): OCR to _TMI, the knowledge graph kgx, the search page

- Owner: "ocr where needed and normalise, use a subdir _TMI"; "Make londat tld folder kgx and explore state of npm js
  Factoidal/core for persistent storage ... first cut at a persistent knowledge graph ... nquads copies ... hdt or
  shardborough ... public search page that uses ServiceWorker and sparql".
- `tools/cwg-maps-tmi.mjs` (helper agent): store guide OCR (692 entries with grid squares; 99 of 100 sampled lines
  exact), access map labels, art trail and art guide entries, in londat `third_party/cwg/_TMI/`.
- `tools/cwg-mallmap-tmi.mjs`: the archived Living Map tiles as GeoJSON per floor (runs when the archive is complete).
- `tools/build-kgx.mjs`: londat `kgx/`, 75,471 quads in 13 graphs (first build; 87,512 after the mall-map facilities), as N-Quads, Shardborough, COTTAS and HDT. Measured:
  Shardborough answers views in about 1 s; COTTAS 40 to 280 s; HDT through Factoidal minutes. Skill `cwplans-kgx`.
- Page `magpie/cwplans/kg/`: the Lean engine in a Web Worker reads the Shardborough store over fetch; a ServiceWorker
  keeps engine and blocks. New Factoidal fault: `toCottas()` of an N-Quads string writes an empty store.
- Archive finished and pushed (londat 0bbb19d) after GitHub push protection refused the Mapbox token in
  `api/maps.json`; that value is redacted in the committed copy (manifest keeps the as-served hash). Corrections made
  this session: tile counts in the mallmap README were first written before measuring (fixed from the manifest); the
  graph count is 13, not 14; the first archive run sent `features` and tag requests the API refuses (400), fixed and
  fetched again.
- Also: commit 0e104709 failed check-data-register (kg/worker.js and kg/sw.js unregistered: the check ran before git add, so it did not see them). Fixed by adding both entries; run the check after `git add`.

## 2026-10-06 (late): kgx as dataflow; Shardborough in the browser

- Owner: "Concentrate on making shardborough work for browser somehow pls / What 64 block limit?? / Could we count then
  page results in several queries?" and "any cleanup, data pipeline and normalization work you do or did MUST be
  expressed and logged in terms of FP-friendly operations on named graphs ... upon static unchanging input named
  graphs". New skill `cwplans-dataflow`; rule added to CLAUDE.md.
- `tools/kgx-ops.mjs` (new, the `Flow` runtime) and `tools/build-kgx.mjs` (rewritten): inputs named by SHA-256, graph
  versions by RDFC-1.0 hash, activities by (operation, version, inputs, parameters), memoised; logs in londat
  `kgx/log/`. Layout now `graphs/<name>/<hash16>.nq.gz`, `heads.json`, `current.nq.gz`, `shardborough/` (ibk5);
  `nq/`, `cottas/`, `hdt/` removed (git history). 103,982 triples, 15 graphs including `pipeline` (pipeline.jsonld
  lifted) and `log`.
- The 64 is the stateless `storeQuery` cap; store handles have none (8 handles, 128 MiB). The page now uses handles,
  blocks only (sidecars are optional), a COUNT over the WHERE group then pages of 200 (a COUNT over a subquery plans
  every block), and parts cut in zone-key order: one entity reads 56 of 659 blocks (was 320 of 1,163 in string order).
  New `tools/kgx-query.mjs` (handle) for queries above 64 blocks.
- Faults met and fixed this session: a regex that stripped the graph term from the first " <" cut a literal
  ("layer < 0") and the pack stopped; the log graph described the previous pack, so each build made a new generation.
  Both rules are in `cwplans-dataflow`. Disk filled once: four merged helper clones (7 GB) in the old scratchpad
  removed, `git worktree prune` run.

## 2026-10-06 (late): sources queue and first imagery coverage check

- Owner: "Make a note in londat of data sources to investigate. Extract anything new and unexplored from this Gemini
  response and queue it up. Then begin by checking for data in our initial area of London (SE16, Rotherhithe,
  Limehouse, Canary Wharf, Isle of Dogs etc etc.)."
- londat `SOURCES-TO-INVESTIGATE.md` and `sources-to-investigate.json`: 9 items. Already held or catalogued: Mapillary,
  KartaView, Panoramax, OpenAerialMap, EA aerial photography and LiDAR, LGIF. Not found in the London Datastore
  catalogue (1,305 datasets, text search): 3D building models, historical aerial imagery indices. New: BESS (xRI,
  Datastore vd4ll, RDF, licence not stated).
- `tools/probe-imagery-coverage.mjs` (new): fetch by box, then the operation `lift-imagery-coverage` gives the kgx graph
  `coverage-imagery` (1,407 triples), packed through the new `kgx/external-heads.json`. Results: Panoramax 5,217
  pictures in the zone (485 Canary Wharf, 193 Isle of Dogs south, 4 Limehouse, 9 SE16; all CC BY-SA 4.0); KartaView 70,
  38, 49, 152 (2016 to 2024); OpenAerialMap 7 in the zone, 4 in SE16 (Canada Dock, Canada Water, Earl Pumping Station,
  Deptford Landings), none in the other areas; EA: no 25 cm LiDAR, finest 0.5 m (2003, 2007, 2012). Mapillary not
  counted (needs a token).
- Share-alike answers stay in `data/raw/coverage/` (gitignored); open answers in londat `cwplans/coverage/raw/`
  (`coverage/` added to `HOSTED_DIRS`). The first run put the share-alike answers in londat; moved before any commit,
  and the offline rerun was a memo hit.
- Public page test: raw.githubusercontent.com answered 429 once; the worker now fetches 6 at a time and retries.

## 2026-10-06 (evening): contributed photos round Canada Water Library

- Owner: four CC0 photos from about 16:30 BST, "Store in londat data/images/contrib/cwlibrary/ and figure out which
  buildings they are, so we can abstract vector patterns or textures for their 3D models." No EXIF time, GPS or camera.
- Identified (londat `data/images/contrib/cwlibrary/photos.json`, `README.md`): Ontario Point (OSM way 204580680; name
  on the building; about 12 two-floor units = 25 levels, LiDAR 76.5 m); Canada Water Library (way 157137089; name and
  form); Canada Water station drum (way 41599363, about 30 m across, no model outline) and bus station (way 140147695);
  Columbia Point and Regina Point (ways 52588475, 52588474, 20 levels; backlit, so the camera looked west); The Founding
  (way 1330247335; 30 or more floors counted, the only 30+ level building within about 1 km in OSM).
- New `tools/contrib-photos.mjs`: operations `rectify-facade-patches` (facade.py, measure.py) and `lift-contrib-photos`;
  kgx graphs `facade-patches-cwlibrary` (5 patches) and `photos-cwlibrary`. Rectified patches (CC0) in `rect/`.
- Corrections before commit: the first reading of Ontario Point's face stopped at the wrong right edge (the face
  recedes to the right); the full-width patch gave the symmetric pattern (12 panes, 3 louvre strips). The drum is about
  30 m across, not 25 m as first written; the lake is OSM relation 18015947, not a way.
- Not done: the 3D page draws photo facades only for registry towers (cwb ids).

## 2026-10-06 (late evening): was the GRAPH-join behaviour a Factoidal fault? No; report prepared

- Owner, on the earlier note "cross-subject joins inside a single GRAPH block can break across partitions": "This sounds
  like a terrible bug in factoidal indexing ... Prepare a copy-paste bug report text and url to post to".
- Checked: on the store's own input (SHA-256 prefix = the generation name), 18 queries through the store handle, the
  in-memory engine and Oxigraph 0.5.11 gave identical rows (6,910). The one-block join gives 130 on the parts and 2,519
  with one graph per source in every engine: SPARQL GRAPH semantics on our split data, not an index fault. My earlier
  wording ("can break") was wrong and is corrected in the cwplans-kgx skill.
- Real Factoidal points found, with a repro that runs as written: one block per (predicate, graph) and no way to cut
  it; zone keys sort by length first (README claim about sorted files does not hold for IRIs of different lengths); a
  COUNT over a subquery plans every block; every call re-parses the manifest. Text:
  `skills/cwplans-kgx/factoidal-issue-2026-10-06-store.md`.
- New `tools/check-kgx-store.mjs` (store against in-memory, on every rebuild or upgrade). New fault F49 (an HTML-escaped
  URL in the CWG directory, an invalid IRI).
- Owner filed the store report: https://github.com/danbri/factoidal/issues/697. `tools/check-factoidal.mjs` now re-tests
  its points (12 checks in all, 2 s; all STILL with 0.7.1).

## 2026-10-06 (night): any building by OSM id or position; facades for any building

- Owner: "Yes, do our whole area and be mindful of possible future expansion" (to: change the 3D page to find buildings
  by OSM id or position, so the Canada Water patterns show on the models).
- New `tools/key-model-buildings.mjs` (operation `key-model-buildings`): all 41,803 model buildings keyed to their OSM
  way or relation by the build's own outline encoding, aligned in build order (85 equal outlines resolved; 25 build
  outlines not in the model); tags from the full extract with osmium (the clip has no addresses). kgx graph
  `model-building-keys` (183,485 triples, a head but not in the browser store: `external-heads.json` now takes
  `{iri, store: false}`) and the page file `docklands/data/building-keys.json` (448 kB gzip, loaded on demand).
- 3D page: the pick colour is the model index (it was the registry ordinal, so no building outside the registry could be
  tapped); `selectModel`; new `docklands/building-keys.js` (OSM card, search by OSM name, house name or address, share
  `id=osm:`); facade slots 16 to 31 usable (`uniform vec4 fslot[16]`, same 25 fragment rows); facades keyed by OSM id
  with model indices and a point fallback (`MFP`, `modelAt`).
- Facades: `contrib-photos.mjs` operation `cut-facade-tiles` (helper `tools/facade-tile.py`): Ontario Point (south-west
  face, mirrored half), The Founding (dark part), Canada Water Library (mesh only), Columbia and Regina Point (a vector
  pattern, PNG and SVG, colours judged: the photo is against the sun). New `tools/compose-facade-atlas.mjs` (operation
  `compose-facade-atlas`): `facades.jpg/.json` = `facades-registry.*` (renamed from the old facades.*, written by
  build-facade-atlas.py) + the contributed tiles in slots 16 to 19.
- Tests (headless Chromium, SwiftShader): tap, card, search, share round trip at 1400 x 1000 DPR 1 and 390 x 844 DPR 3;
  the three photo views at 1600 x 900 DPR 1 and 390 x 844 DPR 3 unchanged against the committed page (mean luma to 1e-4);
  no console error.
- Corrections in this work: Ontario Point's model height is 82.2 m above the ground (roof 87.9 m OD), not 76.5 m (I had
  subtracted the ground twice; `h` in area.js is the height above `b`); the OSM extract is the openstreetmap.fr Greater
  London file (data of 2026-10-01), not Geofabrik as two notes said. Both fixed in photos.json, the README and the skill.

## 2026-10-06 (night): Plotter SVG checked against the owner's iDraw 2.0 A3 (Opus)
- Owner: "verify that your plotter functionality is optimal for" an iDraw 2.0 (DrawCore V2.0, GRBL compatible, iDraw 2.0
  Control, 420 x 297 mm, 0.01 mm, 445 nm laser). Ran our SVGs through UUNA TEK's own Inkscape extension in preview mode
  (public copy in TLausZ/plotter-studio; scratchpad only) and through vpype 1.15.
- Found: the credit was SVG text, which the extension skips (it never plotted); layer names had no numbers, so "plot
  layer N" plotted nothing; the layers sat inside a styling group, so vpype saw one layer; A2 overruns the A3 machine's
  travel; straight ground lines across 20 m terrain cells were hidden where the ground bulged (Rotherhithe view: 0.01 m
  of water edge drawn); about 29,500 separate lines (pen lifts) in the default A3 view.
- Fixed in `docklands/plotter-svg.js`: numbered top-level layers ("1 Buildings and credit" ... "7 Underground"); the
  credit in single-stroke Hershey Roman Simplex in layer 1 (glyph table from futural.jhf; acknowledgement in the header
  and the register); line ends within the pen width (0.3 mm) joined by Euler trails; mitred road kerbs; ground lines
  draped on the terrain triangles; the A2 option labelled "larger than an A3 plotter". Default A3 view 29,501 -> 20,232
  lines; Rotherhithe water edge 0.01 -> 0.80 m. Vendor preview: no warnings on A3/A4; every layer number plots its layer.
- The vendor's time estimate counts a pen lift as 0 s (its timing code is commented out), so it did not fall. Not tested
  on a real plotter. No G-code export (axes swapped and negated on the DrawCore; untestable here). Details: skill
  docklands-3d-page, "Plotter SVG" and "The owner's plotter". Register entry updated; check-data-register run.

## 2026-10-06 (night, later): plotter SVG lost every closed outline; fixed (Opus)
- Owner sent a plot made at 21:07 UTC (before the iDraw changes): "In preview it looks a bit garbled, with missing lines".
  Laid the export over the page's own image (method: skill docklands-3d-page, "Plotter SVG"): whole buildings had no
  roof or base outline. Traced the lines stage by stage: present after the hidden-line test and the chaining, gone after
  Douglas-Peucker. A fully visible ring is a closed polyline; the distance to a zero-length line was 0 for every point,
  so the ring shrank to its two equal ends and was dropped. Present since the first version.
- Fix in `docklands/plotter-svg.js` `simplify()`: when the ends of a span meet, measure the distance to that point.
  Default A3 view 66.6 m -> 94.4 m of line (with the earlier changes); no stubble left in the phone default view.
  Checked that the Rotherhithe water edge comes from the draping, not this fix (old code + fix: still 0.01 m).
  Vendor preview: no warnings; page button at phone size: no console error.
- Owner's second screenshot (file of 22:12 UTC, before this fix was live) also showed red zigzags on the DLR. Cause: open
  track heights from the DSM jump between deck and ground; catalogued as F50 (114 of 1,052 open rail lines over 3 m off
  their neighbours' mean, nodes under 40 m apart; counted with a node script over `area.js` decoded as on the page). The
  plotter now uses the drone's 5-point moving average for track heights; the 3D page and `area.js` are unchanged. F10 notes
  that the plotter repeated its `simplify()` fault.
- Owner's third file (22:18 UTC, "Still a few issues?") was also made before the outline fix went live (pushed about
  22:27 UTC): 44 closed loops in 17,513 lines. A similar view from the north with the fixed code, laid over the page's
  image, has every outline. Each plot's `<desc>` now holds the page's share link and the screen size, so a reported plot
  can be reproduced exactly.
- The owner's screenshot of the 22:18 file in Textastic: the preview fits the page height and cuts the side margins, so
  the credit (from the 12 mm margin) lost its first word. The credit now starts at the drawing's left edge when it fits
  the drawing's width (one or two rows), else at the margin; checked on A3 and A4, portrait and landscape.

## 2026-10-07 (morning): contributed photos round the Canada Water dock, set cwdock (Opus)

- Owner: 20 CC0 photos from about 09:00 BST, "taken NOW near the Dock by the Library ... one of some stickers on the
  library door for white calibration. Weather at 9am is overcast, light drizzle", and a phone map screenshot (EXIF
  09:08:43). Stored in londat `data/images/contrib/cwdock/` (originals unchanged, `README.md`, `photos.json`). The
  screenshot is not stored (the map provider's imagery and the owner's profile picture); only our fix from it is kept:
  -0.04740, 51.49760, +-10 m (OSM outlines laid over it at its scale bar, 4.33 px/m), at Decathlon's south corner.
- EXIF of the 20 JPEGs: no time, GPS, make or model; an embedded Display P3 profile while the EXIF ColorSpace says sRGB
  (new fault F51). Weather from the londat cache run of 08:43 UTC (Open-Meteo, 08:30 UTC): cloud 100 %, 0.1 mm, WMO 51.
- Identified (`photos.json`, with OSM way, model index, model height and evidence): Decathlon, 11 Maritime Street (way
  729958291: "11" and the Mouse Tail Coffee front, whose OSM node lies in the outline; 13 levels counted), the
  17-storey tower and 8-storey wing north-east of Decathlon (ways 729958295 and 729958294, floor counts), Dock X,
  Surrey Quays Shopping Centre with Corner Corner, Three Deal Porters (name partly read), Dock Shed, The Founding (three
  parts), the library, Ontario Point, the station drum, Regina and Columbia Point. Photo 01 (3x telephoto skyline): a
  camera solve on four tower tops (rms 2.2 px; Hampton Tower held out at 8 px; eye +-60 m): Newfoundland, Citigroup
  Centre, Landmark Pinnacle, One Canada Square, One Bank Street, 25 Bank Street, Wardian, One Park Drive, Hampton Tower,
  and a dark tower on Marsh Wall at Consort Place (way 988728458, identity a guess) that the model draws as a pit.
- White calibration (photo 19, the "Automatic door" sign's white): Display P3 RGB 216.1, 217.5, 212.4, CIELAB 86.6,
  -1.6, +2.5; linear gains R x 1.015, B x 1.055. The sky in the other 19 photos is within 4 CIELAB units of neutral, so
  each photo is balanced on its own neutral; the gains are not copied (white balance is per shot).
- Operations `rectify-facade-patches` (7 patches) and `lift-contrib-photos` (`tools/contrib-photos.mjs cwdock`, tool
  unchanged): kgx graphs `facade-patches-cwdock` (241 triples) and `photos-cwdock` (1,038); `build-kgx.mjs` twice
  (second run new: 0), generation gen-49d2897980a81d06, 294,125 triples (110,640 in the browser store);
  `check-kgx-store.mjs --write`: 17 of 17 queries the same in the store and in memory.
- Faults: F51 (Display P3 read as sRGB by the facade tools; red-brown brick off by about 6 CIELAB units) and F52
  (buildings newer than the 2022 LiDAR with no OSM levels: a dig or a guessed 6 m). F52 counts, on `area.js` of
  2026-10-03 decoded with `area()` and `dec()` of `tools/view-mcp/view-lib.mjs` and keyed by `building-keys.json`: height
  source `guess` 247 buildings, 21 with a footprint over 800 m2; source `lidar` with ground below 0 m OD and footprint
  over 300 m2: 6.
- Open: photo 18 repeats cwlibrary photo 1. The bearings of the brick chimney (way 1175339088) and the station drum
  put that camera about 65 m south-south-east of Ontario Point, not south-west as cwlibrary says; its face names and
  the 24.0 m tile width need a camera solve on the roof corners. Not changed.
- Corrections before commit: a first face-normal script took the normal side from the ring direction and inverted some
  outlines; recomputed as the side away from the centroid (skill lesson). Photo 11's twin towers did not fit a camera at
  the 09:08 fix; the bearings put the camera on the pontoon ramp about 55 m west.
- Privacy: people and vehicles appear incidentally; no person is described or tagged. Photos with a face or a number
  plate that may be readable were listed for the owner (blur decision before wider use).

## 2026-10-07: 3D page Line drawing style, the plotter look in real time (Opus)
- Owner asked whether the plotter view can be in the app, in real time (WebGPU and wasm allowed), with a Vectrex-like
  CRT as a variation. Layers > Style > "Line drawing" (`?lines`): new `docklands/line-styles.js`. WebGL 1 is enough:
  the page's solids go into the depth buffer only, then 838,254 feature edges (instanced quads, 1.1 CSS px) are drawn
  with the depth test. The edges come from plotter-svg.js's `scene()`, now shared (the plot is byte-identical at four
  views except the credit's date strokes). Real-time size rule in place of 1 mm / 3 mm (4 and 12 CSS px, faded); 400 m
  tiles sorted by size draw 21% of the edges in the default view. 22.4 MiB buffer, built in about 2 s.
- Against the plot of the same camera (new `tools/check-line-styles.mjs`): recall 97-99.9% and precision 99.4-99.99% at
  2 px. Photo views unchanged in Map style (mean luma to 1e-5). Picking, the share link and the below-ground cut work.
- Found and fixed: the share link carried no radio at all (style, ground image, buildings mode, splats: radios have no
  id and nav.js keyed inputs by id); a timer in the inline script can fire before a later script tag has loaded.
- Register entry for line-styles.js and a pipeline activity for the check tool; check-data-register --write run. Method,
  numbers and limits: skill docklands-3d-page, "Line styles". Not measured on a phone GPU.

## 2026-10-07 (later): 3D page Vector CRT style (Opus)
- Layers > Style > "Vector CRT" (`?vectrex`), the Vectrex tribute: the same edges added on black in one blue-white
  phosphor (a brightness per layer; "Colour overlay" tints them), glow (quarter-size, the night bloom's blur), afterglow
  (two textures in turn, 0.09 s), slight flicker, no scanlines. Redraws all the time only while on; a still frame skips
  the lines (0.06-0.19 s on SwiftShader at 390 x 844 DPR 3). check-fp16-shaders.mjs now captures the line programs and
  runs the afterglow fade in fp16 (reaches 0 in 19 frames at 60 frames a second). Share link restores style and overlay.
- First tuning made the far city a white haze; glow and brightness lowered and the size rule raised to 6 px for this style.
  Skill docklands-3d-page, "Line styles" > "Vector CRT".

## 2026-10-07 (late morning): cwdock facade tiles on the 3D page (Opus)

- After the cwdock set was pushed (londat 8c28efa, main 142db243): photos.json `tiles` for three buildings with a
  frontal face in diffuse light; operation `cut-facade-tiles` (graph `facade-tiles-cwdock`, 52 triples): the 17-storey
  brick tower north-east of Decathlon (OSM way 729958295; left half of the south-south-east face and its mirror image,
  27.0 m by 4 floors, 12.6 m), Decathlon (way 729958296; two bays by one storey, 10.0 m by 6.1 m) and Dock Shed (way
  1427207669; one bay by one floor, 12.6 m by 3.17 m, the model's own floor). Colours are P3 values read as sRGB (F51).
- Not tiled: 11 Maritime Street (rectified face keeps a 3 deg tilt; the other face has projecting balconies), The
  Founding (has a cwlibrary tile; its three parts need three outlines), Three Deal Porters (model a guessed 6 m, F52).
- `compose-facade-atlas.mjs` (graph `facade-atlas`, 26 triples): 23 of 32 slots. The new tiles took slots 16 to 18
  (set-name order) and moved the cwlibrary tiles to 19 to 22; the page reads slots from `facades.json` (skill lesson).
- Test (headless Chromium, SwiftShader WebGL, worktree at origin/master): `FT.byModel` maps model buildings 17650, 17651
  and 36551 to slots 16, 17, 18 and the cwlibrary buildings to 19 to 22; close views of Decathlon and Dock Shed with
  photo facades on and off differ in 18 to 28 % of pixels and show the tiles; the photo views rotherhithe, greenland and
  pier at 1600 x 900 DPR 1 and 390 x 844 DPR 3 have mean luma equal to the old atlas to 2e-5 (on 142db243); no page or
  console error. Re-run on 881f5c98 (Line drawing style): no error, but the greenland view gave mean luma 0.0925, 0.0925
  and 0.211 in three runs with the same files, so photo-view luma no longer compares run to run there; not investigated.
- kgx: `build-kgx.mjs` twice (second run new: 0), generation gen-94788565be0fae62, 294,405 triples; store check 17 of 17
  the same.

## 2026-10-07 (late morning): skills review against the work since 2026-10-02 (Opus, review agent)

Owner: "Please review the state of the skills vs state of our achievements and content of our session logs, updating
skills and activity logs with materials that shouldn't be lost."

### Open items waiting for the owner

Checked against this log and the files on 2026-10-07. The date is when the item was first recorded.

1. **Faces and number plates in set cwdock** (2026-10-07): blur the faces in photos 04, 09 and possibly 16, and the
   partly readable number plates in 18 and 20, before any wider use? The photo numbers are those listed to the owner
   in the session; this review did not open the photos. Nothing in the set describes or tags people (londat
   `data/images/contrib/cwdock/README.md`, "Privacy").
2. **Where cwlibrary photo 1 was taken** (2026-10-07): the bearings in cwdock photo 18 put that camera about 65 m
   south-south-east of Ontario Point, not south-west. If a camera solve on the roof corners confirms it, the cwlibrary
   wall names and Ontario Point's 24.0 m tile width (`facades.json` `osm:w204580680`, `w_m` 24) are wrong. Nothing
   changed yet.
3. **F51** (2026-10-07): the owner's phone photos are Display P3 and the facade tools read them as sRGB (brick about
   6 CIELAB units off). Proposed: convert with the embedded profile before `rectify-facade-patches` and
   `cut-facade-tiles`, bump both operation versions, re-derive cwlibrary, cwdock and the atlas. Waiting for a go-ahead.
4. **F52** (2026-10-07): 247 model buildings have a guessed height (21 with footprints over 800 m2) and 6 LiDAR
   buildings over 300 m2 are digs (the tower at Consort Place drawn as a pit). Proposed: storeys from a dated source
   (PLD storeys, the construction index, Wikidata, a photo count) in `tools/build-docklands.mjs`, source marked.
   Waiting for a go-ahead.
5. **A real-phone test of the line styles** (2026-10-07): Line drawing and Vector CRT are measured only on SwiftShader.
   https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/?lines and
   https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/?vectrex
6. **A real plot on the owner's iDraw 2.0 A3** (2026-10-06): only the vendor's preview has been run. A file made after
   2026-10-06 22:40 UTC carries its view link and screen size in `<desc>`, so a fault in it can be reproduced.
7. **Mapillary token** (2026-10-06): give one, or decide not to count Mapillary.
8. **GitHub Pages for londat** (2026-10-05): https://danbri.github.io/londat/README.md answered 404 on 2026-10-07.
   When it answers 200: `DATA_BASE = PAGES` in `data-base.js` and the default base of the kg page.
9. **OpenAerialMap drone images** (2026-10-06): fetch the 2 to 5 cm images over Canada Dock, Canada Water and Earl
   Pumping Station (CC BY 4.0)?
10. **CC BY-SA extracts** (2026-10-06): Panoramax (5,217 zone pictures), KartaView and Mapillary are counts only. An
    extract needs the owner's agreement (OpenStreetMap is the only share-alike source agreed).
11. **Sunlit photos of the west faces, for true colours** (2026-10-06, in a session summary): the cwlibrary photos
    were taken against the sun, so the tile colours of Columbia and Regina Point are judged, not measured.
12. **Factoidal issue https://github.com/danbri/factoidal/issues/697** (filed by the owner 2026-10-06): npm still has
    0.7.1 as the latest @factoidal/core (published 2026-09-06); `tools/check-factoidal.mjs` prints STILL for all 12
    checks on 2026-10-07. Sessions here cannot read danbri/factoidal, so a reply reaches us only through the owner. The
    first issue text (`skills/cwplans-web-harvest/factoidal-issue-2026-10-06.md`, BNODE() and serialize()) has no record
    of being filed.
13. **TfL FOI-0493-2223 station depths** (2026-10-05; no owner reply found): no open licence is stated; six cited
    values are used in the model and the station models (londat `third_party/tfl/am3d/models/README.md`). Approve or
    reject.
14. **VOA** (2026-10-03 and 2026-10-05): keep or delete `tools/registry-voa.mjs` (it reads the restricted VOA rating
    list); the VOA totals stay unpublished.
15. **Other licence asks** (2026-10-03, from a session summary, no owner words): the CRT non-commercial data (the river
    skill already lists the CRT ArcGIS layers as not allowed), the PLA's licence terms, a Land Registry account for
    CCOD/OCOD.
16. **Fly.io** (2026-10-03): "We can start to keep state on flyio / Can you see Flyio credentials here? (Via github?)".
    A token goes into the environment settings (`FLY_API_TOKEN`); never ask the owner to paste one into the chat.
17. **londat in the GitHub iOS app** (2026-10-05): "Londat in gh ios app shows no actions or workflows". The workflow
    file `.github/workflows/cache-live.yml` is in londat; treated as an app issue, nothing to change in the repository.
18. **A friend's feedback on the plots** (2026-10-07): "A friend will take a look for detailed feedback." Waiting.

Earlier items that this log still shows as open:
- 2026-10-03: the privacy limits change the owner approved was blocked by the environment's safety check ("Open, in the
  order proposed", item 8).
- 2026-10-03: the Crossrail long section (digitised, licence not stated): ask before committing (item 11).
- 2026-10-04: adsb.lol (ODbL) for live aircraft positions; Tower Bridge lift times (the site's terms forbid scraping
  and reuse); whether to ask the M7AZV aiscatcher operator for an Open Waters output or a licence.
- 2026-10-04: London Datastore: lift entrapment incidents (addresses), the Assembly Member gifts register (named
  people), and 4 datasets held for the owner (2g980, em8xy, 24r65, 2ogkn).
- Standing: AIS from AISHub and aisstream.io is accepted for scoping only; review before scaling (repo CLAUDE.md).

### The owner's instructions not yet recorded

A read-only agent listed 103 owner instructions and decisions of the session (2026-10-02 to 2026-10-07) and searched
CLAUDE.md, every SKILL.md, this log and the londat READMEs: 69 found, 13 partly, 21 not found. The 21 now:
- Ways of working (DURABLE: tell the owner when a release is pushed; do the whole set in priority order; answer for a
  GIS professional with links into the repositories; long answers in one copy-pastable block; results through deep
  links; do not stop earlier tasks; use subagents; say when the context is too full; collected lists belong in the
  infrastructure; the data must bring the 3D view to life; separate data from code): the owner's words and dates in
  `docklands-data-curation`, "Ways of working (the owner's words)".
- The Haiku window of 2026-10-05 (18:55 to 19:41 UTC; 6 replies, no tool calls, no commit): same section, "The model".
- londat was created by the owner on 2026-10-04 ("Created londat repo", 19:50 UTC), not 2026-10-05 as this skill and
  the repo CLAUDE.md said; the skill is corrected (first commit 48e4851 is of 2026-10-05 11:29 UTC); the CLAUDE.md
  line is outside the skills table and is left for the owner.
- The aircraft photo is CC0 with the owner as creator ("Plane photo - yes cc0, record me as owner", 2026-10-05 12:23
  UTC): `photo-view-reconstruction`, "The owner's photos and their licence". The entry above of 2026-10-05 ("CC0 not
  yet asked") is stale: the README and commit 2f2772fb have the answer.
- "We need to start reflecting it all into a knowledge graph structure ..." (2026-10-06 10:05 UTC): `cwplans-kgx`.
- Open items (TfL FOI depths, VOA tool, other licence asks, Fly.io, the iOS app, a friend's feedback): the list above.
- The review itself: this entry.

### What changed in the skills

- `docklands-3d-page`: description rewritten (was 1,686 characters; said the sky skill was "pending" and "seven
  shader programs"); Architecture checked against master a2781653 (2,349 lines and 295 KB, not 1,840 and 218 KB; the
  20 script tags in order; 15 programs: the sky row was "moving to sky.js", the My KML programs were missing); URL
  switches (`plane`, `?t=`, `?drone=`, `?kml=`, the share hash); drawer tabs (Sky exists); facade slots in use (23 of
  32: cwdock 16 to 18, cwlibrary 19 to 22; refer by OSM key); plotter dating by closed-loop count (44 of 17,513 before
  the fix, 809 of 12,393 in a test plot after); Testing: photo-view luma not repeatable on 881f5c98 (0.0925, 0.0925,
  0.211), and the `pgrep -f` wait loop that matched itself.
- `cwplans-kgx`: the owner's direction of 2026-10-06 10:05 UTC; the build and store numbers of 2026-10-07 (294,405
  triples, 24 head graphs, 110,920 quads in the store, 51 parts, 847 blocks, gen-94788565be0fae62); the store check of 2026-10-07 (17 of 17); the Factoidal follow-up.
- `cwplans-dataflow`: "Order of runs" (key, tiles, atlas, kgx twice, store check; push londat first). The operation
  table was checked against the code: all ids and versions agree.
- `photo-view-reconstruction`: the owner's photos and their licence (aircraft and day photos and both sets CC0; the
  night photos of 2026-10-03 not open); telephoto skylines and bearings (cwdock photos 01, 11, 18); a tower top that
  no model building explains is a finding (F52); description shortened (was 1,162 characters).
- `docklands-data-curation`: the project skills table (6 skills were missing: photo-view-reconstruction,
  blender-station-models, cwplans-kgx, cwplans-dataflow, cwplans-feed-discovery, cwplans-permits-and-works); the
  keyed and graph steps in "Rebuild order"; new "Ways of working (the owner's words)" with "Sessions, context and
  cost".
- `cwplans-construction`: F52 cross-reference (the index as a source of storeys).
- Descriptions over the 1,024-character limit of the skill format, shortened (this session's skill listing cut
  `docklands-3d-page`, `cwplans-londat-cache`, `cwplans-london-datastore`, `cwplans-open-portals` and
  `cwplans-permits-and-works` with "…", and showed no text for `cwplans-river-and-water`): `cwplans-river-and-water` (1,736;
  it also said "no open live AIS" without the owner's acceptance of 2026-10-04),
  `cwplans-londat-cache` (1,662), `cwplans-london-datastore` (2,482; said 31 harvested and `feeds/london-datastore/`:
  now 219 harvested, files in londat), `cwplans-open-portals` (1,768), `cwplans-permits-and-works` (1,819).
- Repo CLAUDE.md skills table: rows added for `fink-validation` and `nocliches-fink-authoring` (both discoverable, no
  row); rows corrected for `docklands-3d-page`, `docklands-data-curation`, `cwplans-river-and-water`,
  `cwplans-london-datastore` ("the 13 harvested sets") and `cwplans-open-portals` (files now in londat).

### Found, not fixed (no code changes in this task)

- `tools/check-skills.mjs` reads only the first line of a folded (`>-`) description: its regular expression has the
  `m` flag, so `$` in `(?=\n\w+:|$)` matches at the first line end. It printed "111 char description" for a
  1,686-character one and has no length check, so it cannot catch descriptions over 1,024. Still over 1,024 after this review:
  docklands-sky (1,377), cwplans-feed-discovery (1,367), cwplans-live-state (1,318), cwplans-construction (1,202),
  blender-station-models (1,134), cwplans-public-registers (1,133).
- Not reviewed: `cwplans-web-harvest`, the londat cache folder against `cwplans-londat-cache`, and the contributed
  photo files: the environment's safety check refused those reads in this session.

## 2026-10-07 (midday): the project moves to danbri/londat (Opus)

Owner: "Migrate docklands 3d map, data tools, lg etc from magpie/cwplans/* into londat repo." and "Let me know
where/how to configure github" ("lg" read as the kg page; the logs moved too, because the whole folder moved).
From this entry on, paths are relative to danbri/londat and commit ids are londat commits unless named otherwise.

What changed (londat branch `claude/docklands-migration-londat-hr8hoz`; glitchcan-minigam the same branch name):
- **Copy** (londat d312be6, no file changed): glitchcan-minigam 7be94dc `magpie/cwplans/` to `cwplans/` (447 files),
  `third_party/cwplans-structured-data/` (451 files) and `tools/view-mcp/` (6 files), 904 files, git archive of tracked
  files. One path was in both trees: `cwplans/data-register.json` (the copy of the hosted entries), replaced by the full
  register. History before the move: https://github.com/danbri/glitchcan-minigam/commits/7be94dc/magpie/cwplans
- **Paths and URLs**: a one-off script rewrote 178 files (code, pages, current docs, `data-register.json`,
  `pipeline.json`; not data files, not generated docs, not dated docs such as `research-report-2026-10.md`, this log,
  `feeds/SURVEY-2026-10-03.md`, the Factoidal issue texts): `magpie/cwplans/` to `cwplans/`; the glitchcan-minigam Pages
  and GitHub URLs of the moved files to the londat ones; `../../third_party/` and `../../tools/view-mcp/` (relative to
  cwplans) to `../`. The knowledge-graph IRI namespaces under https://danbri.github.io/glitchcan-minigam/ were protected
  and kept. Then by hand: repository-root paths one level shorter in 12 tools; `tools/londat.mjs` (LONDAT_DIR = this
  checkout); `check-data-register.mjs` without the two-repository logic (pattern entries matched for tracked files too);
  the facade Python scripts' absolute paths made relative; the hours report builder's root; the User-Agent contact URL
  (`glitchcan-cwplans/0.1 (https://github.com/danbri/londat)`, token unchanged); comments and labels that named
  glitchcan-minigam as the place of the tools.
- **Register**: `"hosted": "londat"` removed from 421 entries; `lds-harvest-auto.mjs` no longer writes it;
  `build-zone-gpkg.mjs` picks the London Datastore and portal GeoJSON by folder (it filtered on `hosted`);
  `osm_elsewhere_in_repo` now names glitchcan-minigam paths and is checked only with a glitchcan-minigam checkout next
  to this one. `--write` regenerated DATA-REGISTER.md, METHODS.md and pipeline.jsonld: file IRIs are now londat blob
  URLs (1,742; 0 glitchcan-minigam).
- **Pages**: `data-base.js` reads every path from the same site except `cache/` (raw.githubusercontent.com, new each
  hour); the kg page reads `../../kgx/`. No other page code changed beyond the URL rewrite.
- **Repository**: `package.json` and lock (proj4, geotiff, earcut as dependencies; the rest devDependencies; Playwright
  pinned to 1.56.1 for the container's Chromium 1194), `.gitignore`, `CLAUDE.md` (the owner's rules carried over with
  their words and dates), `README.md`, a landing `index.html`, `.claude/skills/` (18 links), `tools/check-skills.mjs`
  (copied from glitchcan-minigam), `.mcp.json` (docklands-view), `.github/workflows/pages.yml` (new: deploys on a push
  to main that changes more than `cwplans/cache/`; not published: `third_party/`, `cwplans/cache/runs/`,
  `cwplans/cache/*.sqlite`, `.claude/`), `.github/workflows/cache-live.yml` (runs the tools from here: `npm ci
  --omit=dev`, a stash of the rewritten snapshot files before the pull).
- **Skills and docs**: this session updated `docklands-data-curation` ("Data hosted in danbri/londat" rewritten for
  the move, with the history kept) and `cwplans-londat-cache`; three subagents updated the other 16 skills and the
  folder READMEs (`cwplans/`, `kgx/`, `data/images/contrib/`, `third_party/`); also `methods-intro.md`,
  `LICENSE-DATA.md`, `SOURCES-TO-INVESTIGATE.md`, `sources-to-investigate.json`.
- **Skill descriptions** (a separate commit): the six descriptions over 1,024 characters (listed in the
  glitchcan-minigam `CLAUDE.md` on 2026-10-07) were cut to 963 to 1,020 characters, details that the body repeats taken
  out: blender-station-models, docklands-sky, cwplans-live-state, cwplans-feed-discovery (by the subagents),
  cwplans-construction, cwplans-public-registers. All 18 are now 1,024 or fewer (measured with a YAML parser).
- **glitchcan-minigam** (commit 95539f4 on its branch): 910 files removed; 11 redirect pages at the old page
  addresses (query and hash kept; the kg page's service worker unregistered first) and a README; the 18 skill links
  and the docklands-view MCP entry removed; `CLAUDE.md`: the cwplans exception points to the londat `CLAUDE.md` and
  applies to no directory there, the 18 skill rows became one row.

Measured:
- `check-data-register.mjs`: 706 entries, 683 data files tracked, 0 problems (a test file left unregistered in
  `feeds/portals/` was reported). `npm test`: 15 of 15. `check-factoidal.mjs`: STILL for all 12 (as before).
  `tools/view-mcp/test.mjs`: all passed, including `render_view ?view=plane` with 0 console errors.
  `check-kgx-store.mjs`: 17 of 17 queries and joins gave the same counts from the store and from memory (exit 0;
  about 12 minutes here).
- Offline rebuilds to test the tools (outputs not committed): `build-atlas.mjs` (after `fetch-raw.mjs grid`) gave the
  committed atlas.json except `built` and three counts whose inputs changed after 2026-10-03 (feeds 541 to 554, events
  124 to 313, register files 120 to 706); `audit-quality.mjs`: 39 checks, all counts the same except TM-4 30 to 34
  (Wikidata qualifiers; the registry changed after the last audit).
- Redirect pages: 8 cases, headless, with the new site mocked: each kept the query and the hash.
- Pages site staged as the workflow does it: 430 MB (limit 1 GB; the workflow stops at 950 MB).
- Pages, old copy (7be94dc) against the new one, headless (subagent), two passes (21 and 22 loads on each side):
  every page; the 3D page with `?view=greenland`, `?t=photo&view=greenland`, the London Datastore overlays (by menu
  and by share hash), Live, a building card and `?kml=`; the atlas with `#view/b/cwb-0413`, `#quality`, the London
  Datastore view and Live; the kg page with a query. The same number of requests on every load, 0 page errors and 0
  HTTP errors on both sides; the only console error common to both is /favicon.ico from the local server. One load
  in the second pass (new side, `?t=photo&view=greenland`) had one failed request: the Ships layer's own browser call
  to https://ais.openwaters.io answered without the CORS header; the same code asks the same service in both copies,
  and the first pass had no such failure. Requests to raw.githubusercontent.com in the first pass: 90 old (63 from the kg
  page), 2 new (`cache/latest.json` for Live). The `?kml=` load of the second pass asks raw.githubusercontent.com for
  the KML copy on both sides, because the link names that URL. Screenshots of `?view=greenland`: 30.2 % of pixels
  not background on both sides. The overlays, the atlas London Datastore view (214 of 214 datasets), the kg page
  (store gen-94788565be0fae62, 110,920 quads, 24 graphs; "Jubilee Place" 69 rows), the building card of cwb-0413 and
  `?kml=` (12 piers) gave the same results on both sides. Seen on both sides (not the move): the four London
  Datastore overlays switched on together send 10 requests for 4 files (`OV.data` is set only when a load ends).

Open items (changes to the list of the skills review entry above; the other items stand):
- Item 8 (GitHub Pages for londat) is now four steps for the owner, in this order: Settings > Pages > Source: GitHub
  Actions; merge the londat branch; check https://danbri.github.io/londat/cwplans/docklands/ ; then merge the
  glitchcan-minigam branch (before the site is on, the redirects would lead to a 404). `data-base.js` and the kg page
  need no further edit.
- Item 5: the links are now https://danbri.github.io/londat/cwplans/docklands/?lines and
  https://danbri.github.io/londat/cwplans/docklands/?vectrex (the old ones redirect after the merge).
- New: the IRI namespaces under https://danbri.github.io/glitchcan-minigam/ (register sources, activities, the `cwp:`
  vocabulary; structured-data descriptions and genids) were kept as names. A londat namespace would be new operation
  versions and new graph versions: the owner's decision.
- New: `build-kgx.mjs` was not run after the move. The next run gives a new pipeline-provenance graph version (file
  IRIs are now londat blob URLs, and every edited tool has a new hash).
- New: the register covers `cwplans/` and `third_party/cwplans-structured-data/`; `kgx/`, `data/images/`,
  `third_party/tfl/` and `third_party/cwg/` have READMEs and manifests but no register entries.
- New: glitchcan-minigam `package.json` keeps devDependencies that only cwplans used (proj4, geotiff, earcut,
  @factoidal/core, xlsx, exceljs, tesseract.js, pdfjs-dist, @napi-rs/canvas, pbf, @mapbox/vector-tile); check for other
  users before removing any.
- New: `feeds/kml/catalogue.json` (data, made by `tools/find-kml.mjs`) names the 12 KML copies by their
  raw.githubusercontent.com URLs and 17 `open_link` values by the glitchcan-minigam page. Both still work (raw sends
  `Access-Control-Allow-Origin: *`; the old page redirects). A same-site URL needs a re-run of `find-kml.mjs` with its
  `RAW_BASE` changed.
- New: the hourly cache ran 7 times from 2026-10-05 23:09 to 2026-10-07 08:38 UTC (all successful): GitHub delays or
  drops scheduled runs, so the runs were 3.8 to 7.3 hours apart, not 1. Not changed by the move.

## 2026-10-07 (afternoon): knowledge-graph IDs under https://kgx.foaf.tv/id/ (Opus, subagent)

Owner, 2026-10-07, answering "the knowledge-graph IRIs still start with https://danbri.github.io/glitchcan-minigam/
... Do you want a londat namespace?": "Use https://kgx.foaf.tv/id/ prefix for IDs. i own the domain; nothing is hosted
there yet. iDs should be alphanumeric".

Commits (londat branch `claude/docklands-migration-londat-hr8hoz`, not pushed): c135c9f (code, page, queries), 18df41a
(the rebuilt kgx, `pipeline.jsonld`, METHODS.md, DATA-REGISTER.md), then the skills and this entry.

What changed (skill `cwplans-kgx`, "Graphs, IRIs, vocabulary": the scheme, the code table, the rules):
- New `cwplans/tools/kgx-ids.mjs`: `ID_BASE`, `an()`, the code table, `kid(kind, ...parts)` (mint),
  `mapLegacy(iri)` (an old name to its ID; any other IRI unchanged; an old name with no code throws), the registry that
  throws when two old names give one ID, `cwgPath`, `osmKeyOf`, and `--test` (33 examples, idempotence, unchanged
  vocabularies and external IRIs, the error cases; also `cwplans/tools/test/kgx-ids.test.mjs` in `npm test`).
- IDs minted at the source: `kgx-ops.mjs` (input files `id:sha256<hash>`, graph versions `id:graph<name><hash16>`,
  activities `id:act<hash16>`), `build-kgx.mjs` (every lift, `meta`, `log`, the pack activity, `id:store<gen>`,
  `id:op<operation>`, `id:genidpipeline<sha12>`), `key-model-buildings.mjs`, `contrib-photos.mjs`,
  `compose-facade-atlas.mjs`, `probe-imagery-coverage.mjs`; `check-data-register.mjs` writes `pipeline.jsonld` with
  sources `id:src<key>`, tool activities `id:tool<id>`, local files `id:local<path>`.
- Old names in inputs mapped at lift: the quad collector of `build-kgx.mjs` puts every IRI term through `mapLegacy()`
  (the web-harvest canonical layer and sameAs groups, the typed CWG directory, `pipeline.jsonld`, and in `log` and
  `meta` the activities and versions written before).
- External heads: new operation `map-legacy-ids` (version 1, skill `cwplans-dataflow`, `kgx-ops.mjs`). `build-kgx.mjs`
  applies it to each head of `external-heads.json` named in the old namespace and writes the mapped version there (9
  heads, done in this build; my choice of the spec's two ways, so that the other tools read IDs too). Convergence: the
  IDs that the updated `contrib-photos.mjs` and `compose-facade-atlas.mjs` mint from `photos.json` and the photos are
  the IDs of the mapped versions (7 graphs: 0 missing, 0 extra); `coverage-imagery`: the 261 IDs minted from the
  committed answer files are all in the mapped version; `model-building-keys`: only `osm<w|r><id>` (42,464),
  `cwb<n>` (1,071) and the model ID.
- Kinds that the spec did not list (decided here: the smallest change that keeps the rule): `urn:cwplans:local:<path>`
  -> `local<path>` (73), the CWG address nodes `<page>#address` -> `addr<page path>` (344, from
  `cwg-directory-typed.mjs`), the opening-hours nodes `<page>#entity-hours-<Day>-<k>` -> `hours<page path><day><k>`
  (2,183, from `lift-cwg-directory`). The CWG entity IRIs `<page>#entity` stay (the join key).
- `an()` removes hyphens and dots, so `meta` gives each graph name its name as `rdfs:label` and `log` each operation
  its id; the views "Graphs and versions" and "Lineage" and `kgx/queries/graphs.rq`, `lineage.rq` read the labels.
  Every `kgx/queries/*.rq` has `PREFIX id:`.
- Page https://danbri.github.io/londat/cwplans/kg/ : prefix `id:`; an ID opens in the page only, no outside link
  (nothing is hosted at kgx.foaf.tv); short deep links `#e=id:<local>`; a footer line. `cwplans/docklands` and
  `cwplans/atlas` hold no kgx IRIs and no links into the kg page (grep).
- A version file holds its version IRI in each line; a new version with the content of a file written under an old
  name gets `<hash16>-id.nq.gz` (not needed in this build: 0 such files).
- Factoidal renames blank nodes per parse (one `_:b1` in two chunks came back as `p0_d0_b1` and `p1_d1_b1`), so
  `quadsOf()` parses a version with blank nodes in one piece. One parse of 294,405 lines did not end in 10 minutes;
  2,000 lines at a time took 102 s.
- Operation versions: the 8 lifts and `lift-pipeline-provenance` 2, `describe-graph-versions` 2,
  `lift-activity-log` 2, `map-legacy-ids` 1 (new), `key-model-buildings` 3, `rectify-facade-patches` 2,
  `lift-contrib-photos` 3, `cut-facade-tiles` 2, `compose-facade-atlas` 2, `lift-imagery-coverage` 2.
  `partition-by-subject-key` (4) and `pack-shardborough` (1) did not change: same bodies, and their activity IRIs change
  with their inputs.

Measured (before: londat 4411ef3; after: this build):
- Triples 294,405 -> 298,615 in 24 head graphs (`pipeline` 13,667 -> 14,943: `pipeline.jsonld` after the move; `log`
  5,902 -> 8,818: 132 activities, 42 of them this build; `meta` 692 -> 710). Store 110,920 -> 115,130 quads, 847 -> 834
  blocks, `gen-94788565be0fae62` (5,084 files, 21.4 MB) -> `gen-5ad6ded8fc45e17f` (5,006 files, 19.3 MB; blocks 15.0
  -> 12.8 MB). The build removed the previous generation from the folder (git keeps it), as the skill says.
- Size added to the repository by the two commits: 5,081 new files, 23.6 MB (the store generation: 5,006 files, 19.3
  MB; 73 graph version files: 4.3 MB; 2 tool files), and new blobs of the changed `current.nq.gz`, logs and register
  files; git objects +31.5 MiB (loose, compressed, `git count-objects`). The checkout and the Pages site hold 2.1 MB
  less store (the old generation, 21.4 MB, is now only in the history) and 4.3 MB more graph files.
- Distinct IRIs in `current.nq.gz` 105,052 -> 105,742. Names of the old namespaces 56,346 (londat/kgx 51,452;
  glitchcan-minigam 2,294; urn:cwplans:local 73; CWG address and hours nodes 2,527) -> 0. IDs 0 -> 57,034. In the
  store: 110,920 of 110,920 quads with an old name -> 0 of 115,130 (SPARQL count through a store handle; the parsed store
  input agrees: 14,594 IDs, 0 old names). Literals that hold old names (not mapped): `cwk:params` of 11 older
  activities, 3 `s:addressCountry` texts in the web layer, the `rdfs:comment` of `map-legacy-ids`.
- Runs: build 1, 7 min 4 s (the mapping of `model-building-keys`, 183,485 triples, is most of it), 42 new activities;
  build 2, 15 s, `new: 0`, the same generation, `log/*.jsonl`, `heads.json`, `external-heads.json` and `current.nq.gz`
  unchanged. A first full run before the blank-node guard gave the same counts; it was reset before any commit
  (`kgx-ops.mjs` is an input of the pipeline graph).
- Checks: kgx-ids self-test ok; `npm test` 17 of 17; `npm run check` ok (706 entries); `tools/check-skills.mjs` 18 of
  18 discoverable (it also lists the 18 copies in a local agent worktree under `.claude/worktrees/`, which git ignores,
  as "not offered"); `check-kgx-store.mjs --write` 17 of 17 the same (9 min 16 s); page test (headless Chromium, local
  server): the default view, a name search ("Jubilee Place", 69 rows), the 11 views, `#e=id:cwb0413`,
  `#e=id:mallcabotplace`, the Manhattan Grill entity by its encoded IRI and a click to a graph part: 0 page errors, 0
  console errors, 0 failed requests, no ID with an outside link.

Open items:
- The vocabularies keep their namespaces (`cwk:` under danbri.github.io/londat, `cwp:` and the idioms ShEx under
  danbri.github.io/glitchcan-minigam): a new vocabulary namespace would be the owner's decision.
- Nothing is hosted at https://kgx.foaf.tv/ yet: the IDs do not resolve. A redirect to
  https://danbri.github.io/londat/cwplans/kg/#e=id:<local> would make them links.
- Found, not fixed: `key-model-buildings.mjs` writes `s:sameAs https://www.openstreetmap.org/undefined/<id>` for every
  way (42,244 links; the clip's ways have no `type`). Fix at its next run (it needs the local OSM clip and extract) with
  operation version 4. Until that run `docklands/data/building-keys.json` names the old version of
  `model-building-keys` in its `graph` field.
- Three `s:addressCountry` values in the web canonical layer are the text of a genid IRI (a fault of that layer).
- `tools/check-skills.mjs` scans `.claude/worktrees/` (local agent worktrees) and reports their SKILL.md copies.

## 2026-10-07 (afternoon): owner's answers, status dashboard, F53 (Opus)

Owner's answers to the open items of the move entry above (2026-10-07):
- `third_party/` on the site: "Repo only for now". The Pages workflow keeps it unpublished; the londat `CLAUDE.md` and
  "Data hosted in danbri/londat" give the decision.
- The irregular hourly cache: "Ack'd. Make a unified dashboard url for me." Made by a subagent in its own worktree
  (londat c610e93): https://danbri.github.io/londat/dashboard/ (`dashboard/index.html`, no build, no outside script).
  Sections: hourly cache runs (last run, runs against the expected count for 24 h and 7 days, median and longest gap,
  failures, a 7-day timeline), site deploys (the deployed commit against main; commits that change only `cwplans/cache/`
  count as up to date), the age of each `latest.json` theme (stale after 2 h), the knowledge graph (`kgx/manifest.json`),
  the register and the quality checks, the old-site redirect (a same-origin read of the old 3D page's title), the newest
  log headings and commits, and links to every page. GitHub API without sign-in: 60 requests an hour per address, 4 to 6
  a check, answers kept 5 minutes in the tab. Values at 14:50 UTC: cache "Late" (last run 6 h before; 4 of 24 runs in
  24 h, 7 of 46 in 7 days; median gap 5.7 h, longest 7.3 h; 0 failures), site up to date, 11 themes stale, old site not
  redirected. Tested headless at 390 x 844 (DPR 3) and 1280 x 800, light and dark: 0 page errors; html-validate 0.
- "build-kgx.mjs did not run after the move": "Ok". It ran with the ID change (entry above).
- The IRI namespace: the owner's answer gave the ID change (entry above).

Also: fault F53 added to the fault register (the `undefined` OSM URLs of `key-model-buildings.mjs`, found by the ID
subagent; fix at the tool's next run). It is not yet cited in `pipeline.json`: that would change `pipeline.jsonld` and
so the pipeline graph one build after the ID rebuild; cite it with the fix. `tools/check-skills.mjs` skips
`.claude/worktrees/` (local agent checkouts; also in `.gitignore`).

Open items now: the list of the move entry above, less items 2, 3 and 4 there; plus: vocabulary terms (`cwk:`, `cwp:`)
keep their namespaces (not IDs; ask the owner before a move); nothing is hosted at https://kgx.foaf.tv/ yet (a
redirect of `/id/<local>` to https://danbri.github.io/londat/cwplans/kg/#e=id:<local> would make the IDs resolve);
F53; the glitchcan-minigam branch with the redirect pages is not merged yet (the dashboard shows it).

## 2026-10-07 (afternoon): links to the knowledge-graph search page (Opus, subagent)

Owner, 2026-10-07: "Yes add links". Links (relative) to https://danbri.github.io/londat/cwplans/kg/ :
- 3D page (https://danbri.github.io/londat/cwplans/docklands/): Menu > About, "knowledge graph" after "atlas"; the
  registry card, "knowledge graph" after "full record in the atlas" (`../kg/#e=id:cwbNNNN`, the cwb id without the
  hyphen); the OSM card (`building-keys.js`), "knowledge graph" after "OSM" (`../kg/#e=id:osmw<id>` or `osmr<id>`).
- Atlas (https://danbri.github.io/londat/cwplans/atlas/): the overview text, after the 3D page links; the building
  dossier, "knowledge graph" after "registry page" (e.g.
  https://danbri.github.io/londat/cwplans/kg/#e=id:cwb0413).
- Not changed: `cwplans/kg/`. Postcodes and other kinds have no kg ID and get no link. Not checked: that every OSM-only
  model building has a node in the graph (an unknown ID shows the kg page's own "not found").
- Tested headless (SwiftShader, 1400 x 900): card of cwb-0413 -> `../kg/#e=id:cwb0413`; OSM card of model index 0 ->
  `../kg/#e=id:osmw4366294`; atlas `#view/b/cwb-0413` -> `../kg/#e=id:cwb0413`; 0 page errors on both pages;
  `check-data-register.mjs` passes.

## 2026-10-07 (evening): the vocabulary under https://kgx.foaf.tv/ (Opus, subagent)

Owner, 2026-10-07, asked whether the vocabulary terms should also move to kgx.foaf.tv: "move them to kgx.foaf.tv? Yes
pls. No dereferencing needed yet". Done with the method of the ID change (entry above); terms keep their local names:
- `cwk:` https://danbri.github.io/londat/kgx/vocab# -> https://kgx.foaf.tv/vocab#
- `cwp:` https://danbri.github.io/glitchcan-minigam/magpie/cwplans/data-register.json#vocab/ -> https://kgx.foaf.tv/pipeline#
- the idioms ShEx namespace (`i:`) .../third_party/cwplans-structured-data/idioms/idioms.shex# -> https://kgx.foaf.tv/idioms#
  (no term of it is in kgx).

Commits (londat, not pushed): a06a93d (minting and mapping: `kgx-ids.mjs` VOCAB, REGISTER_VOCAB, IDIOMS_VOCAB,
VOCAB_MOVES and test cases; `kgx-ops.mjs` map-legacy-ids version 2 and `hasLegacyNames()`; `check-data-register.mjs`
cwp: in `pipeline.jsonld`; the search page, `kgx/queries/*.rq`, `check-kgx-store.mjs`), 0bbb5b8 (a fault found by the
rebuild, below), 46923bd (the rebuilt `kgx/`), and the docs commit with this entry.
- Operation versions: the eight lifts and `lift-pipeline-provenance` 3, `describe-graph-versions` 3, `lift-activity-log`
  3, `map-legacy-ids` 2; in the tools that were not re-run: `rectify-facade-patches` 3, `lift-contrib-photos` 4,
  `cut-facade-tiles` 3, `compose-facade-atlas` 3, `key-model-buildings` 4 (so the F53 fix is version 5),
  `lift-imagery-coverage` 3. `partition-by-subject-key` and `pack-shardborough` kept theirs (bodies unchanged).
- `contrib-photos.mjs` had the old cwk: namespace in a regex (the `cwk:building` lines of the facade-patches version):
  now built from VOCAB. `web-idioms.mjs` and `web-coref.mjs` read the ShEx namespace from `idioms.json`: no change; the
  harvest files (`idioms.shex`, `idioms.json`, `rewrites/*.rq`, `canonical.nq.gz`) and `kgx/log/*.jsonl` keep the old
  terms (upstream and history); the lift maps them. The dashboard names no vocabulary: no change.
- Fault found and fixed (0bbb5b8): a part version with the content of a part of an earlier head keeps that head as its
  `partOf` in `log/versions.jsonl`. One geometry-only part of `buildings` and one of `mallmap` did not change, so `meta`
  said `dct:isPartOf` the older head and `check-kgx-store.mjs` found 47 of 49 parts and refused ("rebuild first").
  `build-kgx.mjs` now gives each part the head it was cut from in this run; the check reads a head's parts from its
  partition activity. The first run's output was discarded before any commit, and the build ran again.

Counts (`current.nq.gz`, IRI terms; the store by a SPARQL `COUNT` through a store handle with a FILTER on the four
positions): triples 298,615 -> 299,829 (`log` 8,818 -> 10,030, 174 activities; `meta` 710 -> 712); IRI terms in the old
namespaces 135,986 (162 distinct: 142 cwk:, 20 cwp:) -> 0; new vocabulary terms 0 -> 162; store quads 115,130 ->
116,344, with an old name or term 43,380 -> 0. Literals keep old names (16 lines: `cwk:params` and `rdfs:comment` of
older activities and operations, the 3 `s:addressCountry` texts).
- Store generation `gen-7d0a65a1b11accc7` (49 parts, `meta`, `log`; 5,006 files, 19,322,091 bytes); the previous one
  (`gen-5ad6ded8fc45e17f`) was removed from the folder (git keeps it). 71 new graph version files, 4.2 MB. Git objects
  +30.1 MiB (loose, `git count-objects`).
- Runs: build 1, 12 min 12 s, 42 new activities; build 2, 15 s, `new: 0`, the same generation, `log/*.jsonl`,
  `heads.json`, `external-heads.json` and `current.nq.gz` unchanged.
- Checks: kgx-ids self-test ok (33 examples); `npm test` 18 of 18; `npm run check` ok (706 entries); `tools/check-skills.mjs`
  18 of 18; `check-kgx-store.mjs --write` 17 of 17 the same (9 min 10 s); page test (headless Chromium, local server):
  the default view, a name search ("Jubilee Place", 69 rows), the 11 views, `#e=id:cwb0413` (One Canada Square), the
  term `cwk:Building` by its encoded IRI: 0 page errors, 0 console errors, 0 failed requests, no outside link to an IRI
  under https://kgx.foaf.tv/, no old name shown; the dashboard: 0 page errors.

Open items: nothing is hosted at https://kgx.foaf.tv/ (IDs and terms do not resolve; owner: "No dereferencing needed
yet"); F53 (`key-model-buildings` version 5); the four Flow tools were not re-run (their heads are the mapped versions;
a re-run with the same inputs mints the same terms).

## 2026-10-08: Pacific Tavern, the first detailed building model

- The owner gave a CC0 photo of the Pacific Tavern, Redriff Road (set `cwredriff`, data/images/contrib/cwredriff/):
  "Extrapolate a full 3D model and add it to rep as new default for that building." Identified as OSM way 259277099,
  model index 7477 (the name on the roundel, the Quebec Way sign, the outline). One person in the photo, no
  recognisable face, no number plate.
- New: tools/lidar-roof-profile.py (EA DSM 2022 and 2020 minus DTM 2022, tiles TQ3575 fetched 2026-10-08, not
  committed), docklands/models/w259277099-pacific-tavern.spec.json (sizes from the photo at about 127 px a metre,
  heights from the LiDAR, judged colours, each with evidence), tools/build-building-models.mjs (operation
  build-building-models, graph building-models), docklands/data/building-models.json and a .glb; the 3D page draws the
  model instead of the extruded outline (Layers > Show > Detailed models; card row; Night lights the panes);
  tools/test/building-models.test.mjs. contrib-photos.mjs cwredriff: graph photos-cwredriff.
- Found: the OSM outline is two wings at 57 deg; the south wing (the face in the photo) is 9.7 m deep in the LiDAR
  against 11.4 m in OSM; the north wing is one storey (eaves 3.4 m, ridge 6.0 m), not two.
- Open: the rear, the south gable end and the north wing's windows are extrapolated (no photo). The kgx store was not
  repacked (build-kgx.mjs) in this session. Skill: docklands-3d-page, "Detailed building models".
- Later the same day (owner, with two phone screenshots: the pink selection boxes round custom models "are drawn even
  when occluded. Not needed."): no outline round a selected detailed model; every selection outline is now hidden by
  what is in front of it (the route line stays on top). index.html (render and the Line-style top pass,
  selectBuilding) and building-keys.js.

## 2026-10-08: WebXR for the 3D page

- Owner: "add a thoughtfully designed webXR interface which exploits the extra screen space ... highlight businesses in
  different categories, events coming up that are in view etc." New docklands/xr-layer.js: immersive-vr and
  immersive-ar sessions and a one-eye preview (?xr=preview&go) for screens with no WebXR; table model and street
  level; panels Places in view (12 categories, Open now), What's on in view (events, markets, works), Focus (the page's
  own card), control bar; beacons and labels. index.html: render() takes one WebXR eye; pickRay, drawModelMesh,
  DocklandsXRCtx. Data found by a subagent inventory: the page had never loaded feeds/works/works.json,
  registry/model-box-pois.json or the CWG hours; they now feed the headset panels.
- Tests: docklands/test/xr-check.mjs with docklands/test/webxr-mock.js, 8 of 8 pass (headless Chromium, SwiftShader);
  the normal page loads with no error. Not tested on a real headset. Skill: docklands-3d-page, "WebXR".
- Open: events are a snapshot (works.json; re-run tools/fetch-works.mjs); headset frame rate unknown.
- Later the same day, after the owner's first test on a Quest (hands only): stencil and depth on the XR layer (the gold
  river reflections were drawn everywhere), a nearer-far depth range, presses with click-or-drag, one-hand move and
  two-hand turn and scale of the city, panels moved by their titles, a two-row control bar at chest height (floor up and
  down, Style: Map / Lines / CRT, Sky: Dark / City / Off, Photo), trees on by default. xr-check.mjs: 11 of 11.
  Roof shapes, London-wide terrain and wind were given to three subagents the same day (their own entries follow).

## 2026-10-08: Wind on the 3D page

- Owner: "it would be cool to have weather - can we get wind vectors too?" New docklands/wind-layer.js: Layers > Show >
  Wind (off by default; `?wind`), https://danbri.github.io/londat/cwplans/docklands/?wind&view=cw . Moving streaks
  along streamlines at 10 m, 120 m and 975 hPa (about 300 to 400 m, over the towers), coloured by speed, widths in
  metres (also in the WebXR eyes); a readout with speed (km/h, m/s), direction, gusts, temperature, weather, cloud,
  precipitation, the model and the clock time. Follows the page clock (sky.js).
- Data: Open-Meteo forecast API in the browser, one request for a 5 x 4 grid over the model box, 6 hours round the
  clock; model DWD ICON-D2 (about 2 km), then ICON seamless; fallback the 10 m wind of cache/latest.json. Nothing is
  stored. Licence: Open-Meteo CC BY 4.0, DWD CC BY 4.0 (new register source `dwd-icon`). Refused: the UK Met Office
  2 km model on Open-Meteo, which is CC BY-SA 4.0 (share-alike; londat CLAUDE.md allows only OSM).
- Cost (SwiftShader): 5,880 segments, 575 kB static buffers, no upload per frame (the animation is in the fragment
  shader); a redraw every 40 ms only while Wind is on and the tab is visible.
- Tests: headless, mocked API and real API, 1600 x 900 DPR 1 and 390 x 844 DPR 3, Rotherhithe (night and day) and the
  plan view: no page errors. Skill: docklands-3d-page, "Wind (2026-10-08)".
- Open: ICON-D2 requests from the container failed (the fallback, ICON seamless, worked): check on a phone that the
  readout names ICON-D2. A wind grid theme in the hourly cache (cwplans-londat-cache) would remove the third-party
  request and keep a history.

## 2026-10-08: Terrain of London (Hills of London) on the 3D page

- Owner: "we should pull in open(ish) altitude data for all of London from whatever that API is we used on the
  glitchcan-minigam trees bristol game. City would be less flat." Source: EU-DEM v1.1 (Copernicus; open with
  attribution, Regulation (EU) No 1159/2013) through the OpenTopoData public API, as in trees/tools/fetch-elevation.mjs.
  Licence checked on https://www.opentopodata.org/datasets/eudem/ (2026-10-08). Register source copernicus-eudem.
- New: tools/fetch-london-terrain.mjs (fetch, then operation fetch-london-terrain, graph london-terrain in
  kgx/external-heads.json; kgx store not repacked), data/raw/london-eudem25m-250m.json.gz (raw heights and request
  cache), docklands/data/london-terrain.json (237 x 185 points at 250 m, BNG E 503000-562000 N 155000-201000, 179 kB),
  docklands/terrain-ring.js (Layers > Show > Hills of London, on; strip to the LiDAR edge, offset blend over 2.5 km,
  haze, credit line), index.html (script tag, far plane 60 km while on, one draw call after the terrain, init).
- Measured: 439 requests (about 14 minutes), 0 no-data points; Hampstead Heath 138 m, Shooters Hill 128, Crystal
  Palace 116, Westerham Heights 247; EU-DEM minus LiDAR in the model box median +2.0 m (p10 -0.8, p90 +6.4). Headless:
  no page error at 1600 x 900 DPR 1 and 390 x 844 DPR 3 (rotherhithe, greenland, pier, area, share links); night photo
  views unchanged in mean luma. Skill: docklands-3d-page, "Terrain of London".
- Open: from river level the ring is mostly hidden (Greenwich Park is inside the LiDAR box; 0.1% of pixels change at
  Island Gardens); no water or buildings outside the box; haze by distance from the box, not the eye.
- Headset view, Drone and views (owner: "Also dont forget Drone etc mode"): a third bar row: Drone (six vehicles,
  stepped from the headset frames), Ride or Watch, View (the page's named views). xr-check.mjs: 12 of 12.
