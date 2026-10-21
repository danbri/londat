---
name: docklands-data-curation
description: >-
  Curate the Canary Wharf, Isle of Dogs and Docklands open data in cwplans — the building registry
  (cwb- ids), occupants, postcodes, chain-store branches, heritage, river, feeds, the atlas, the 3D model data,
  the data register, pipeline.json and METHODS.md, and the data-quality audit. Use this when rebuilding or adding a
  source, joining two sources, changing a tool in cwplans/tools/, judging why two sources disagree, or about
  to correct a wrong value. READ "CATALOGUE FIRST" BEFORE PATCHING ANYTHING: the owner's direction (October 2026) is
  to catalogue and analyse error classes, not to fix records one at a time, because the classes drive the
  compositing layers. Holds the fault register (F1...) and the rebuild order. The 3D page itself, web crawls and the
  public registers have their own skills (docklands-3d-page, cwplans-web-harvest, cwplans-public-registers). Append
  what you did to ACTIVITY-LOG.md in this directory before you finish.
---

# Docklands data curation

Pages: https://danbri.github.io/londat/cwplans/atlas/ (everything joined; data quality at
`#quality`), https://danbri.github.io/londat/cwplans/docklands/ (3D).
**Repository.** Since 2026-10-07 the whole project (pages, tools, skills, data) is in danbri/londat, folder `cwplans/`
(before: danbri/glitchcan-minigam, folder `magpie/cwplans/`; history there:
https://github.com/danbri/glitchcan-minigam/commits/7be94dc/magpie/cwplans). Commit ids before 2026-10-07 in this skill
and in the activity log are glitchcan-minigam commits unless they are named as londat commits. Details: "Data hosted in
danbri/londat" below.
Policy for this directory: the londat `CLAUDE.md`, "Data policy (the cwplans exception)" (personal,
organisation and address data allowed during prototyping; no proprietary or restricted-licence data; OSM
under ODbL allowed and tracked; website crawls allowed for scoping and recorded). The owner's rules with their dates
are in `methods-intro.md` (top of METHODS.md).
Store finders (owner, 2026-10-03: "we are permitted per industry convention to submit storefinder forms with UK
postcodes"): a UK postcode in a brand's store-finder search, nothing else; limits and method in `cwplans-web-harvest`.

**Activity log:** [ACTIVITY-LOG.md](ACTIVITY-LOG.md), dated, newest last. Add an entry for every session
that changes data, tools, checks or policy: what changed, the commit, the measured effect (audit counts
before and after), and what is still open. The other cwplans skills write their entries here too. The open items
waiting for the owner are listed in one place in the newest review entry (first: 2026-10-07, "skills review");
start there, and move an item out when the owner answers.

## Skills for this project

| skill | home | reach for it when |
|---|---|---|
| `docklands-data-curation` (this one) | `cwplans/skills/` | policy, catalogue first, the fault register, joins, rebuild order, methods, provenance, the data register |
| `docklands-3d-page` | `cwplans/docklands/skills/` | editing `docklands/index.html` and its scripts: programs and vertex formats, interface, styles (Line drawing, Vector CRT), splats, Night mode and its calibration, the fp16 lesson, the plotter SVG and the owner's iDraw 2.0 A3, building keys and the facade atlas, headless testing, shipping |
| `photo-view-reconstruction` | `cwplans/docklands/skills/` | the owner sends a photo: landmarks, the least-squares camera, hold-outs, the time from the sun, a `?view=` entry; telephoto skylines and bearings (set cwdock) |
| `blender-station-models` | `cwplans/docklands/skills/` | station boxes in Blender through blender-mcp under Xvfb; the models in londat `third_party/tfl/am3d/models/` |
| `cwplans-kgx` | `cwplans/skills/` | the knowledge graph in londat `kgx/`: graphs, IRIs, the Shardborough store, `tools/check-kgx-store.mjs`, the search page `kg/`, Factoidal issue 697 |
| `cwplans-dataflow` | `cwplans/skills/` | the owner's rule for pipeline work: operations on immutable named graphs (`tools/kgx-ops.mjs`, `Flow`), the operations and their versions, the order of runs, the idempotence test |
| `cwplans-feed-discovery` | `cwplans/skills/` | London RSS, Atom and iCal feeds at scale (`tools/discover-feeds.mjs`, `feeds/discovery/`) |
| `cwplans-permits-and-works` | `cwplans/skills/` | permits, works, closures and what's on (`tools/fetch-works.mjs`, `feeds/works/`, `feeds/whatson.html`) |
| `cwplans-web-harvest` | `cwplans/skills/` | crawling entity websites, the headless render, store finders, JSON-LD repair, Factoidal and N-Quads (known faults, `tools/check-factoidal.mjs`), idioms, sameAs groups, the typed CWG directory, site search, opening hours by mall, mall plans, what the markup is for, the reports, the Chromium proxy CA fix |
| `cwplans-public-registers` | `cwplans/skills/` | GIAS, CQC, ODS, charities, Ofsted, gambling, Active Places, FSA pubs: licences, fields dropped, the join and its traps (F17 to F20), rejected sources |
| `cwplans-london-datastore` | `cwplans/skills/` | the London Datastore walk: the v3 export API and terms, `tools/walk-london-datastore.mjs` (walk, triage, harvest), the triage rules, the rule-driven harvest of the listed datasets (`tools/lds-harvest-auto.mjs`, harvest-log.json, F36 to F41), the joins to the registry (`tools/join-lds.mjs`), the ranked backlog, F22 and F23; amending rounded UPRNs in a copy (`tools/amend-uprns.mjs`, F22, F25) |
| `cwplans-open-portals` | `cwplans/skills/` | the other open-data portals (data.gov.uk, planning.data.gov.uk, borough portals, Nomis / ONS, national APIs): `tools/walk-portals.mjs`, licence classes, triage states, harvests in `feeds/portals/`, size rules |
| `docklands-sky` | `cwplans/docklands/skills/` | the page clock and `?t=`, the sky (sun, moon phase and limb, planets, stars, constellation lines, Milky Way, satellites), Open-Meteo weather, EA tide at the time shown, the photo-time solution, `tools/fetch-sky.mjs` and the snapshots, their licences |
| `cwplans-river-and-water` | `cwplans/skills/` | the river, docks and water: PLA notices to mariners, CRT stoppages, Thames Barrier tests, EA tide and feeder-river levels, tidal lock rules, swim-water results for Eden Dock and the Royal Docks, EA sondes and WIMS, TfL river buses, moorings and vessels (`tools/fetch-river.mjs`, `feeds/river/`); no open live AIS |
| `cwplans-crown-lighting` | `cwplans/skills/` | the coloured crown lighting (One Canada Square's halo, 25 Bank Street, Newfoundland): how colours are chosen, the aviation flash, the (incomplete) history, `tools/fetch-crown-lighting.mjs`, `registry/sources/lighting/`, judging a colour from a photo |
| `cwplans-live-state` | `cwplans/skills/` | live state in the zone (`tools/fetch-live.mjs`, `feeds/live/`): hire bikes, lift outages, station busyness, JamCams, power cuts, storm overflows, NOTAM cranes, the helicopter route H4 and EGR159; what cannot be known (live helicopter positions, dockless bikes) and the ranked backlog |
| `cwplans-londat-cache` | `cwplans/skills/` | the londat cache: hourly history of live state (`tools/cache-londat.mjs`, run files in `cache/runs/`, `cache/live-*.sqlite` per closed month, workflow in londat), `cache/latest.json` read first by the pages (`live-cache.js`), `cache/zone-{core,lds,portals}.gpkg` for QGIS (`tools/build-zone-gpkg.mjs`) |
| `cwplans-construction` | `cwplans/skills/` | the index of works in progress (`registry/sources/construction/sites.json`, `tools/build-construction-index.mjs`): Planning London Datahub status with LDD dates, the status rules S1 to S5, joins to NOTAM cranes, Street Manager, OSM, brownfield, site allocations and Wikidata, F32 to F35, identifying a site in a photo |

## Ship at once

Owner, 2026-10-03: "shipping immediately to live site is fine and urgent. Don't batch things up, as live site is my only
way to see progress." Commit and push each working change to `main` as soon as it passes its check (syntax, a headless
load with no page errors, `check-data-register.mjs`), then confirm the live file matches the commit
(https://danbri.github.io/londat/ + path; `.github/workflows/pages.yml` deploys a few minutes after the push). Do not
hold finished work back to bundle it with other work. (Until 2026-10-07: master of danbri/glitchcan-minigam and
https://danbri.github.io/glitchcan-minigam/ + path.)
The page-side recipe and the lesson behind "re-read the whole line" are in `docklands-3d-page`.

**Check that git took every new file.** A container can carry a local `.git/info/exclude` that ignores
`magpie/cwplans/registry/sources/` (seen 2026-10-06 in a glitchcan-minigam checkout; the same can happen to
`cwplans/...` here), although files there are tracked. `git add <dir>` then skips new
files silently, and `check-data-register.mjs` still passes (it checks the disk, not git). Commit 2d83b25e said it held
`cwg-directory-typed.json` and `.nq` and did not. After `git add`, run `git status --short` and look for each new
file; `git check-ignore -v <file>` names the rule; add a needed file with `git add -f <file>`.

## Ways of working (the owner's words)

Collected on 2026-10-07 from the owner's messages of the session of 2026-10-02 to 2026-10-07. Repo-wide rules
(ASD-STE100 reports, full URLs, no Haiku without agreement) are in the londat `CLAUDE.md` (and in the
glitchcan-minigam one).

- **Reports.** "Please answer with specificity appropriate for a GIS pro reader. Assume I have forgotten details
  already, links into our gh repo(s) are v useful. I forget what is moved into londat already." (2026-10-05). Long
  answers in one block: "Give me part 3 in a single copy-pastable block. In ios app the ui breaks" (2026-10-05).
  Results on the live pages: "Can we see the results in the web app, via deeplinks?" (2026-10-05): give the
  https://danbri.github.io/londat/... link (before 2026-10-07: https://danbri.github.io/glitchcan-minigam/...) with the
  `?view=`, share hash or `id=osm:` that shows the result.
- **Releases.** "let me know when you have pushed release to check" (2026-10-03): after a push, say so and give the live
  URL ("Ship at once" below).
- **Scope.** "Prioritise sure, but do the whole lot" (2026-10-03). "Also don’t stop any of our earlier in-progress
  tasks" (2026-10-06).
- **Subagents.** "Subagents pls" (2026-10-07; on 2026-10-03: "Also subagent for a synthetic drone view").
- **Infrastructure, not chat.** "Ok these lists, are they in our infrastructure (skills, registry, data available to
  the 3d map / atlas)?" (2026-10-04); "don't waste good info by burying it in our chatlogs" (2026-10-06). A list or a
  finding is done when it is in a skill, the registry or a data file that the 3D page or the atlas shows.
- **The 3D view.** "We also need our data to be fully available throughh, and bring to life, the 3D view." and "Ok now
  the ui does no justice to the amazing materials you collected." (2026-10-03).
- **Data apart from code.** "Ofc eventually we will clean up and separate data vs code so this current tool can be
  localised and extended, even if initially the viewer / 3D world was a side effect from exploring the data landscape."
  (2026-10-05). So new code should not fix the zone in many places; the key rules in `docklands-3d-page`, "Future
  expansion", follow this.
- **The model.** On 2026-10-05 the session ran on Haiku from 18:55 to 19:41 UTC (a `/model` switch,
  during the Blender station work; it is not clear that the owner chose it). Owner: "When did we get switched to
  haiku? / I put you on 55 already." Haiku answered 6 messages and made no tool calls (transcript), and no commit in
  either repository falls in that window (master 1b345204 at 18:07, then b4df1ab2 at 21:32; londat 0077caa at 18:03,
  then f94783a at 19:51). Rule: repo `CLAUDE.md`, "MODEL: NO HAIKU WITHOUT THE OWNER'S AGREEMENT".

### Sessions, context and cost (2026-10-07)

Owner: "Let me know if I flooded context and need to restart a new session." and "This session is long though. Are you
auto-compacting? Does every single message burn a ton of tokens?" (2026-10-07). The session context had reached about
490,000 of 1,000,000 tokens (orchestrating session's figure). Each model call reads the whole context again, so a long
session makes every later step dearer. So:
- Tell the owner when the context is too full to continue well.
- Give large tasks to subagents: each starts with a small context, does the work, and reports back in a few lines.
- Start a new session for new work. The state carries over in the skills and in ACTIVITY-LOG.md, not in the chat: write
  there what the next session needs (owner's words with the date, open items, measured numbers) before you stop.
- Keep reports short and put the long material in the repository.

## Catalogue first

`tools/audit-quality.mjs` runs the same checks on every rebuild (39 on 2026-10-03, nine classes:
identity, position, attribute conflict, validity, pipeline, routing network, currency, coverage, meaning). Output:
`quality/issues.json`, `quality/CATALOGUE.md`; the analysis and the proposed compositing layers are in
`quality/README.md`. When you find a wrong value:

1. Name its class. If no check covers it, add one (method, population, breakdown, examples, rule) and
   re-run. Do not edit the record.
2. Change a tool only when the fault is in our own pipeline (class "pipeline") or in a join rule, and keep
   the check so the count shows the effect.
3. Re-run the audit and compare: the targeted count should fall and no other count should rise. Write the
   counts in the activity log.
4. Read a new check's examples by hand before trusting it. In October 2026 two first drafts were wrong
   (a repeated-word check flagged real names such as "Tian Tian Market"; a postcode check called valid OSM
   ";" lists malformed), and one claim in the analysis (branch coverage) was wrong until it was computed.

## Fault register

Faults found in this project's joins and tools. "Open" means catalogued and measured, not yet fixed.

| id | found | fault | class | status | evidence |
|---|---|---|---|---|---|
| F1 | 2026-10-03 | One Wikidata item attached to two outlines: One Canada Square's coordinate lies in the Cabot Place mall outline below the tower, so `build-registry.mjs` gave the mall the tower's record (235 m, 50 floors, owner, Wikidata occupants) as well as the tower | identity (join rule) | fixed in 02da9a3: an item named by an OSM `wikidata` tag is not attached to a second outline by coordinate. 7 buildings changed; companies matched to a building 5,345 → 6,355 | audit ID-1, ID-4 (0 after the fix) |
| F2 | 2026-10-03 | OSM tags hold ";" lists (`addr:postcode="E14 9DT;E14 9FQ"`, `level="0;1"`); `postcodes.mjs`, `build-registry.mjs` and `build-branches.mjs` read the list as one value | pipeline | fixed: `tools/osm-values.mjs` `osmList`, fixture tests in `tools/test/`. Registry postcode links 1,050 → 1,146; companies matched to a building 6,355 → 9,787; 312 more OSM features counted under 299 E14 postcodes | PL-1 (now: list postcodes missing from the record that holds the feature): 57 → 0; VA-2: level lists remain (not yet parsed by the level readers) |
| F3 | 2026-10-03 | `build-branches.mjs` writes "Unit " before OSM `addr:unit`, which often already says "Unit 14": "Unit Unit 14" | pipeline | fixed: `unitLabel` adds "Unit" only to a bare designator ("14", "14a", "R12") | PL-2: 52 → 0; 57 branch addresses changed (also "Unit Promenade Level" → "Promenade Level") |
| F4 | 2026-10-03 | Mall and below-ground occupants placed by a 2D point-in-outline test: the malls run under several buildings, so shops land in the building above. Example: Boots (OSM, Canada Place, Mall Level -1) placed in The Ivy "within 2 m"; FSA "Boots the Chemist (4)" (Jubilee Place) inside Northern Trust; Nicolas (One Canada Square mall) inside Crossrail Place | position (join rule) | rule in use (2026-10-21, KR6.3 rule 1): `tools/registry-placement.mjs` `applyPlacement`, the last join of `tools/build-registry.mjs` and the logged operation `place-occupants-by-mall-and-postcode` v1 applied to the committed registry (londat commits 135a7a50 code, e489ffd5 data): every OSM, FSA and branch occupant of a named CWG mall (from the branch table, the CWG join, OSM `addr:place`/`addr:housename`/`addr:street` or the FSA address) goes to the mall host outline, the point outline kept as `point_in`, the OSM mall level by the F48 rule (`mall_level`). Links moved to a mall host: OSM 58, FSA 51 (6 with an address point, 45 at a postcode centre or shared point), branches 8; 91 points already in their host. Remainder, measured: 27 occupants of malls with no host outline (Churchill Place 16, Wood Wharf 8, Columbus Courtyard 3: OSM has no outline named for them) and 30 below ground with no mall named, in a building with no basement record | SP-6: 122 of 332 → 57 of 393 (mall names another complex 91 → 27, all in a mall with no host; below ground 31 → 30); SP-2 173 → 118; SP-7 325 → 640 links placed by a key (high 285, medium 299, low 56) |
| F5 | 2026-10-03 | The registry had no heights for most buildings: only OSM `height` tags and Wikidata were read | coverage | fixed in 02da9a3 for the atlas: `build-atlas.mjs` takes the 3D model's LiDAR height by point-in-polygon of the model footprints (1,079 of 1,129) | CV-1: height 95.6% |
| F6 | 2026-10-03 | OSM names buildings after tenants ("HSBC UK" for 8 Canada Square) | identity (source) | rule in use: Wikidata label first | ID-3: 20 |
| F7 | 2026-10-03 | FSA positions: more than half are postcode centres or shared points, and were used for building placement | position (source + join rule) | rule in use (2026-10-21, KR6.3 rule 1, the same rule and commits as F4): an FSA point within 3 m of the ONSPD centre of its postcode or shared by 3 or more premises (the SP-3 test), and a branch at a mall or postcode centroid, never places an occupant in a building. 271 of the 446 FSA occupants had such a point (postcode centre 153, shared 118). Placed by a key instead: mall host 52, street address + postcode 108 (high), street address 31, same name and postcode in another source 20, one building at the postcode centre 26 (low); 34 listed under their postcode (33) or dropped as outside the Canary Wharf postcodes (1); branches at a centroid: 14 by their mall, 6 to `placement_unplaced`. The source class stays (SP-3 counts FSA records, not our use) | SP-3: 412 of 764 (source); `stats.registry_use`: in a building by such a point 0, by a key 237, under the postcode only 48 |
| F8 | 2026-10-03 | Wikidata occupant and headquarters links fetched without dates: former tenants look current (the Financial Services Authority at One Canada Square) | currency (query) | partly fixed: one QLever query fetches P580/P582 and P576 for every occupant and headquarters link (`tools/build-categories.mjs`); former tenants no longer glow. The registry still lists them | TM-4: 34 undated → 4 current, 6 former, 24 undated |
| F9 | 2026-10-03 | OSM level and CWG mall level use different schemes; the offset depends on the mall | attribute conflict (source schemes) | closed 2026-10-21 as a duplicate of F48 (same cause: around the estate OSM `level` is the physical level and `level:ref` the CWG number, so the "offset per mall" is the mix of the two conventions); rule in use in `tools/mall-plan-evidence.mjs` (`level:ref` first, else `level`): 81 of 88 placed occupants agree. The audit check AT-3 still reads `level` alone (59 of 87): give it the F48 rule | AT-3: 46 of 72 differ; Cabot Place −1 for 19 of 26, Jubilee Place 0 for 11 of 13 |
| F10 | 2026-10-02/03 | Earlier faults, fixed when found: `simplify()` collapsed closed rings (the same fault again in the 3D page's plotter export, `docklands/plotter-svg.js` `simplify()`, fixed 2026-10-06); incomplete Thames multipolygons dropped (needed relation members); DLR drawn on station roofs (DSM) until bridge points over 20 m were interpolated; scripts ran side effects when imported (main guards added) | pipeline | fixed | ACTIVITY-LOG.md, 2026-10-02 |
| F11 | 2026-10-02/03 | Wrong claims in our own text, fixed: an FSA search URL and a flood-check link that returned 404; a guessed Wikidata id; a feed marked verified behind a bot challenge; wrong bearings in a README; "Geofabrik" named as the OSM source (it was openstreetmap.fr) | documentation | fixed | ACTIVITY-LOG.md |
| F12 | 2026-10-03 | The OSM walking network below ground is thin and inconsistent: platforms and concourses drawn as areas that paths do not share nodes with; escalators without levels; levels joined with no connector | routing network (source) | open; areas joined by hubs in `build-indoor.mjs`, the rest measured | NET-1 to NET-4: 42 parts, 192 level joins, 30 connectors without levels, 46 places off their level |

| F13 | 2026-10-03 | Tunnel controls from secondary sources: Canada Water Jubilee "22 m down" (Wikipedia) and North Greenwich "25 m down" (an interview) were 4 m and 6 m deeper than TfL's measured rail levels; a depth "below ground" has no stated reference point | attribute conflict (source precedence) | fixed: TfL FOI rail levels added as controls, the old ones kept with `superseded_by` and not applied (`applyControls` skips them) | AT-5: 2 |

| F14 | 2026-10-03 | `fetch-cwg.mjs` parse: the category regex stopped at the tag's own closing div (no category on any of 369 pages); "United Kingdom" (unit) and "55 Upper Bank Street" (upper) read as levels; the first place in list order won ("Bank Street" inside "Upper Bank Street"); only E14/E16 postcodes (Wood Wharf uses E22) | pipeline | fixed: `registry/sources/brands/tools/cwg-fields.mjs` with tests; re-run from the cached pages. 339 entries with categories; 4 levels, 1 mall, 5 missing malls, 3 postcodes corrected; branches unchanged | `tools/test/cwg-fields.test.mjs` |
| F15 | 2026-10-03 | Business contact tags (phone, email, contact:*) dropped by `registry-osm.mjs`, and `build-registry.mjs` copied only website and opening_date to occupants | pipeline (coverage) | fixed: occupants keep opening_hours, cuisine, wheelchair, check_date, start_date, operator, url, website, phone, email, contact:* (cwplans exception) | buildings.json occupants |
| F16 | 2026-10-03 | CWG directory joined only through the brand table: 226 of 374 entries had no registry occupant | coverage (join rule) | fixed in `build-registry.mjs`: name keys + place (mall, postcode or building), never across two malls; else a new occupant by street address, mall host outline or the one building of the postcode, with a confidence. 336 of 374 linked; 38 unplaced by class | CV-3: 38; SP-7: 8 low; CV-2: 205 → 162 |

| F17 | 2026-10-03 | One UPRN on many register records: GIAS gives 8 schools at different postcodes UPRN 6064816 (a council office, inside the Poplar Public Mortuary outline); a first join put 9 schools in that building. One more UPRN point is 300 m from the school's own GIAS point | identity (source) | rule in use: a UPRN given to records at two or more postcodes in one register, or over 150 m from the register's own point, is not a key | ID-5: 9 |
| F18 | 2026-10-03 | Register addresses that are not where the organisation works: 16 GIAS correspondence addresses (overseas schools, 30 Skylines Village), 84 records at the registered-office service at E14 5HU / 10th floor 5 Churchill Place (ODS and charities), 13 care-of and accountant addresses, 22 charity contact addresses in residential buildings | meaning (source) | rule in use: excluded before the join and counted | SE-3: 135 |
| F19 | 2026-10-03 | "The one registry building with the postcode" is not "the postcode covers one building": registry postcodes come from occupants, so a pub carried E14 0EY and took the Newby Place health centre (8 ODS records); a virtual-office address (71-75 Shelton Street) carried E14 5RE | join rule | fixed: the postcode alone places a record only when the ONSPD centre is within 50 m of that building and the address names no other street | CV-4: 14 (centre over 50 m) + 2 (street) |
| F20 | 2026-10-03 | One organisation as two register records in one building (ODS provider and its site, "360 CAMHS" and "360 CAMHS LONDON"; OSM "Sk:n" and CQC "Sk:n - London Canary Wharf"): name keys differ, so both stay | identity (join rule) | rule in use (2026-10-21): the branch-key rule (`tools/registry-branch-key.mjs`, operation `merge-occupants-by-branch-key` v1; "Recount of 2026-10-21", rule 2): an ODS head office and an ODS site with one name key in one building are the provider and its site (one occupant, medium: 3 pairs at 30 Churchill Place); OSM and register records join by a shared identifier, also from OSM tags (`ref:GB:cqc_location`, `ref:GB:nhs_ods`, `ref:edubase`: Pure Sports Medicine, Randox Health, The Baltic Medical Centre, the Barkantine dental service, Britannia, Barkantine and Allen's pharmacies, Seven Mills school) or a former identifier (`was:ref:GB:cqc_location`: Sk:n, medium). Left on the review list (`registry/buildings.json` `branch_merge_review`): "360 CAMHS" (head office at 25, site at 30 Churchill Place: different numbers in one street) | audit ID-2: 89 -> 110 (after the placement rule) -> 7, all 7 on the review list with a reason |
| F21 | 2026-10-04 | EA tide gauge Tower Pier (0007): readings jump by 0.4 to 0.9 m between neighbours for about two hours around low water (4 Oct 2026, 00:00 to 01:15 UTC: -0.745, -0.808, -0.822, -0.620, -0.426 m OD while Charlton read -1.59 to -1.02); a dry or faulty gauge, not the river | validity (source) | rule in use in `docklands/sky.js` `cleanGauges`: a reading is left out when its difference from the nearest other gauge departs more than 0.45 m from the median of that difference over 2 h either side. 5 of 119 Tower Pier readings in the 3-4 Oct snapshot; 0 at Charlton and Silvertown | `data/sky/tide-2026-10-03.json` |
| F22 | 2026-10-04 | UPRNs rounded by a spreadsheet in the GLA Cultural Infrastructure Map (London Datastore 23697, `os_addressbase_uprn`): 12-digit UPRNs published as 200000000000, 100023000000 or 1E+11, so many venues share one false UPRN. The rounding is in every release checked (2018-2020 files of 2ko88, all 2023 revisions, the GLA ArcGIS service) | validity (source) | partly fixed in a copy: `tools/walk-london-datastore.mjs` flags the cell `uprn_suspect` (an exponent, or 9 or more digits ending in 5 or more zeros); `tools/amend-uprns.mjs` amends a copy (`cultural-infrastructure.uprn-amended.geojson`) with every change in `cultural-infrastructure.uprn-amendments.json`. Method: `cwplans-london-datastore`, "Amending rounded UPRNs". Fixed 12 of 56 rows (12 of 49 venues): 6 from other releases (high), 6 from OS Open UPRN points in the building outline (medium); still unknown 44 rows: 3 rows (2 venues) with only a low candidate, not applied, and 41 rows (35 venues) with no single candidate | `feeds/london-datastore/cultural-infrastructure/`: 56 of 599 zone venues with a UPRN; amendments file `meta.counts` and `meta.validation` (route a 61 of 61 and route b medium 9 of 9 correct on valid UPRNs rounded blind) |
| F23 | 2026-10-04 | GLA Planning Constraints Map GeoPackages of 2025-12-23 (Site Allocations, Strategic Industrial Land, Locally Significant Industrial Sites, Brownfield Register) hold polygons with OBJECTID, Shape_Length and Shape_Area only; the Brownfield Register CSV in the same dataset has the attributes but its objectid is another numbering (127 of 238 zone polygons lie over 500 m from the CSV point with that id) | meaning (source) | rule in use: never join by that OBJECTID; the brownfield harvest reads the CSV and its own points (geox, geoy; WGS84 or BNG per row); the three others are kept as designation outlines with `attributes_in_source: none` | `feeds/london-datastore/*/` meta |
| F24 | 2026-10-04 | EA sonde BARIERA (Thames Barrier Gardens Pier) publishes impossible values: ammonium 192 to 245 mg/L, pH 5.2, turbidity -93.6 NTU (two days to 4 Oct 2026, 'Unchecked'), while Cadogan Pier and Erith read pH 7.8, ammonium 3 to 8 mg/L | validity (source) | rule in use in `tools/fetch-river.mjs` `SUSPECT`: values kept and flagged in `values.suspect` (pH outside 6 to 9.5, negative turbidity or oxygen, ammonium over 50 mg/L) | `feeds/river/ea-sondes.json`: 3 of 20 series |
| F25 | 2026-10-04 | GLA Cultural Infrastructure Map 2023 venue points in 10 of 26 layers (libraries, museums and galleries, commercial galleries, creative and coworking workspaces, making and manufacturing, set building, textile design, music venues, theatres) sit a constant vector from the OS Open UPRN point of their own UPRN: (-112, +54) m, theatres (+113, -54) m; 114 of 491 venues with a valid UPRN in the zone. The size and direction agree with a missing OSGB36 / WGS84 datum change | position (source) | rule in use (recount 2026-10-21) in `tools/join-lds.mjs`: a venue of an offset layer (`group_offsets` of the amendments file) gets a link by position at low confidence only; the UPRN key comes first. Positions not moved (a source fault); `tools/amend-uprns.mjs` measures the offset per layer | `cultural-infrastructure.uprn-amendments.json` `meta.catalogue.group_offsets` |
| F26 | 2026-10-04 | `feeds/live/helicopters.json` lists the arc centres of a restricted area among its vertices (EGR159: 51.491944 -0.013611 and 51.505 -0.019444), where the AIP says "thence clockwise by the arc of a circle radius r centred on C to P"; drawn as a polygon through the centres, the area loses its two rounded ends | geometry (our parser) | rule in use on the 3D page: a vertex equal to an `arcs` centre is replaced by the clockwise arc from the vertex before to the vertex after; `tools/fetch-live.mjs` still writes the centres (open) | docklands-3d-page skill, "Crown halo by date and overlays" |
| F27 | 2026-10-04 | London Datastore metadata understates the area of the data: 36 open datasets whose `custom.geo` says Local Authority, Borough, Parliamentary Constituency, Greater London, Region or Other (or whose title says Borough) hold finer rows: 21 with zone codes, zone points or zone postcodes (e.g. Road Casualties by Severity e1z1j and Prevalence of Childhood Obesity 23g07 by LSOA, MSOA or ward; Decentralised Energy Capacity Study 2g1rn with points and TOIDs; Fuel Poverty 2jxzj by LSOA), 13 with ward, station or town centre names only, 2 London-wide finer; and 20 of the 190 open datasets with no geo field hold zone values | meaning (source metadata) | rule in use: `walk-london-datastore.mjs probe` opens the data of every open dataset whose metadata area is unknown, borough or London-wide, and the area found in the data replaces the metadata class (`triage.json` `relevance_final`) | `feeds/london-datastore/probe.json`: 54 zone, 5 london-fine |
| F28 | 2026-10-04 | The GLA Opportunity Areas GeoPackage (London Datastore epr7z, 2025-12-23) holds polygons with OBJECTID, Shape_Length and Shape_Area only, the same class as F23; the dataset's older shapefile zip (2025-08-27) carries the names, boroughs and site references (OPA00000001...) | meaning (source) | rule in use: the harvest reads the shapefile zip (`HARVEST` `opportunity-areas`); before taking a 2025-12-23 Planning Constraints GeoPackage, check `attributes_in_source` and look for an older file with attributes | `feeds/london-datastore/opportunity-areas/`: 11 areas with names |
| F29 | 2026-10-04 | File traps in London Datastore resources: the BIDs dataset (vqmx7) has two resources named `business_improvement_districts.zip` dated 2025-05-12 (one shapefile, one KML), and that shapefile is in Web Mercator (EPSG:3857), not BNG like the other GLA files; the London Plan NHS HUDU model workbook (2gq4w) is an encrypted xlsx that no reader opens; the LAEI 2019 Air Quality Focus Areas shapefile (2zj76) has no .prj | pipeline (source files) | rule in use: a harvest names a resource by id when two share a file name; `readShpZip` unprojects EPSG:3857 to WGS84 and records `from: EPSG:3857`, and reads a shapefile with no .prj as BNG only when every vertex lies in the London BNG range (recorded in `layers[].from`); the probe records an unreadable file as an error in `probe.json`, and its dataset stays `none` or `deferred` | `probe.json` 2gq4w; `business-improvement-districts.geojson` meta |
| F30 | 2026-10-04 | The London Solar Opportunity Map release of 2025-12-08 (vdxyl) rates roofs from LiDAR of 2012 for 53,792 of the 55,261 zone TOIDs (2015 for 1,467, NA for 2): towers and roofs built since (Wood Wharf, much of the Isle of Dogs skyline) are rated from the old roof or missing | currency (source) | rule in use (recount 2026-10-21) in `tools/join-lds.mjs`: every solar link rated from LiDAR of 2012 or earlier carries `fault: F30: rated from LiDAR of <year>; check the building is older` (1,266 links in `registry/sources/lds/building-links.json`); values shown as published with `lidar_date` | `feeds/london-datastore/solar-opportunity/` |
| F31 | 2026-10-04 | Air quality summary statistics (London Datastore 2w184, `annual-objectives-by-site-and-species.csv`): the columns `LatitudeWGS84` and `LongitudeWGS84` hold Web Mercator metres (6712695.6436, -8656.836 for CT3 Sir John Cass School), not degrees; `Latitude` and `Longitude` hold the degrees | meaning (source column names) | rule in use: the harvest reads `Latitude`/`Longitude` and keeps the mislabelled columns as published; never read a column as WGS84 by its name alone (the probe and the CSV harvest test the value range) | `feeds/london-datastore/air-quality-annual-objectives/`: 760 rows, 15 sites |
| F32 | 2026-10-04 | Planning London Datahub (LDD) commencements never closed: 158 site groups commenced more than 7 years ago and have no completion date (Baltimore Wharf 2008, Westferry Printworks 2016); 27 of them show construction now (OSM, NOTAM or Street Manager), 131 show nothing | currency (source) | rule in use in `tools/build-construction-index.mjs`: such a site is "commenced long ago" (S2, low) unless another source shows work now (S2b, on site, medium) | `registry/sources/construction/sites.json` meta.counts |
| F33 | 2026-10-04 | PLD dates lag and one is computed: 4 approved sites with a NOTAM crane or an OSM building under construction have no commencement (60 Gracechurch Street, 75 London Wall, TW2 Blackwall, G Park Docklands); 44 of 2,908 commenced records started after their `lapsed_date` (30 Marsh Wall: lapses 2025-07-28, commenced 2025-10-03), so `lapsed_date` is decision + permission period, not an observation | currency (source) | rule in use: S4b (a crane NOTAM within 60 m or an OSM building=construction outline makes an approved site "on site", medium); a commenced record is never dropped for a past `lapsed_date` | sites.json meta.counts `started_not_recorded`, `commenced_after_lapsed_date` |
| F34 | 2026-10-04 | Wikidata "state of use: under construction" (P5817 Q12377751) on finished buildings: Landmark Pinnacle (Q16258428, completed 2020) and South Quay Plaza (Q21585412), 2 of the 4 such items in the zone | currency (source) | rule in use: Wikidata state is shown on the site record and never used for the status | `data/raw/construction/wikidata-buildings.json` (local) |
| F35 | 2026-10-04 | PLD polygons that are point markers: of 5,127 major zone records 1,923 have a square of a few metres round the centroid and 1,401 none (1,803 real); the PLD gives no storeys for 30 Marsh Wall or 25 Cuba | geometry (source) | rule in use: a polygon under 50 m2 is no polygon; the footprint falls back to OSM construction outlines, then a circle of the stated site area, then 25 m, and `footprint.from` says which | sites.json meta.counts `pld_polygons` |
| F36 | 2026-10-04 | Codes that read as postcodes: the London Consumer Expenditure Estimates workbooks (London Datastore vq8y6) key rows by sector plus a spending category (`RM66LE` = sector RM6 6 + LE), and some of these strings are real postcodes (EC2M 1LE); a test of every cell took 50 rows as zone postcodes | identity (join key) | rule in use: `tools/lds-harvest-auto.mjs` reads postcodes only in a column where half or more of the first 300 non-empty cells are postcodes or whose header names a postcode, and sectors only in a sector column | vq8y6: 50 false rows before; 1,176 rows by sector after |
| F37 | 2026-10-04 | Our ExcelJS stream read without styles returned date cells as serial numbers (37004 for 2001-04-24) in the first LDD harvest (2jxq0, a 27 MB workbook): dates lost their meaning in the output | pipeline | fixed: the streamed reader keeps styles (`styles: 'cache'`), SheetJS reads with `cellDates` | 2jxq0 re-harvested |
| F38 | 2026-10-04 | London Datastore datasets that hold the same records in several resources or releases: LDD permission-level and unit-level files (2jxq0), the LDD extracts of AMR 13, 14 and 15 repeating older snapshots of the 2020 extract, wide and long census files (296do), house prices as wide xls and long csv (2jkxd), LAEI database zips in two formats (em9mg); read whole they repeat rows (the LDD output was 53 MB) | meaning (source packaging) | rule in use: one resource per file stem (format words and long/wide removed, the wide twin first, same md5 once) and hand rules with the reason (`HAND` in the tool) | 2jxq0 53 MB to permission level; 296do wide files only |
| F39 | 2026-10-04 | Zone references missed older ward codes: 2001-Census and 2000s ward tables use the 2003 CAS and 2005 statistical ward codes (00BGGG form) and the 2011 Census ward tables use merged wards (E36); `zone-codes.json` had neither, so such tables read as having no zone rows | coverage (our references) | fixed: `walk-london-datastore.mjs refs-old-wards` adds `ward2003` (62 codes, ONSPD wdcas03cd and wdstl05cd) and `cmwd2011` (the merged wards of the zone 2011 wards, ONS lookup) | land use by ward (2489z) 0 to 42 rows; country of birth by ward (e553n) 0 to 976 |
| F40 | 2026-10-04 | Transposed GLA ward tools: the area codes run across a row, one column per ward, with the values below (2011 Census ward tools); a row-by-row zone test finds no zone row | meaning (layout) | rule in use: a sheet with 3 or more distinct area codes across a row and numbers below them is read column-wise (label columns and the zone code columns, every row); the first version also fired on a row that holds a ward's own, borough and merged-ward codes and dropped the tree canopy table: hence distinct codes and numbers below | e553n 976 values in 94 zone columns |
| F41 | 2026-10-04 | LAEI 2006 modelled value files carry no coordinate columns: each row is keyed by GRID_ID (`gla503560175340`), which is the 20 m point's BNG easting and northing; read as a table they have no zone key | meaning (identifier) | rule in use: a hand rule reads the easting and northing from GRID_ID, then thins the 20 m grid to 100 m like the point file em95y | 298jq, 2jrkd, 2np13, 2ry8d, 2yrpy, e188j |
| F42 | 2026-10-04 | One dataset, two licence statements: the Tower Hamlets ArcGIS Hub "Planning Datasets" names no licence ("No special restrictions ... except that data scraping tools should not be used") while planning.data.gov.uk serves the same listed buildings, conservation areas, TPOs and Article 4 layers under OGL; the City of London INSPIRE map service states none, and its layers' INSPIRE records on data.gov.uk give OGL (35), the OS public-sector INSPIRE end-user licence (34) or nothing (94) | meaning (licence metadata) | rule in use in `tools/walk-portals.mjs`: the licence is read per layer or dataset, never per service; the copy with a named open licence is taken; the OS INSPIRE end-user licence is restricted (`licenceClass`) | `feeds/portals/boroughs/triage.json`: City not-open 130, Tower Hamlets held 6 |
| F43 | 2026-10-04 | The City of London map service withholds geometry for the Cultural Spaces layer (MapServer/175): `f=geojson` and `f=json` both return features without geometry, while the box filter works (237 in the zone) | geometry (source) | rule in use in `tools/portals/boroughs.mjs`: features kept with `geometry: null` and `meta.geometry_withheld`; place them by address; when only `f=geojson` loses geometry, the `f=json` rings are converted | `feeds/portals/boroughs/city-cultural-spaces/` |
| F44 | 2026-10-04 | DfT STATS19 collisions 2021-2025: the column `lsoa_of_accident_location` holds 2021 LSOA codes; matched against 2011 codes only, 1,431 of 10,362 zone collisions were found | meaning (source column) | rule in use in `tools/portals/national.mjs`: an LSOA column is matched against 2011 and 2021 zone codes; the vintage is read from the values, not the column name | `feeds/portals/national/dft-stats19/` meta.counts |
| F45 | 2026-10-04 | Nomis Census 2021 bulk zips: in the TS010 (population density) zip the OA and LSOA CSVs are empty (0 bytes) while MSOA and coarser are filled; census2021-ts079.zip is not a readable zip (no end-of-central-directory, twice); the TS009 zip names one file `-ulta.csv` | validity (source files) | rule in use in `tools/portals/nomis.mjs`: a 0-byte CSV is skipped and the next level is read (listed in `meta.empty_files_in_zip`); an unreadable zip is recorded as unavailable | `feeds/portals/nomis/census2021-ts010-msoa/`, `nomis/triage.json` |
| F46 | 2026-10-06 | One branch, two building records from two sources: each source places the branch by its own rule (OSM point in the outline above the mall, F4; FSA point at a postcode centre, F7; CWG mall address to a mall building), and nothing joins the records across sources at branch level, so the same shop sits in two buildings. Examples: Atis (FSA "34 North Colonnade" in cwb-0466, OSM in cwb-0418), Le Chalet Cryo (OSM in cwb-0421 KPMG, CWG "Mall Level -1, Canada Place" in cwb-0466), Charbonnel et Walker (OSM in cwb-0411 Cabot Place, FSA "Cabot Place" in cwb-0455). Not this class: a chain's real branches (Notes at Crossrail Place and 20 Canada Square), and possibly Flowers & Plants Co (CWG lists Canada Place and Jubilee Place: check) | identity (join rule, across sources) | rule in use (2026-10-21): one branch key across sources, `tools/registry-branch-key.mjs` (operation `merge-occupants-by-branch-key` v1, the last join of `build-registry.mjs`): a shared identifier (OSM id, FSA id also from the OSM tag `fhrs:id`, CWG page, store page, register ids, Wikidata item also from the OSM tag `wikidata`), else the name in one building, else the name in buildings within 250 m placed by the order OSM node with a level in a mall > CWG mall address > address key > OSM point > FSA point > register or Wikidata coordinate. One occupant keeps every source record (`merged_from`) with `branch_key`, `merge_rule`, `merge_confidence`, `merge_evidence`; pairs that are not sure go to `branch_merge_review`. 181 merges (high 162, medium 19; 23 across buildings: Atis, Le Chalet Cryo, Crockett & Jones, Penhaligon's, Joe Blake's, Yumtea, Yolk, Fairgame, Six by Nico, Yummzy and others), 184 records absorbed, 36 review entries | audit ID-2 110 -> 7 (different sources 101 -> 3); new check ID-6 (this heuristic, no source in two of the buildings) 46 issues (23 names) -> 8 (4 names: Poplar, WatchHouse, Pilpel, City of London Dry Cleaners), all 4 on the review list. Before 2026-10-21: 2026-10-21, same heuristic recomputed (names lower case, letters and digits only): before the placement rule 94 names in more than one building, 42 with one source per building, different sources, within 250 m; after 79 and 25. WEB: 6 branches whose own page links to 2 registry buildings (`third_party/cwplans-structured-data/coref/entities.json`, `conflict`); REG: of 101 occupant names in more than one building, 48 have one source per building, different sources, buildings within 250 m (heuristic count, not checked by hand; 10 more have one building confirmed by two sources) |
| F47 | 2026-10-06 | One fixed weekly value in the web markup that is not the place's hours: five sites publish `Mo-Su 09:00-17:00` (Wahaca, Gallio, Charbonnel et Walker, Plant World, Pittagoras), while the CWG page and OSM give evening hours for the restaurants (Wahaca CWG `Mo-Su 12:00-22:00`, agreement 0.38). Two of the five sites carry Rank Math markers (`#richSnippet`); the source of the other three is not known | validity (source value) | open; `tools/hours-by-place.mjs` lists each pair below 0.5 agreement in `agreement.worst`. Rule to add: a web value of exactly 09:00-17:00 every day is not used when another source gives different hours | `registry/sources/web/hours-by-place.json` agreement |
| F48 | 2026-10-06 | Two level numberings for the same floor: CWG pages give the signed number on CWG signage ("Mall Level -1"); in OSM around the estate `level` is the physical level (0 = ground) and `level:ref` the CWG number (note on way 193407928), but some mappers put the CWG number in `level`. Read `level` alone and Canada Place's mall floor reads 0 for some shops and -1 for others | meaning (two conventions) | rule in use in `tools/mall-plan-evidence.mjs`: compare the CWG level with `level:ref` first, else with `level`; 81 of 88 placed occupants with both agree. The 7 that disagree have `level` only and follow the physical convention | `registry/sources/brands/mall-plan-evidence.json` |
| F49 | 2026-10-06 | A website URL with HTML character references: the CWG directory gives Diptyque's website as `https://www.diptyqueparis.com/en_uk/?_mkpid=…&#038;_mkpc=…` (9 times `&#038;`, the HTML escape of `&`). It is copied unchanged into `cwg-directory.json`, `branches.json`, the typed directory (`.json`, `.nq`) and kgx (`cwg` graph, `s:url`). With several `#` it is not a valid IRI (RFC 3987): Factoidal parses and packs it without a warning, Oxigraph refuses it unless loaded leniently | validity (extraction: an HTML attribute value not decoded) | fixed 2026-10-21 (KR6.3 rule 4, londat commit 135a7a50): `cwg-fields.mjs` `decodeAttr` (decimal, hex and the named references of an attribute, applied once; tests in `tools/test/cwg-fields.test.mjs`) on the website attribute in `fetch-cwg.mjs` `parse()`; no new fetch: `fetch-cwg.mjs --rederive` applied it to the committed directory (1 of 312 websites changed), `build-branches.mjs --cwg-websites` to `branches.json` (1), then `cwg-directory-typed.mjs` and the kgx build. Not changed (crawl records of the URL as fetched): `registry/sources/web/site-facts.json` and `third_party/cwplans-structured-data/` (index, page idioms, page records) | `&#038;` in `cwg-directory.json`, `branches.json`, `cwg-directory-typed.json`/`.nq`: 1, 1, 1, 1 → 0; in `kgx/current.nq.gz` 1 → 0 |
| F50 | 2026-10-06 | Open track heights jump between the viaduct deck and the ground: `area.js` takes rail, light-rail and subway heights from the LiDAR surface model (DSM) at each OSM node, so on viaducts a node can hit the deck, the ground beside it, or a roof. Bridge points over 20 m above the ground are already interpolated (F10); smaller jumps stay. 114 of 1,052 open rail lines have a height off the mean of its two neighbours by more than 3 m where the nodes are under 40 m apart (worst 26.2 m, London, Tilbury & Southend Railway bridge; DLR up to 13 m, e.g. 19.6, 13.8, 19.1, 15.1 m). Seen as zigzag red lines in the owner's plot of 2026-10-06 | validity (source sampling) | open. Display rules in use: the drone's tube mode (`drone.js` `rails()`) and the plotter (`plotter-svg.js`) use a moving average over 5 points; the 3D page still draws the raw heights. Rule to add in `tools/build-docklands.mjs`: one deck profile per bridge chain (a robust fit to the DSM samples, with the station and ground ends as anchors), then re-derive `area.js` | the count above (`area.js` of 2026-10-06, script in the activity log entry) |
| F51 | 2026-10-07 | Phone photos are Display P3, and the facade tools read them as sRGB: every JPEG of the owner's sets cwlibrary and cwdock embeds an ICC profile 'Display P3' while its EXIF ColorSpace tag says sRGB. `facade.py` and `measure.py` (OpenCV `imread`) and `tools/facade-tile.py` (Pillow, no profile conversion) take the P3 values as sRGB, and the tiles and the atlas are saved without a profile. Size, CIELAB D65 difference between the right reading and the sRGB reading of the same P3 values: neutrals under 1 (the cwdock white sign 0.3, cream 1.7), red-brown brick 5.7, an oxide-red frame 7.1, the safety yellow of a sticker 24.4 (out of the sRGB gamut) | meaning (colour space of the source files) | open. Rule to add: convert with the embedded profile to sRGB (Pillow `ImageCms`) before `rectify-facade-patches` and `cut-facade-tiles` measure or cut, then bump both operation versions and re-derive the cwlibrary and cwdock graphs and the atlas. Low-chroma tiles (Ontario Point, the library mesh) change little; brick and red frames are desaturated now | `exiftool` on the 24 photos; the P3 and sRGB matrices on the cwdock calibration values (londat `data/images/contrib/cwdock/photos.json` `calibration`) |
| F52 | 2026-10-07 | Buildings finished after the 2022 LiDAR survey with no `building:levels` or `height` in OSM keep the survey-time site in `area.js`: a dig or a guessed 6 m. Seen in the owner's photos of 2026-10-07 (set cwdock): a residential tower on Marsh Wall at Consort Place (OSM way 988728458, model building 21116) is drawn as a pit, ground -7.5 m OD, roof -0.1 m OD, while photo 01 puts its top at about 216 m OD (+-15 m, from a solved camera); Three Deal Porters (way 1428008978, model 36552) is a guessed 6 m and the photo shows 6 storeys (about 25 to 28 m) | currency (source) and coverage (our height rule) | open. Counted on `area.js` of 2026-10-03: 247 model buildings have a guessed height, 21 of them with footprints over 800 m2 (e.g. UNCLE Deptford, Dockley Apartments, Seraphina Apartments, Three Deal Porters, Amparo House); 6 LiDAR buildings over 300 m2 have their ground below 0 m OD (digs, the Consort Place tower among them). Rule to add in `tools/build-docklands.mjs`: for these, take storeys from a dated source (Planning London Datahub storeys, the construction index, Wikidata, a photo count) with the source marked, else flag the building | the counts above (script in the activity log entry of 2026-10-07); cwdock `photos.json` `buildings.consort-place-tower`, `buildings.three-deal-porters` |
| F53 | 2026-10-07 | `key-model-buildings.mjs` writes `s:sameAs https://www.openstreetmap.org/undefined/<id>` for every model building keyed by an OSM way: it builds the URL from `el.type`, and the ways of the OSM clip have no `type` field. 42,244 links in the graph `model-building-keys` (a head, not in the browser store). Found by the subagent that moved the graph IDs to https://kgx.foaf.tv/id/. | pipeline | fixed 2026-10-21 (KR6.3 rule 3, londat commits 135a7a50 / e489ffd5): the `sameAs` line builds the URL from the element key (way or relation), operation `key-model-buildings` version 5; for this checkout (no OSM clip or extract) the operation `osm-urls-from-keys` v1 (`key-model-buildings.mjs --repair-osm-urls`) made the new head `id:graphmodelbuildingkeysd69bccf8249df7e7` from `…40cf5331fa99da1a` (42,244 URLs, each checked against its subject key; 220 relation URLs were right already) | `openstreetmap.org/undefined/` in `kgx/current.nq.gz`: 42,244 → 0 |
| F54 | 2026-10-11 | From a quay the near water is ground: `docklands/build.js` `waterSink` sinks the 20 m terrain grid only more than one cell inside a water polygon that is not tidal ("the edge cells stay: the bank"), so the terrain at about 5 m OD covers the water (3.3 m OD) for up to 20 m out from each dock wall. Seen in the owner's photo of Greenland Dock (2026-10-11, `?view=greenlanddock`): the water starts at the bollards in the photo and about 20 m out in the render, behind a grey slab | validity (our method: grid resolution) | fixed in the Three.js port 2026-10-11 (`build.js` `terrainModel` / `terrainGeometry`: one generic rule for every outline: the terrain triangles are cut along the water outlines, land pieces on the LiDAR with a guard against water returns at the quay, water pieces at the sunk height, a vertical stone quay wall along each outline; Greenland Dock and 2 km of Thames 100 % within 0.5 m with `?layers=water,walls`; 264,625 triangles, was 210,000; skill docklands-3d-page, "Three.js port: dock edges follow the outlines (2026-10-11)"). Open in the WebGL page (`index.html` `waterMask()` / terrainSink: the same cut in its terrain builder, stone colour baked into the wall vertices, the cut heights for its greens and trees, its tide sink on the tidal pieces). Also open: the `?view=greenlanddock` eye is 5 m inside the OSM outline, so the frame's foot is water, not the quay of the photo | `docklands/test/photo-tones.mjs` screenshot; `docklands/test/dock-edges-check.mjs`; `data/images/contrib/greenlanddock/README.md` |
| F55 | 2026-10-18 | Buildings outside the UK with no height in OSM: `cwplans/tools/build-place-tiles.mjs` (places on the globe, KR1.2) takes OSM `height`, else `building:levels` x 3 m, else a national adapter's floors x 3 m (León: the Catastro INSPIRE building parts, area-weighted median of the parts whose centroid is inside the OSM outline), else a stated default (9 m; 3 m for small kinds such as garage, shed, kiosk). Counted per class in each place's `log.json` (`height_sources`), not patched per record. León (OSM of 2026-10-18, 4,213 buildings and parts): OSM height 105, OSM levels 1,452, Catastro floors 2,454, default 177, small default 25; OSM levels and Catastro floors differ by 2 or more for 61. Sarajevo (OSM of 2026-10-18, 7,432 buildings and parts, no national height source: FGU / RGURS not yet reached): OSM height 141, OSM levels 176, default 7,096, small default 19, so 95 % stand at 9 m. 2026-10-20 (place-heights v2): a worldwide raster step before the default, GHSL GHS-BUILT-H R2023A cell average (CC BY 4.0, adapter world-ghsl): Sarajevo default 7,096 -> 0, GHSL 7,096 (3 to 18.2 m, median 10.4); León default 177 -> 0, GHSL 177. A cell average is not a building measure, so the class stays open. FGU (katastar.ba) services need a log-in, a written request and a fee: not reached. Roofs are a second class in the same log (`roofs`): OSM roof:shape where tagged, else the region roof rule, else flat. 2026-10-20 later (place-heights v3, owner "Use ms/overture"): Overture (non-OSM values with an open licence) and Microsoft footprint heights before GHSL: León Overture 7, Microsoft 6, GHSL 177 -> 166; Sarajevo 0 and 0 (Microsoft has no heights in quadkey 120233030; Overture's non-OSM records there are Microsoft footprints without heights), GHSL stays 7,096. Overture num_floors from IGN España (1,009 in León) have an empty licence field: left out. 2026-10-20 night (place-heights v4, place-city-heights v1; owner on the IGN floors: "use the data but keep it distinct and easy to remove if requested. Use for validation at least"): adapter overture-ign-floors, its own crop places/leon/sources/overture-ign-floors.json (9,782 records over the city box), class `overture-ign-floors` after the national floors, switch = its id in place.heights. These records are whole IGN buildings that OSM lacks (1 of 9,782 matches an OSM outline), so they give 0 heights; as EVIDENCE: against the Catastro parts inside each record (area-weighted median), 4,490 records, same floors 89.9 %, within one floor 97.9 %, mean difference +0.05, mean absolute 0.15, max 9 (IGN and Catastro agree: the national floors class is sound where both exist); against OSM building:levels 1 record. The city tier (blocks, OSM geometry via Overture) uses the same order: León city 11,201 buildings: OSM height 14, levels 1,176, Catastro 5,050, Overture 913, Microsoft 208, small 163, GHSL 3,674, default 3; Sarajevo city 48,736: OSM height 32, levels 2,370, small 200, GHSL 46,106 (95 %), default 28. 2026-10-21 (place-city-heights v2): the city ring also draws IGN (León) and Microsoft footprints where OSM has none, each its own geometry class with a switch; their heights: León IGN 10,852: IGN floors 4,927, Catastro 4,524, GHSL 1,268, Overture height 50, default 45, Microsoft 38; León Microsoft 1,907: GHSL 1,669, Overture height 173, Catastro 30, default 35; Sarajevo Microsoft 8,944: GHSL 8,907, default 37 | coverage (source) and validity (our rule: 3 m a storey, flat roofs, roof:levels left out) | open, by design: the rule is the class; better sources per country (3DBAG for the Netherlands, national LiDAR heights) replace the default in the adapter, not in records | https://github.com/danbri/londat/blob/main/cwplans/docklands/data/places/leon/log.json `height_sources`; skill docklands-3d-page, "Three.js port: places as 3D Tiles (2026-10-18)" |

Add new faults here with the next F number, and in the activity log.

### Recount of 2026-10-21 (OKR KR6.3: at most 8 open)

How to count: "open" = the status starts with "open". Each open fault was checked against the code and data on main
(651aa469); a status changed only with a file or a count as evidence; no record was patched (catalogue first). The audit
(`tools/audit-quality.mjs`) was re-run: the same counts as the committed `quality/issues.json` except TM-4 (34 instead of
30, because the local input `data/raw/registry/wikidata-occupant-classes.json` is missing; the committed file was kept).

- Before: 15 open (F4, F7, F9, F12, F20, F25, F30, F46, F47, F49, F50, F51, F52, F53, F55); 2 partly fixed (F8, F22);
  2 fixed or ruled with an open remainder (F26: `tools/fetch-live.mjs` still writes the arc centres; F54: the WebGL page).
- Changed: F9 closed as a duplicate of F48 (the rule is in `tools/mall-plan-evidence.mjs`); F25 and F30 to "rule in use"
  (both in `tools/join-lds.mjs`). F4 and F7 stay open, with the part of the rule that exists named.
- After: 12 open (F4, F7, F12, F20, F46, F47, F49, F50, F51, F52, F53, F55). Still open, checked: F53 (42,244
  `openstreetmap.org/undefined/` links in `kgx/current.nq.gz`; the `sameAs` line of `tools/key-model-buildings.mjs`
  still uses `el.type`); F49 (`&#038;` still in `cwg-directory.json`; `fetch-cwg.mjs` decodes text but not the website
  attribute); F47 (no 09:00-17:00 rule in `tools/hours-by-place.mjs`); F50, F52 (no deck profile and no dated storeys
  in `tools/build-docklands.mjs`); F51 (no colour profile conversion in the facade tools).

Rules that would close the rest, by value (value = faults closed and records corrected, against the work):

1. Mall and postcode-centre rules for every occupant in `tools/build-registry.mjs`: the `MALL_HOST` rule (with the F48
   level rule) for OSM and FSA occupants of a named mall, and an FSA point within 3 m of its ONSPD centre or shared by 3 or
   more premises is not a position (place by address, mall or name). Closes F4 and F7 (SP-6 122, SP-3 412) and removes
   most causes of F46.
2. One branch key across sources (FSA id, OSM id, CWG slug, store page; the sameAs groups of
   `third_party/cwplans-structured-data/coref/entities.json`) and one placement per branch in the order OSM indoor node
   with a level, CWG mall address, FSA point. Closes F46 and F20 (ID-2: 80 cross-source pairs).
3. `tools/key-model-buildings.mjs`: build the OSM URL from `osmKey` (way or relation, as the IRI already does), operation
   version 5; re-derive when the local OSM clip is there. Closes F53 (one line).
4. `registry/sources/brands/tools/fetch-cwg.mjs`: decode HTML character references in the website attribute, then
   re-derive the CWG files from the cached pages. Closes F49 (one line, one URL).
5. `tools/hours-by-place.mjs`: a web value of exactly `Mo-Su 09:00-17:00` is not used when another source gives different
   hours. Closes F47.
6. `tools/build-docklands.mjs`: storeys from a dated source (Planning London Datahub, the construction index, Wikidata,
   a photo count) for buildings after the LiDAR survey, else a flag. Closes F52 (visible in the owner's photos).
7. `tools/build-docklands.mjs`: one deck profile per bridge chain. Closes F50.
8. Facade tools: convert Display P3 to sRGB with the embedded profile before measuring and cutting; bump both operation
   versions. Closes F51.
9. Source faults that stay as measured classes: F12 (OSM walking network) and F55 (heights outside the UK, by design).
   They close only if the owner accepts "rule in use" for a counted class.

Rules 1, 3 and 4 give 8 open (the KR6.3 target); with rule 2, 6 open.

**Done 2026-10-21 (rule 2; F46 and F20 to "rule in use": 8 open -> 6).** `tools/registry-branch-key.mjs`, the last join of
`build-registry.mjs` and the logged operation `merge-occupants-by-branch-key` v1 on the committed registry (inputs:
`registry/buildings.json` after the placement rule, the OSM extract, `postcodes.json`, `ids.json`, by SHA-256; change set:
graph `registry-branch-merge`, 2,874 triples, in the store). Over every occupant, never one record:
- Keys: (1) a shared identifier (high), including the OSM tags `fhrs:id` (238 OSM occupants carry one), `wikidata`,
  `ref:GB:cqc_location`, `ref:edubase`, `ref:GB:nhs_ods`; (2) the same name key in one building (the ID-2 normalisation
  without spaces; also without a place suffix or a final kind word): high with a second agreement (same mall, brand item,
  street number), else medium; the F20 rule (ODS head office + site, medium); a former id in an OSM `was:` tag (medium);
  (3) the same name in buildings within 250 m, one record each, no source twice: placed by the rank (OSM node with a
  level in a mall 1, CWG mall address or mall key 2, high address key or an FSA point whose address names its building 3,
  OSM point 4, FSA point 5, register or Wikidata coordinate 6); medium when 1-2 beats 4+ or 1-4 beats 5+ within 150 m.
- Never merged (review list `branch_merge_review`, 36 entries): an organisation (Wikidata HQ, ODS head office, charity)
  with a chain branch (HSBC, Barclays); different values of FSA id, Wikidata item, CQC location or URN (two Prets in One
  Canada Square, Morrisons Daily, Poplar station and Poplar district); one source twice without a shared id (Canary
  Wall x3, Photo-Me booths); addresses with different numbers in one street (360 CAMHS); a record matching two records of
  one source by name (Hazev); a word-prefix name (Waitrose / Waitrose Cafe, Starbucks / Starbucks Coffee Company, 22);
  two strong positions or more than 150 m across buildings (WatchHouse, Pilpel, Platinum Dental Care, City of London
  Dry Cleaners).
- Result: 181 merges (high 162, medium 19; in one building 158, across buildings 23), 184 records absorbed, occupants
  1,446 -> 1,262; postcodes of 11 buildings recomputed from their evidence (the records that moved took theirs).
- Audit: ID-2 110 -> 7 (all on the review list); ID-6 (new, F46) 46 -> 8 (4 names, all on the review list); SP-2
  118/772 -> 104/684, SP-6 57/393 -> 54/344, SP-7 56/640 -> 52/550 (fewer occupant records); CV-2 164 -> 158 (CWG
  entries now seen by the source merged with them); TM-4 30/34 -> 26/28 (6 duplicate Wikidata records merged; the local
  QLever cache rebuilt). Rises, read by hand: AT-3 59/87 -> 68/97: all 10 new pairs are merged occupants where the merge
  put an OSM level and a CWG level on one occupant (the F48 class, now visible); SP-1 rose 161 -> 163 until the check read
  `merged_from` (fixed in the check, back to 161).
- Traps: the occupant made by a merge has the union in `source` ("osm+fsa"); a tool that asks `o.source === 'fsa'` misses
  it. Read `recordsOf(o)` (the occupant and `merged_from`) and `primary_source` (the primary record's own source):
  `registry-placement.mjs` `postcodeEvidence`, `audit-quality.mjs` (SP-1, SP-3), `build-categories.mjs`, the atlas page's
  FSA count were changed. The OSM tags hold identifiers the registry did not copy (fhrs:id on 238 occupants): read
  them before matching by name. A stale OSM identifier is a conflict, not a match (Morrisons Daily: the OSM fhrs:id is
  not the FSA record's), unless the tag is a `was:` tag (Sk:n). `third_party/cwplans-structured-data/coref/entities.json`
  "conflict" groups (6) were read: Adam Atelier, Flowers & Plants Co and Notes are two real branches each (two CWG pages);
  Atis, Le Chalet Cryo and Charbonnel et Walker are now one occupant each.
- Also 2026-10-21: `hours-by-place.mjs` counts an occupant with a mall and no CWG page in its mall's area (411 -> 424 on
  the same registry; 413 after the merge, which removed 11 duplicate OSM and web records); `build-branches.mjs` copies
  `cwg_website` in its by-name pass too (`--cwg-websites` filled 4: Rockar Jaguar Land Rover, The Henry Addington,
  Trailfinders, Watches of Switzerland).
- After: 6 open (F12, F47, F50, F51, F52, F55). Next by value: rule 5 (F47, one rule in `hours-by-place.mjs`).

**Done 2026-10-21 (rules 1, 3 and 4; londat commits 135a7a50 and e489ffd5, then the kgx build).** Each is a rule over
every record, run through the pipeline, never a patch of one record:
- Rule 3 (F53 fixed): `key-model-buildings` version 5; operation `osm-urls-from-keys` on the head (no OSM clip here).
  42,244 `openstreetmap.org/undefined/` links → 0.
- Rule 4 (F49 fixed): `decodeAttr` in `cwg-fields.mjs`, used by `fetch-cwg.mjs`; `--rederive` and
  `build-branches.mjs --cwg-websites` on the committed files (no fetch). `&#038;` in the CWG files and kgx → 0.
- Rule 1 (F4 and F7 to "rule in use"): `tools/registry-placement.mjs`, the last join of `build-registry.mjs` and the
  logged operation `place-occupants-by-mall-and-postcode` on the committed registry (the full registry build needs local
  UPRN, company and price-paid downloads). 1,090 point-placed links checked: 163 moved, 152 confirmed by a key, 40
  out of buildings, 735 kept at their point (91 already in their mall host). Change set: graph `registry-placement`.
- After: 8 open (F12, F20, F46, F47, F50, F51, F52, F55). Next by value: rule 2 (F46, F20; audit ID-2 now 110, of
  which 101 different sources in one building, the pairs the placement rule brought together).
- Traps met: `join-web-facts.mjs` matches its fact records by the crawl-time building, so it is not re-run after a move
  (16 records would no longer match; the facts on an occupant move with it). `hours-by-place.mjs` leaves out non-CWG
  occupants that have a mall, so 8 records left its area counts when the rule gave them a mall (419 → 411). The
  branch merge does not copy `cwg_website` for CWG entries joined in its second (by-name) pass (4 branches).

## Imagery

Ground textures for the 3D page come from the EA survey download service (OGL): find what covers a box with
`POST https://environment.data.gov.uk/backend/catalog/api/tiles/collections/survey/search` (body: a GeoJSON
polygon), then GET each result `uri` (a ZIP; HEAD returns 405). Products over the model: colour aerial 2008
(40 cm), night-time aerial 2012 (20 cm), LiDAR intensity 2018 and 2020 (1 m), DSM and DTM for 1999, 2003,
2005, 2007, 2012, 2015, 2018, 2020 and 2022, and one 2017 oblique photograph.

- **The aerial photographs are ECW.** Debian's GDAL has no ECW driver and the Hexagon SDK needs a login. The
  ECW 3.3 SDK source (`git clone https://github.com/makinacorpus/libecw`) builds with
  `./configure CXXFLAGS="-O1 -w -std=gnu++98 -fpermissive" --prefix=/opt/ecw && make && make install` (the
  install step fails on headers after the libraries are in `/opt/ecw/lib`; that is enough). Then
  `g++ -x c++ -DLINUX -DPOSIX -D_LARGEFILE64_SOURCE tools/native/ecw2ppm.c -I<src>/Source/include -L/opt/ecw/lib -lNCSEcw -lNCSUtil -lNCSCnet -lpthread -o tools/native/ecw2ppm`
  (the binary is gitignored). Without `-DLINUX -DPOSIX` the headers stop with "unknown machine type". Its
  licence allows decoding in free software; we commit only the decoded, resampled JPEGs (the imagery is OGL).
- **Python here has no working numpy** (Debian's numpy fails to import after a pip install). `build-aerial.py`
  uses Pillow alone; float GeoTIFFs open as mode "F" and `point()` takes only linear functions on them.
- **Mosaics:** paste each tile with integer start and end pixels plus one pixel of overlap, or 1-pixel black
  seams appear at every tile edge (first build, 2026-10-03). Mask pure black: ECW tiles are black outside the
  flown area.
- **Coverage is uneven:** the 2008 colour tiles west of Limehouse come from another flight and are bluer; the
  north-west corner has no 2008 tile; the night survey stops near Whitechapel Road. Say so where the image is
  shown, do not colour-match.
- The page side (drawing the image through the terrain's x, z, resampling to 2048 px for mipmaps): `docklands-3d-page`, "Styles".

## Splats and drone frames

Moved to `docklands-3d-page` ("Styles", Gaussian splats): synthesis (`tools/build-splats.mjs`), the `.splat` format
and the determinant rule, depth compositing, drone frames, OpenSplat training and `tools/publish-trained-splat.mjs`.

## Wikidata through QLever

**Pace ourselves and ask once.** The first version called wbgetentities in batches and got "too many
  requests" (owner, 2026-10-03: "maybe the rate limiting should come from us? Or a more carefully posed efficient
  query? QLever is very good"). Now `tools/lib.mjs` `qlever()` runs one query at a time, at least 1.5 s apart, with
  backoff on 429 and 5xx; and the tool asks two questions in total: the classes of all 65 occupant items (VALUES over
  the ids) and all occupant and headquarters links of the 86 building items with their qualifiers. 2.9 s, no
  retries. Cached in `data/raw/registry/wikidata-occupant-classes.json`; delete it to refresh.

## Towers

- `tools/build-towers.py` fits tiers to the 1 m DSM for the towers of 100 m and over; `docklands/data/towers.json`
  replaces their prisms on the page (today only; the year slider keeps prisms).
- The "2022" composite DSM merges only the 2017-12/2018-01 and 2020-12-12 flights: it is not an independent check of
  2020. The independent check is the 2018 flight, for towers finished by January 2018.
- Glass towers lose returns in the 2020 flight (58% of the roof cells for Novotel and Dollar Bay): use 2018 there.
  Where 2020 has a gap, the composite fills it from near the ground (a 10 m hole at One Canada Square's apex):
  treat such cells as no data.
- OSM outlines lean in the aerial photos they were traced from: shift each footprint by whole metres (at most 4) onto
  the LiDAR building before fitting.
- Report roof RMSE on roof cells only. With walls in, a 1 m misfit at a 200 m wall is a 200 m error (raw RMSE 11 to
  58 m means nothing).
- Wikidata's 104.8 m for 33 Canada Square is probably the height of the next wing of Citigroup Centre; the DSM gives
  78.5 m. Catalogue such differences; do not patch.

## Trees and facades

- `docklands/data/trees.json` (`tools/build-trees.mjs`): GLA public realm trees first, then TPO points, OSM, Forest
  Research Trees Outside Woodland, each only where no kept tree is within 3 m. Only position, taxon, height, crown,
  source and record id are kept (the Bristol rule applies here too). GLA canopy and green cover 2024 are all rights
  reserved, Curio Canopy is CC BY-SA: not used. 20 TOW "lone trees" are over 35 m (cranes or structures): the page
  leaves out trees over 35 m; they are not corrected in the file.
- `docklands/data/tree-species.json` (`tools/build-tree-species.mjs`, 2026-10-09): a species profile per tree of
  trees.json for the Three.js port, from the taxon (61,395 trees: 48,397 species, 12,998 genus or family), else OSM
  `leaf_type`/`leaf_cycle` (437; Overpass, OSM of 2026-10-09, `data/raw/trees/osm-tree-leaf.json.gz`), else a mix
  INFERRED from the setting: street 3,488, park or garden 13,615, wood 1,966, waterside 974 (basis letters; mixes in
  `docklands/tree-species.js`). Taxon coverage by source: GLA 99.6 %, TPO 78 %, OSM 45 %, TOW none (the TOW map has no
  species). No borough inventory adds to the GLA file: it is compiled from the borough inventories (Nov 2025).
- `registry/sources/facades/`: measured bays and colours from CC BY and PD photos. Check against a known count where
  one exists (One Canada Square: 19.9 bays measured, 19.8 known). Most recent Commons photos of the new towers are
  CC BY-SA: look only. Commons and Flickr rate-limit the container (429, retry after 600 s).
- How the page loads and draws trees and photo facade tiles: `docklands-3d-page`, "Styles".

## Page rendering lessons (docklands/index.html)

Moved to `docklands-3d-page`: photo facade mip levels, the vertex alpha byte, pixel-art materials, phone audio, the
fp16 / highp fault, the test sizes and photo views, Night mode, aviation lights and label gestures.

## Measured lessons (the reasons behind the rules)

- **OSM tags can hold lists.** Split on ";" for every tag on ingest (F2).
- **Never prefix a label to free text.** Parse unit designators out of the value (F3).
- **One Wikidata item, one outline.** An OSM `wikidata` tag outranks containment of the item's coordinate
  (F1). OSM itself tags three items on two outlines each (ID-1): model complex → building → part.
- **The estate is three-dimensional.** A mall is a container of its own, below and between buildings;
  place its occupants by mall and level, and keep the building above only as context (F4).
- **Join a directory on name and place, never on name alone.** A CWG entry joins an occupant only when a name key is
  equal and the place agrees (same mall, shared postcode, or the building its address names); two malls never join,
  except Canada Place and the One Canada Square mall, which CWG and the FSA name both ways (F16). Classes left over:
  street addresses with no registry building (Wood Wharf is newer than many outlines), car parks, estate-wide entries,
  pages with no address, renamed venues ("London Museum Docklands").
- **A register address has a role.** Correspondence, registered-office, care-of and charity contact addresses are
  not places (F18). A UPRN is a key only when it is unique to one place and agrees with the register's own point
  (F17). The postcode alone needs one building at the postcode centre, not one building that carries the postcode
  (F19). Keep the key, its precision and a confidence on every link. Register traps in full: `cwplans-public-registers`.
- **Levels are labels.** OSM `level` is a mapper's index; CWG names levels per mall; measure the offset
  per mall (F9). Convert to metres only through published slab levels (`data/sourced-levels.json`).
- **A position has a precision and a meaning.** Postcode-centre points place a postcode, not a building
  (F7). 5,888 of 6,629 heritage points are where an object is kept (SE-2).
- **A registered office is not an occupant.** E14 5HU has 2,652 registered companies (SE-1).
- **Links need dates** (F8). Company status, FSA rating dates, CWG archive dates and the LiDAR survey date
  travel with the values they qualify.
- **Depths need a datum and an owner.** "22 m down" has no reference point; TfL's rail level has a datum
  (London Underground Datum = OD - 100 m). The asset owner's level outranks a rounded secondary depth; keep
  the loser as evidence with `superseded_by` (F13, AT-5).
- **Heights.** LiDAR for buildings older than the survey; nine buildings show under half their
  floor-count height and are newer (AT-1).

## Structured data from rendered pages

Moved to `cwplans-web-harvest`: the plain crawl, the headless render, store finders, the JSON-LD repair classes,
Factoidal and the N-Quads dataset, branch / chain / organisation attribution, opening hours, the Chromium proxy CA fix.
Registers (GIAS, CQC, ODS and the rest): `cwplans-public-registers`.

## Rebuild order

From the repository root:

    node cwplans/tools/build-registry.mjs        # registry/buildings.json (needs data/raw/registry/*)
    # (its last joins are the placement and branch-key rules; on a checkout without its local inputs run them on the
    #  committed file: node cwplans/tools/registry-placement.mjs, then node cwplans/tools/registry-branch-key.mjs)
    node cwplans/tools/join-web-facts.mjs        # occupants[].web from registry/sources/web/structured-facts.json
    node cwplans/tools/build-categories.mjs      # registry/categories.json (QLever only when its cache lacks an item)
    node cwplans/tools/build-atlas.mjs           # atlas/data/atlas.json (reads the registry and docklands/data/area.js)
    node cwplans/tools/audit-quality.mjs         # quality/issues.json, quality/CATALOGUE.md (reads the atlas)
    node cwplans/tools/check-data-register.mjs --write   # every committed data file registered?

After a rebuild of `docklands/data/area.js` or new contributed photos, the keyed and graph steps follow:
`key-model-buildings.mjs` (after area.js only), `contrib-photos.mjs <set>`, `compose-facade-atlas.mjs`,
`build-kgx.mjs` twice, `check-kgx-store.mjs --write` (skill `cwplans-dataflow`, "Order of runs").

The fetch and 3D steps are in `cwplans/docklands/README.md` and `registry/README.md`; the web and register
fetches in their skills. The order of every tool is the `after` list of its activity in `pipeline.json`. Raw extracts
over a few MB stay local (gitignored); `data-register.json` says what is committed and why.

## Methods

Owner, 2026-10-03: "record ALL our data methods in skills or other concrete committed artifacts". The method catalogue
is [METHODS.md](../../METHODS.md) (https://github.com/danbri/londat/blob/main/cwplans/METHODS.md):
the owner rules, every tool by subject area in rebuild order, the hand-judgement steps and the fault register summary.
It is generated: edit `pipeline.json` (tool activities, and `manual_activities` for hand steps) and `methods-intro.md`
(the hand-written policy section), never METHODS.md.
- **Every new or changed tool updates its `pipeline.json` activity in the same commit**: method, rules (source and
  endpoint, query, join keys and thresholds, precedence, what is dropped and why, units and rounding, cache,
  politeness), `area`, `faults` (F-numbers below) and `judgement` (where a hand decision enters and where it is
  recorded). A hand step with no committed script gets a `manual_activities` entry with a `gap`.
- `node cwplans/tools/check-data-register.mjs --write` regenerates METHODS.md, DATA-REGISTER.md and
  pipeline.jsonld. The check fails on an unlisted tool, an empty method or rules, an unknown area and a fault id that
  is not in the fault register.

## Provenance for the knowledge graph

Owner, 2026-10-03: "In future we will create a corpus that brings select sources through a data integration pipeline
into a Knowledge Graph environment. Bear that in mind as we record sources and transforms." So:
- Every tool is an activity in `pipeline.json`: what it used (committed files, local raw files, external sources
  with the endpoint and the request), what it generated, the rules that change data, network or not, deterministic
  or not, and which activities must run before it. Add or change the entry in the same commit as the tool.
- Keep source identifiers as they come (OSM type/id, Wikidata QID, UPRN, TOID, FHRS id, company number, cwb- id):
  they become IRIs. Never replace a source id with a name.
- Keep dates and qualifiers with values (fetch date, survey date, P580/P582): a graph without time repeats F8.
- `node cwplans/tools/check-data-register.mjs --write` checks the manifest against the tools and the register
  and writes `pipeline.jsonld` (W3C PROV-O, DCAT, Dublin Core).

## Data register

Every committed data file has an entry in `data-register.json`: sources (keys into its `sources` table with
licence and attribution), `osm.use` (raw, derived, counts, ids, notes, none), the OSM extract, and
`shown_on` pages. The check fails on an unregistered file and on a page that shows OSM data without the
visible "© OpenStreetMap contributors" link to https://www.openstreetmap.org/copyright. Add the entry in the
same commit as the file. `skills/` directories (at any depth, so `docklands/skills/`
too) and `vendor/` are not data and are not registered.

## Data hosted in danbri/londat

Owner, 2026-10-04 19:50 UTC: "Created londat repo"; 2026-10-05 11:27 UTC: "londat repo fixed for Claude." (first commit
48e4851, 2026-10-05 11:29 UTC). From 2026-10-05 https://github.com/danbri/londat held the bulk open-data extracts,
because the main repository of that time (danbri/glitchcan-minigam: about 1.5 GB tracked in all directories, pack about
1 GB) and its Pages site (1 GB limit) were at their limits. Old blobs stay in that repository's history: do not rewrite
history (owner decision).

**The move of 2026-10-07: the whole project is here.** Owner, 2026-10-07: "Migrate docklands 3d map, data tools, lg etc
from magpie/cwplans/* into londat repo." and "Let me know where/how to configure github" ("lg" was read as the kg
search page). Copied at glitchcan-minigam 7be94dc (londat commit d312be6, an unchanged copy; the adaptations follow in
the next commits): `magpie/cwplans/` to `cwplans/` (447 files, same relative paths, merged with the bulk folders
already here), `third_party/cwplans-structured-data/` to `third_party/cwplans-structured-data/`, and the docklands-view
MCP server `tools/view-mcp/` to `tools/view-mcp/` (`.mcp.json` here). In glitchcan-minigam, `magpie/cwplans/` then keeps
only redirect pages that send each old page URL, with its query and hash, to the same page here (from the merge of
that side, which waits until the site here is on).

- **One checkout.** Tools find every path through `cwplans/tools/londat.mjs`: `LONDAT_DIR` is the checkout that holds
  it (set it only to read another copy), `LONDAT_CW` is `cwplans/`, `cwPath()` gives the local file. Paths to the
  repository root went one level shorter (`cwplans/` is one folder deep; `magpie/cwplans/` was two): `node_modules/`,
  `third_party/`, `kgx/` and `tools/view-mcp/` are at the root. Commands run from the root: `node cwplans/tools/x.mjs`.
  Libraries: `package.json` at the root (`npm install`; Playwright pinned to 1.56.1 for the container's Chromium 1194).
- **Register.** One register, `cwplans/data-register.json` (the londat copy of the hosted entries is gone). The field
  `"hosted": "londat"` was removed from its 421 entries, `lds-harvest-auto.mjs` no longer writes it, and
  `build-zone-gpkg.mjs` picks the London Datastore and portal GeoJSON by folder. `check-data-register.mjs` checks every
  file in `cwplans/` in this checkout, patterns (`cache/runs/*/live-*.json.gz`) included. `osm_elsewhere_in_repo` now
  lists OSM use in danbri/glitchcan-minigam (trees/, ua17, edot), checked when a glitchcan-minigam checkout is next to
  this one (or at `GLITCHCAN_DIR`). The register covers `cwplans/` and `third_party/cwplans-structured-data/`; `kgx/`,
  `data/images/`, `third_party/tfl/` and `third_party/cwg/` have READMEs and manifests but no register entries (open).
- **Site.** One GitHub Pages site, https://danbri.github.io/londat/ (landing page `index.html` at the root; the 3D page
  is https://danbri.github.io/londat/cwplans/docklands/). `.github/workflows/pages.yml` deploys on each push to `main`
  that changes more than `cwplans/cache/` (the owner switches it on once: Settings > Pages > Source: GitHub Actions).
  Not published: `third_party/` (no open licence, or the crawl data of the scoping phase; owner, 2026-10-07: "Repo only
  for now"), `cwplans/cache/runs/` and `cwplans/cache/*.sqlite`. Status of all of it in one page:
  https://danbri.github.io/londat/dashboard/ (owner, 2026-10-07: "Make a unified dashboard url for me"). Size at the move: 430 MB of the 1 GB limit (the workflow stops at 950 MB).
- **Pages** read data through `data-base.js` (`CwData.url(path)`, `CwData.json(path)`; a `.gz` name is gunzipped with
  DecompressionStream): every path from the same site, except `cache/` (`latest.json`, read by `live-cache.js`), which
  comes from `https://raw.githubusercontent.com/danbri/londat/main/cwplans/` because the site is not redeployed on the
  hourly cache commits (raw.githubusercontent.com caches about 5 minutes and sends `Access-Control-Allow-Origin: *`).
  The kg page reads its store from `../../kgx/` (same site; `?base=` reads another copy).
- **Cache workflow.** `.github/workflows/cache-live.yml` runs `cwplans/tools/cache-londat.mjs` from this repository
  (`npm ci --omit=dev`: proj4, geotiff, earcut); before the move it checked the tools out of glitchcan-minigam.
- **Knowledge-graph IDs.** Owner, 2026-10-07: "Use https://kgx.foaf.tv/id/ prefix for IDs. i own the domain; nothing
  is hosted there yet. iDs should be alphanumeric". Since then every name that the project mints for the knowledge graph
  is `https://kgx.foaf.tv/id/<local>`, with `<local>` lowercase alphanumeric (`cwplans/tools/kgx-ids.mjs`; the code
  table and the rules are in the skill `cwplans-kgx`, "Graphs, IRIs, vocabulary"). In `pipeline.jsonld` a source is
  `src<key>`, a tool activity `tool<id>`, a local file `local<path>`; committed files keep their GitHub URLs. The
  vocabularies moved the same day (owner: "move them to kgx.foaf.tv? Yes pls. No dereferencing needed yet"): `cwk:` is
  `https://kgx.foaf.tv/vocab#`, `cwp:` `https://kgx.foaf.tv/pipeline#`, the idioms ShEx namespace
  `https://kgx.foaf.tv/idioms#` (until then under danbri.github.io/londat/kgx/ and danbri.github.io/glitchcan-minigam/).
  The web-harvest files in `third_party/cwplans-structured-data/`, `kgx/log/*.jsonl` and the graph versions written
  before 2026-10-07 keep the old names (upstream data and history); `build-kgx.mjs` maps them when it lifts them.
- **Sizes.** Push in batches well under 500 MB; no file over 100 MB; keep the site under 1 GB.
- **Until 2026-10-07 (history).** The rule was: a file moved to londat when it was a data file (not `.js` code, not a
  `README.md`) in `feeds/london-datastore/` or `feeds/portals/` (later also `feeds/kml/` copies, `cache/`,
  `coverage/`); other files over 1 MB stayed in glitchcan-minigam because a page loaded them at first load
  (`docklands/data/area.js`, `trees.json`, `atlas/data/atlas.json`, `registry/buildings.json`, `postcodes/postcodes.json`,
  textures, splats), or they were the owner's photos (`docklands/reference/`), or registry inputs (about 13 MB). First
  move (2026-10-05): 400 files, 189.7 MB: 237 in `feeds/london-datastore/` (172.1 MB) and 163 in `feeds/portals/`
  (17.7 MB), at the same relative path under `cwplans/` (e.g.
  https://github.com/danbri/londat/blob/main/cwplans/feeds/london-datastore/heat-demand/heat-demand.json). Each moved
  file had `"hosted": "londat"` in the register, `check-data-register.mjs` checked hosted files in a londat checkout next
  to the main one (`LONDAT_DIR`, default `../londat`), and `--write` wrote a londat copy of the hosted entries. The pages
  read the hosted files from raw.githubusercontent.com through `DATA_BASE` in `data-base.js`.
- **Not done yet:** London Datastore files over 1 MB (40 files, the largest about 10 MB; check with `find`) are not gzipped in londat, because its tools read and
  write plain JSON. Gzip them only together with a `.gz`-aware reader in those tools (as `readOut` in walk-portals.mjs).
  The portal files keep their own rule (`writeOut`: over 1 MB as `.gz`).

## Sources to investigate (the queue)

Owner, 2026-10-06: "Make a note in londat of data sources to investigate. Extract anything new and unexplored from
this Gemini response and queue it up. Then begin by checking for data in our initial area of London (SE16,
Rotherhithe, Limehouse, Canary Wharf, Isle of Dogs etc etc.)."

- The queue: https://github.com/danbri/londat/blob/main/SOURCES-TO-INVESTIGATE.md and `sources-to-investigate.json`
  (id, API, licence and class, status, what we already hold, next step). Before adding an item, search this repository
  (and danbri/glitchcan-minigam for work before 2026-10-07) for the name: most items in the Gemini answer were already catalogued or in use (Mapillary, KartaView,
  Panoramax, OpenAerialMap, EA aerial photography and LiDAR, the London Green Infrastructure Framework).
- First check of the areas: `node cwplans/tools/probe-imagery-coverage.mjs [--offline <date>]`. Fetch step,
  then the operation `lift-imagery-coverage` (skill `cwplans-dataflow`) gives the graph `coverage-imagery` in kgx
  (named in `kgx/external-heads.json`; `build-kgx.mjs` packs it). Areas are hand-drawn boxes in the tool (`AREAS`):
  Canary Wharf, Isle of Dogs south, Limehouse, Rotherhithe / SE16, and the zone.
- Share-alike sources (Panoramax, KartaView, Mapillary: CC BY-SA 4.0) give counts only. Their raw answers stay in
  `data/raw/coverage/<date>/` (gitignored); the log names them by SHA-256. Open answers (OpenAerialMap CC BY 4.0, EA
  OGL) are committed in londat `cwplans/coverage/raw/<date>/`.
- API facts met: KartaView `/2.0/photo` times out ("apiCode 408") at a 500 m radius and allows at most 150 items a
  page; "no photos" is apiCode 601 with no result; its `/sequence` box search answers "Restricted access!".
  Panoramax `/api/search` gives no paging links: when an answer has `limit` items, split the box. OpenAerialMap
  `/meta` pages by `page`. Mapillary needs a token.

## Contributed photos

Owner, 2026-10-06 (four photos round Canada Water Library): "Here are photos I cc0-share from 16:30ish today ... Store in
londat data/images/contrib/cwlibrary/ and figure out which buildings they are, so we can abstract vector patterns or
textures for their 3D models."

- **Where:** londat `data/images/contrib/<set>/`: the photos as given (renamed `<date>-<place>-NN-<subject>.jpg`), a
  `README.md`, and `photos.json`, the hand-made part: licence, creator, date and time, what each photo depicts, each
  building with its OSM way, model index and height, evidence and confidence, judged facade notes, and the facade
  regions (`patches`: photo, ROI in photo pixels, measuring box in rectified pixels, face, face width).
- **Run:** `FACADE_PY=<venv python> node cwplans/tools/contrib-photos.mjs <set>`: operation
  `rectify-facade-patches` (facade.py and measure.py in `registry/sources/facades/tools/`, writes `rect/<id>.jpg`) then
  `lift-contrib-photos`; graphs `facade-patches-<set>` and `photos-<set>` named in `kgx/external-heads.json`; then
  `build-kgx.mjs`. Python here: Debian's numpy does not import; make a venv (`python3 -m venv v && v/bin/pip install
  numpy opencv-python-headless scikit-learn scipy pillow`, about 1 minute).
- **Identify by evidence, in this order:** a name on the building; a unique form (the library's inverted pyramid, the
  station drum); then OSM in the area (the registry stops at x -740; the area round Canada Water is not in it, but the
  model is): `osmium extract -b <box>` of `data/raw/docklands/greater_london-latest.osm.pbf`, then `osmium export
  --add-unique-id=type_id` (an area id `a<n>` is way n/2 when n is even, relation (n-1)/2 when odd); a floor count from
  a rectified patch against `building:levels` and the model height; the sun (`sunAt`) for which faces were lit and
  which way the camera looked. Overpass may answer 504: use the local extract.
- **Floor counts:** count on a rectified patch, not on the photo (perspective). A repeat can hold two floors: Ontario
  Point's thick band comes every two floors (its side balconies, one a floor, are half the repeat at the same height,
  and 12 repeats x 2 + ground = 25 levels; LiDAR 82.2 m above the ground, roof frame included).
- **Measured periods need judgement:** the autocorrelation picks the strongest repeat, which may be a glazing bar (The
  Founding: 13 px, the floor is 82 px), a mesh (the library: 5 and 11 px) or a two-floor unit. Write the judged
  pattern in `photos.json`.
- **Colours** from evening photos in shade or against the light are much darker than the materials (Columbia Point's
  cream frame measured #4d504f). Use them for patterns, not as material colours, unless the face was sunlit.
- **Rectification fails** on a face with projecting balconies or a strong texture (the red part of The Founding; the
  library's mesh plus its sloped roof edge gave a skewed result): a narrower ROI on flat wall worked for the library;
  for the balcony face only judged facts were kept.
- **Model:** match an OSM centroid to the model outline that contains it (`area().buildings`, `dec(p)` is already in
  metres), or better, the OSM key (`docklands/data/building-keys.json`). In `area.js`, `b` is the ground in m OD and `h` the
  height above it: the roof is `b + h` m OD. The first cwlibrary notes gave `h` as the roof level and 76.5 m (82.2 - 5.7)
  as Ontario Point's height; corrected the same day. The station drum has no model outline of its own. The Founding's model height comes from its levels (it is
  newer than the 2022 LiDAR); the page's default colouring draws heights from levels (`s` 1) or newer buildings (`s` 4)
  in `C.bldlv` (amber), others in `C.bld`.
- **Tiles** (photos.json `tiles`; operation `cut-facade-tiles` in `contrib-photos.mjs`, helper `tools/facade-tile.py`):
  a 256 px tile per building that repeats on every wall, with its size on the wall in metres (`w_m`, `h_m`) and a WGS84
  point inside each building it is for. Three kinds: a cut of a rectified patch (whole bays by whole floors, from the
  middle of one band or pier to the next); a mirrored half (`mirror_right_half`) when the face is symmetric and the photo
  shows one half cleanly (Ontario Point); a **vector pattern** drawn in metres (`rects`, PNG and SVG) when the photo gives
  the sizes but not the colours (Columbia and Regina Point, against the sun: colours judged, both written down). Leave
  out what does not repeat (the library's window boxes: mesh only). Metres: a known size first (the OSM face width, the
  floor from levels and the LiDAR height), the metric aspect from the vanishing points (`registry/sources/facades/tools/
  metric.py`) only where nothing else is known; on Ontario Point it was 10% from the known sizes.
- **Atlas:** `FACADE_PY=<venv python> node cwplans/tools/compose-facade-atlas.mjs` puts the tiles into slots 16 on
  of `docklands/data/tex/facades.jpg/.json`, keyed by OSM id with model indices from `key-model-buildings.mjs`. The page
  draws them on any building (skill `docklands-3d-page`, "Building keys"). Order after new photos: `contrib-photos.mjs
  <set>`, `compose-facade-atlas.mjs`, `build-kgx.mjs`; after a model rebuild: `key-model-buildings.mjs` first.
  Slots follow the sorted set names, so a new set can move an earlier set's tiles (cwdock took 16 to 18 and moved
  cwlibrary from 16-19 to 19-22): refer to a tile by its OSM key, never by its slot number.
- **Sets:** `cwlibrary` (4 photos, 2026-10-06 about 16:30 BST, low evening sun) and `cwdock` (20 photos, 2026-10-07 about
  09:00 BST, overcast and light drizzle; owner: "taken NOW near the Dock by the Library ... one of some stickers on the
  library door for white calibration"). Name a set after the place (`cw<place>`), number the photos in the owner's order.
- **Files as delivered:** keep the JPEG bytes; record in `photos.json` what EXIF has. The owner's phone JPEGs so far have
  no time, GPS, make or model, and embed a Display P3 profile while the EXIF ColorSpace tag says sRGB (F51).
- **Map screenshots are evidence, never data:** a phone map screenshot shows the map provider's imagery and labels (not
  the owner's to license) and the owner's profile picture. Never copy it into either repository. Derive the position:
  lay OSM outlines (the water, a few buildings) over it at its own scale bar, north up, and read the blue dot's centre
  (cwdock: 50 m = 216 px; the metric bar ends at the same right end as the feet bar and starts at the lower tick;
  outlines fit to 2 to 3 m; fix +-10 m). Its EXIF time dates the walk. The view cone is the phone compass at that moment,
  not a photo's direction.
- **White calibration** (cwdock photo 19, stickers on the library door): measure clean boxes of the white (sd about 2);
  record mean RGB as stored, sRGB, CIELAB, and the linear gains that make it neutral. The phone sets white balance per
  shot, so do not copy the gains to other photos: balance each photo on its own neutral (overcast sky, white paint) and
  use the calibration photo to check. Measured on cwdock: the sky within 4 CIELAB units of neutral in all 19 other photos,
  the white sign at b* +2.5. Printed safety colours are secondary references only (print colour unknown).
- **Telephoto skylines** (cwdock photo 01, focal 5,570 px, a 3x lens): solve the camera with `solveCamera`
  (`tools/view-mcp/view-lib.mjs`) with x and z free on 3 or 4 sure tower tops (a logo, a unique form), and hold one out.
  Three tops leave the position free along a line (a valley of equal rms); four gave +-60 m and a hold-out at 8 px. A
  tower that no model building explains is new (F52): trace the ray through its top and look for OSM outlines within a
  few metres of it.
- **Face orientation:** take an OSM side's outward normal as the perpendicular that points away from the centroid. A
  sign rule on the ring direction gave inverted normals for some outlines in the cwdock work before it was caught.
- **Bearings between identified buildings** place a judged camera when a photo shows three or more (main lens: focal
  about 1,860 px on the 2,576 px side, an assumption): cwdock photo 11 (Ontario, Regina and Columbia Point), photo 18
  (the brick chimney, OSM way 1175339088, and the station drum). Photo 18 repeats cwlibrary photo 1 and puts that camera
  about 65 m south-south-east of Ontario Point, not south-west: open, the cwlibrary face names and the 24.0 m tile width
  need a camera solve on the roof corners before they are trusted or changed.
- **People and vehicles:** do not describe or tag people. Report to the owner which photos show a recognisable face or
  a readable number plate, for a blur decision before any wider use.

## Pages and tests

- The atlas (`atlas/index.html`) loads `atlas/data/atlas.json` first and the detail files on demand. Hash
  routes: `#view`, `#view/b/cwb-0413`, `#view/pc/E14-5AB`, `#quality/q/SP-6`; `#cwb-NNNN` also works.
  `window.__atlas.open(kind, id)` opens a record. Building and postcode records list their quality issues.
- The 3D page: `docklands-3d-page` (URL switches, `window.__docklands`, the headless recipe).
- Test headless with Playwright from a local `python3 -m http.server` in the repository root (fetch needs http), at
  http://127.0.0.1:<port>/cwplans/atlas/ and the other pages; `npm install` first. The atlas basemap comes from
  tile.openstreetmap.org: an October 2026 session could not reach it from the container, and on 2026-10-04 `curl`
  through the proxy got HTTP 200. Check before you report a missing basemap, and say which it was.
- `node --test cwplans/tools/test/*.test.mjs` (`npm test`): parser fixtures (15 tests on 2026-10-04; 15 pass in londat on
  2026-10-07).
