# Exit paths for the "review" items of the data register

Generated from `cwplans/data-register.json` (`review_exit_paths`, `review_exit`) by `cwplans/tools/check-data-register.mjs --write` on 2026-10-22. Edit the JSON, not this file.

OKR KR6.2 (https://github.com/danbri/londat/blob/main/OKRS.md): every item marked "review" has a written path for the end of the prototyping phase. The cwplans data exception holds only "while in the scoping, planning and prototyping phase" (CLAUDE.md, data policy); the owner says when the phase ends. These paths do not change a licence class or a decision: the owner chooses an option for each group.

Exit paths for the items marked "review" (OKR KR6.2): what the issue is, the owner decisions with their dates and words (CLAUDE.md), and the options at the end of the prototyping phase. Each file, branch or source with a "review" note (or licence_class "review") names one or more of these groups in its "review_exit" (the first is the main reason). A group does not change a licence class or a decision; the owner chooses an option. Readable view: docs/review-exit-paths.md (written by tools/check-data-register.mjs --write). Not an item: the Bosnia and Herzegovina waiver (owner, 2026-10-11, issue https://github.com/danbri/londat/issues/9) covers no committed file today (Sarajevo heights come from OSM and GHSL; FGU and RGURS were not reached).

Items: 70 (58 files, 2 branches, 8 sources); with an exit path: 70. Groups: 14. An item can name more than one group; the first is its main reason.

The check (`npm run check`) fails when a new review item has no exit path, or when an item names an unknown group.

## Summary

| rank | group | reason | items | if the owner decides nothing | options |
|---:|---|---|---:|---|---|
| 1 (owner decides) | [web-crawl](#web-crawl) | crawl (no open licence) | 21 | keep in the repository only; remove from the published site | keep, replace, remove |
| 2 (owner decides) | [cwg-crawl](#cwg-crawl) | crawl (no open licence) | 10 | remove (the permission is for scoping only) | obtain licence, replace, keep, remove |
| 3 (owner decides) | [quotes](#quotes) | share-alike text and quotation | 9 | keep the value and the URL; drop the quote text | keep, replace, remove |
| 4 (owner decides) | [ais-scoping](#ais-scoping) | scoping-only permission | 7 | remove (the permission is for scoping only) | obtain licence, replace, keep, remove |
| 5 (owner decides) | [no-licence-public](#no-licence-public) | licence unknown | 7 | keep facts only and ask the publishers | obtain licence, keep, replace, remove |
| 6 | [osm-odbl](#osm-odbl) | share-alike | 7 | keep under ODbL with the credit | keep, replace, remove |
| 7 | [catastro-ign](#catastro-ign) | licence terms to confirm (transformed-only reuse; licence field empty) | 5 | Catastro: keep (transformed data only); IGN: keep as the separate, removable class the owner accepted on 2026-10-21, and remove it with the switch if IGN or the owner asks | obtain licence, keep, replace, remove |
| 8 | [adsb-odbl](#adsb-odbl) | share-alike | 3 | keep under ODbL with the credit, as for OSM (decided with the OSM review) | keep, replace, remove |
| 9 | [attribution-kept](#attribution-kept) | attribution required | 3 | keep with the attribution | keep, remove |
| 10 | [metar-origin](#metar-origin) | licence unknown (origin) | 3 | keep with the credit | obtain licence, keep, remove |
| 11 | [note-only](#note-only) | note only | 3 | keep | keep |
| 12 | [personal-data](#personal-data) | policy exception (personal data) | 2 | remove (the exception ends with the phase) | keep, remove |
| 13 | [tfl-sheets](#tfl-sheets) | licence unknown (restricted re-use) | 2 | remove from the published site until TfL agrees | obtain licence, replace, remove |
| 14 | [owner-photos](#owner-photos) | owner copyright | 0 | night photos: keep in the repository, owner decides on publication | keep, obtain licence, remove |

The five largest groups (by items) are the decisions that KR6.2 asks of the owner.

## web-crawl

**Other website crawls: site owners' structured data, site facts, feed directories, shop stock tools.** Reason: crawl (no open licence).

Issue: The crawled sites state no open licence. The site owners publish schema.org markup for search engines, but that is not a licence. third_party/ is in the repository only: the Pages workflow does not publish it.

Owner decisions:
- 2026-10-03: "Website crawls - direct and via IA or CommonCrawl etc are fair use for our scoping purposes." (CLAUDE.md, data policy)
- 2026-10-07: "Repo only for now" (CLAUDE.md, data policy (third_party/))
- 2026-10-12: "These tools will be user-assisting browser functionality and not unconstrained web crawling." (CLAUDE.md, data policy (stock-check survey))

| option | what and how |
|---|---|
| keep | Keep third_party/cwplans-structured-data in the repository only (not published), as research input. |
| replace | Read the same facts live in the browser at the user's request (as the stock-check tools do), with nothing committed. |
| remove | git rm -r third_party/cwplans-structured-data and the crawl-derived files; rebuild the dependants with their tools: cwplans/tools/hours-by-place.mjs, cwplans/tools/mall-plan-evidence.mjs, cwplans/tools/extract-structured-data.mjs, cwplans/tools/discover-feeds.mjs (each file names its tool in the register). |

If the owner decides nothing: keep in the repository only; remove from the published site.

Items (21):

- `cache/zone-core.gpkg` (also; main group no-licence-public)
- `registry/sources/stock/stock-check-survey.json`
- `registry/sources/lighting/crown-lighting.json` (also; main group quotes)
- `registry/sources/web/site-facts.json`
- `../third_party/cwplans-structured-data/pages`
- `../third_party/cwplans-structured-data/idioms/idioms.shex`
- `../third_party/cwplans-structured-data/idioms/idioms.json`
- `../third_party/cwplans-structured-data/idioms/rewrites`
- `../third_party/cwplans-structured-data/idioms/page-idioms.json`
- `../third_party/cwplans-structured-data/idioms/summary.json`
- `../third_party/cwplans-structured-data/idioms/canonical.nq.gz`
- `../third_party/cwplans-structured-data/coref/sameas.nq.gz`
- `../third_party/cwplans-structured-data/coref/descriptions.json`
- `../third_party/cwplans-structured-data/coref/entities.json`
- `../third_party/cwplans-structured-data/search/probe.json`
- `registry/sources/web/hours-by-place.json` (also; main group cwg-crawl)
- `reports/schema-org/index.html`
- `reports/hours-and-plans/index.html` (also; main group cwg-crawl)
- `registry/sources/web/structured-facts.json`
- `feeds/discovery/candidates.json`
- `registry/sources/construction/sites.json` (also; main group no-licence-public)

## cwg-crawl

**Canary Wharf Group directory pages (canarywharf.com, read from Internet Archive copies) and the files built from them.** Reason: crawl (no open licence).

Issue: canarywharf.com states no licence (all rights reserved by default). We keep facts (name, category, mall, level, address lines, website, hours) and links. In the UK a substantial extraction from a database can also infringe the database right, even for facts.

Owner decisions:
- 2026-10-03: "Website crawls - direct and via IA or CommonCrawl etc are fair use for our scoping purposes." (CLAUDE.md, data policy)

| option | what and how |
|---|---|
| obtain licence | Ask Canary Wharf Group for permission to reuse the directory facts (it publishes them to promote its tenants). |
| replace | OSM (ODbL) and FSA (OGL) occupants, the brands' own store pages through store finders (owner, 2026-10-03), and the public registers; mall levels from OSM level:ref (fault F48). |
| keep | Keep facts and links only, with the source URL per record, after a legal check of the database right. |
| remove | Delete registry/sources/brands/cwg-directory.json (and cwg-directory-typed.*, cwg-hours.json); then rebuild: node cwplans/registry/sources/brands/tools/build-branches.mjs and node cwplans/tools/build-registry.mjs (build-registry reads the directory only when the file is there). Then rebuild the files that read the registry (rebuild order in cwplans/METHODS.md). |

If the owner decides nothing: remove (the permission is for scoping only).

Items (10):

- `registry/buildings.json`
- `registry/sources/brands/branches.json`
- `registry/sources/brands/cwg-directory.json`
- `registry/sources/brands/cwg-directory-typed.json`
- `registry/sources/brands/cwg-directory-typed.nq`
- `registry/sources/brands/cwg-hours.json`
- `registry/sources/web/hours-by-place.json`
- `registry/sources/brands/mall-plan-evidence.json`
- `reports/schema-org/index.html` (also; main group web-crawl)
- `reports/hours-and-plans/index.html`

## quotes

**Short quotations: Wikipedia text (CC BY-SA 4.0) and sentences from all-rights-reserved pages.** Reason: share-alike text and quotation.

Issue: facts.json holds 169 quotes from Wikipedia (CC BY-SA 4.0, share-alike) and short quotes from all-rights-reserved pages (CWG, TfL, Crossrail, trade press), each with its URL, to cite a number. Quotation for a purpose with the source named is a UK copyright exception, but CC BY-SA text makes the file share-alike.

Owner decisions:
- 2026-10-03: "Website crawls - direct and via IA or CommonCrawl etc are fair use for our scoping purposes." (CLAUDE.md, data policy)

| option | what and how |
|---|---|
| keep | Keep the value and the URL only, without the quote text (the value is a fact). |
| keep | Keep the Wikipedia quotes in a separate file under CC BY-SA 4.0 with the credit, so only that file is share-alike. |
| replace | Take the values from Wikidata (CC0) where they exist. |
| remove | A projection tool that drops the quote fields (keeps value, unit, URL and date) is not written yet; then FACTS.md is generated again from facts.json. |

If the owner decides nothing: keep the value and the URL; drop the quote text.

Items (9):

- `data/sourced-levels.json`
- `docklands/facts.json`
- `docklands/FACTS.md`
- `feeds/underground/stations.json`
- `feeds/underground/planning.json`
- `feeds/underground/estate.json`
- `feeds/underground/tunnels.json`
- `registry/sources/lighting/crown-lighting.json`
- `feeds/underground/axonometric-uses.json`

## ais-scoping

**AIS from AISHub and aisstream.io (via Open Waters), accepted for scoping only.** Reason: scoping-only permission.

Issue: AISHub gives no published licence: Open Waters reports a private letter from AISHub (2026-08-22) that is "revocable at will". aisstream.io publishes no terms. The Open Waters hosted service is free for personal use only; commercial use needs its paid tier or our own receiver. Events with an open licence (CC0 volunteer receptions, NLOD, CC BY) are not part of this item. Note: the licence text of the source openwaters-ais still says that AISHub and aisstream.io events are not kept, but cwplans/tools/fetch-ais.mjs and fetch-live-cache.mjs keep them (class scoping-accepted-2026-10-04) since the owner decision of 2026-10-04; that text is older than the decision (not changed here: the owner confirms).

Owner decisions:
- 2026-10-04: "Accept AISHub (and perhaps aisstream) events for scoping. Sounds fine. Flag it somewhere for review as we scale. Add to live by default now." (CLAUDE.md, data policy)
- 2026-10-21: "Both fine. The events will be taken down upon request, if needed (unlikely)." (CLAUDE.md, data register)

| option | what and how |
|---|---|
| obtain licence | Ask AISHub and aisstream.io for written terms that allow publication; for commercial use, take the Open Waters paid tier. |
| replace | Our own AIS receiver near the river (its receptions are ours; as an AISHub member we also get the AISHub feed under membership terms), or only the open receptions (CC0, NLOD, CC BY) that Open Waters already gives. |
| keep | Not possible after the phase without one of the two above: the permission is for scoping only. |
| remove | Set keep: false for aishub-terms and aisstream-io-terms in the LICENCE table of cwplans/tools/fetch-ais.mjs and of cwplans/tools/fetch-live-cache.mjs; then rebuild: node cwplans/tools/fetch-ais.mjs --no-fetch. The next hourly cache run (cwplans/tools/cache-londat.mjs) and the next 5-minute live-cache push then hold no such events. Past hourly run files and closed monthly SQLite files keep them: a filter tool that drops rows with a "review" field (written by fetch-ais.mjs) is not written yet; history in git needs an owner decision. |

If the owner decides nothing: remove (the permission is for scoping only).

Items (7):

- `cache/live-*.sqlite`
- `cache/runs/*/live-*.json.gz`
- `cache/latest.json`
- `feeds/river/ais.json`
- branch `live-cache` (also; main group adsb-odbl)
- source `aishub-via-openwaters`
- source `aisstream-via-openwaters`

## no-licence-public

**Public-sector publications with no open licence (NATS NOTAMs and AIP, TfL FOI, Planning London Datahub, CelesTrak, CAA CAP 1455).** Reason: licence unknown.

Issue: No open licence is stated. We keep facts only (ids, positions, heights, dates, a few sums), no text, tables or charts.

Owner decisions:
- 2026-10-03: "Website crawls - direct and via IA or CommonCrawl etc are fair use for our scoping purposes." (CLAUDE.md, data policy)

| option | what and how |
|---|---|
| obtain licence | Ask NATS (PIB, AIP), TfL (FOI-0493-2223: is it OGL?), the GLA Planning London Datahub team (OGL?) and CelesTrak for written reuse terms. |
| keep | Keep facts only, as now, with the source and the date (facts are not protected by copyright; check the database right for NOTAMs). |
| replace | Planning: borough planning registers under OGL through planning.data.gov.uk; orbits: Space-Track has a user agreement that limits redistribution, so CelesTrak with credit stays the better choice. |
| remove | NOTAMs and AIP: run node cwplans/tools/fetch-live.mjs without the source names notams and helicopters, and delete feeds/live/notams.json and helicopters.json; construction index: node cwplans/tools/build-construction-index.mjs (PLD is its main source, so the index goes); sky: delete the CelesTrak snapshot; CAP 1455: delete the four sums from feeds/live/README.md. |

If the owner decides nothing: keep facts only and ask the publishers.

Items (7):

- `cache/zone-core.gpkg`
- `data/sourced-levels.json` (also; main group quotes)
- `docklands/data/sky/sats-2026-10-03.json`
- `feeds/live/notams.json`
- `feeds/live/helicopters.json`
- `feeds/live/README.md`
- `registry/sources/construction/sites.json`

## osm-odbl

**OpenStreetMap (ODbL 1.0, share-alike) and ODbL building data (Overture, Microsoft).** Reason: share-alike.

Issue: ODbL is share-alike: a derived database that we publish must be offered under ODbL, with the credit. Only moorings.json carries a review mark, but the review covers every file with osm.use other than "none" (see the OSM table of DATA-REGISTER.md) and the Overture and Microsoft building data of the places.

Owner decisions:
- 2026-10-03: "ODbL is ok for now, and will be thoroughly reviewed as part of the planning and prototyping activities later. Keep track of our use of this data carefully." (CLAUDE.md, data policy)
- 2026-10-20: "Use ms/overture" (CLAUDE.md, data policy)

| option | what and how |
|---|---|
| keep | Keep under ODbL: offer each derived database under ODbL 1.0; the check already fails a page that shows OSM data without the "© OpenStreetMap contributors" link (cwplans/tools/check-data-register.mjs). |
| replace | No open non-share-alike source has the same detail. Partial: OS Open Zoomstack and OS Open Map Local (OGL) for UK buildings and water; national cadastres outside the UK. |
| remove | moorings.json is OSM only: delete it and the mooring layer. Other files: rebuild without OSM is not possible today (OSM gives the buildings). |

If the owner decides nothing: keep under ODbL with the credit.

Items (7):

- `docklands/data/moorings.json`
- `docklands/data/places/leon/tiles/*.glb` (also; main group catastro-ign)
- `docklands/data/places/leon/features.json` (also; main group catastro-ign)
- `docklands/data/places/london/tiles/*.glb`
- `docklands/data/places/london/features.json`
- external `danbri/docklandia:data/gb/uk-lite/`
- external `danbri/docklandia:data/ie/dublin/`

## catastro-ign

**León: Catastro floors (transformed) and IGN España data via Overture with no stated licence.** Reason: licence terms to confirm (transformed-only reuse; licence field empty).

Issue: The Catastro licence allows reuse of data that we have transformed and forbids redistribution of the original files: only computed heights are committed. The IGN España records in Overture (floors and footprints) have an empty licence field; IGN data are generally CC BY 4.0, not confirmed for these records.

Owner decisions:
- 2026-10-11: "Catastro - yes" (CLAUDE.md, data policy)
- 2026-10-20: "Data - is fine for now, bring it in with subdirs and readmes and provenance clear" (CLAUDE.md, data policy)
- 2026-10-20: "use the data but keep it distinct and easy to remove if requested. Use for validation at least" (register sources overture-ign-floors, overture-ign-geometry)
- 2026-10-21: "What we have is ok" (CLAUDE.md, data policy (IGN España outlines and floors in León: a separate, removable class registered as review))

| option | what and how |
|---|---|
| obtain licence | Ask IGN / CNIG (or Overture) to confirm CC BY 4.0 for the ign_es records; then change the licence class to open with the CC BY credit. |
| keep | Catastro: keep the computed heights with the credit "Dirección General del Catastro" (the licence allows transformed data); never commit the original files. |
| replace | IGN floors and footprints: OSM, Microsoft and GHSL heights already follow in the height order; the IGN data then serve only as validation, not committed. |
| remove | Remove the id from the region config docklands/geo/regions/leon.js: 'es-catastro' or 'overture-ign-floors' from place.heights, 'overture-ign-geometry' from place.surround.geometry; then rebuild: node cwplans/tools/build-place-tiles.mjs build --region leon (the README of the place is written again). |

If the owner decides nothing: Catastro: keep (transformed data only); IGN: keep as the separate, removable class the owner accepted on 2026-10-21, and remove it with the switch if IGN or the owner asks.

Items (5):

- `docklands/data/places/leon/tiles/*.glb`
- `docklands/data/places/leon/features.json`
- source `es-catastro-inspire-bu`
- source `overture-ign-floors`
- source `overture-ign-geometry`

## adsb-odbl

**adsb.lol aircraft (ODbL 1.0, share-alike) committed on the branches adsb-cache and live-cache.** Reason: share-alike.

Issue: ODbL is share-alike: a database derived from it that we publish must be offered under ODbL. The adsb.lol API terms ask production users to contact them. Same review as the OSM use.

Owner decisions:
- 2026-10-09: "adsb.lol (ODbL) (Recommended)" (CLAUDE.md, data policy)
- 2026-10-09: "Eventually find or build a proxy. For today build a cache of last 7 days for our areas, and show equivalent data for the matching time and day of week." (CLAUDE.md, data policy)
- 2026-10-09: "Couldn't we crontab it for every 5 mins? And default to live for the rest?" (CLAUDE.md, data policy)

| option | what and how |
|---|---|
| keep | Keep under ODbL: the branch files stay offered under ODbL 1.0 with the credit (already in each branch README); contact adsb.lol before production use. |
| replace | The owner's longer-term plan: a proxy that reads the live API on request, so nothing is committed. |
| remove | Delete the branch adsb-cache (git push origin --delete adsb-cache) and disable .github/workflows/adsb-cache.yml; run cwplans/tools/fetch-live-cache.mjs with --only ships, then with --only metar (no aircraft). The page falls back to simulated traffic (owner decision of 2026-10-09). |

If the owner decides nothing: keep under ODbL with the credit, as for OSM (decided with the OSM review).

Items (3):

- branch `adsb-cache`
- branch `live-cache`
- source `adsb-lol`

## attribution-kept

**Attribution licences already met (CC BY facade photos, Hershey fonts).** Reason: attribution required.

Issue: CC BY 2.0 / 4.0 photos in the facade atlas need the credit (in docklands/data/tex/facades.json, shown in About). The Hershey font data need the acknowledgement (in the file header of docklands/plotter-svg.js). Not share-alike.

Owner decisions: none recorded (no licence question, or the licence is met).

| option | what and how |
|---|---|
| keep | Keep with the attribution, as now; check at the end of the phase that About still shows the facade credits. |
| remove | Facades: rebuild the atlas from the CC0 contributed tiles only (cwplans/tools/compose-facade-atlas.mjs). |

If the owner decides nothing: keep with the attribution.

Items (3):

- `docklands/data/tex/facades-registry.jpg`
- `docklands/data/tex/facades.jpg`
- `docklands/plotter-svg.js`

## metar-origin

**METAR of London City Airport through NOAA AWC and IEM (public domain in the US; Met Office origin).** Reason: licence unknown (origin).

Issue: NOAA and IEM give the reports as public domain, but the reports come from the Met Office through the WMO. METARs are WMO essential data (Resolution 40, free and unrestricted exchange); not confirmed for redistribution.

Owner decisions:
- 2026-10-09: "Basically we want all the data we can" (register source awc-metar)

| option | what and how |
|---|---|
| obtain licence | Confirm with the Met Office that EGLC METARs may be redistributed (WMO Resolution 40). |
| keep | Keep with the NOAA / IEM credit and the Met Office named as origin. |
| remove | Run node cwplans/tools/fetch-live-cache.mjs without metar (--only aircraft, then --only ships); the wind layer falls back to Open-Meteo. |

If the owner decides nothing: keep with the credit.

Items (3):

- branch `live-cache` (also; main group adsb-odbl)
- source `awc-metar`
- source `iem-asos-metar`

## note-only

**Notes that record a rule already applied (no licence question).** Reason: note only.

Issue: towers.json: planning documents are links only, nothing copied. trees.json and tree-species.json: only position, taxon, height, crown, source and record id are kept; inferred profiles are marked as assumptions. The sources are open (OGL, CC BY, ODbL for the OSM part).

Owner decisions: none recorded (no licence question, or the licence is met).

| option | what and how |
|---|---|
| keep | Keep; the owner can clear the mark at the end-of-phase check. The OSM part follows the OSM review (group osm-odbl). |

If the owner decides nothing: keep.

Items (3):

- `docklands/data/towers.json`
- `docklands/data/trees.json`
- `docklands/data/tree-species.json`

## personal-data

**Personal and address data allowed only under the cwplans exception.** Reason: policy exception (personal data).

Issue: Charity contact addresses (for small charities often a trustee's home), business phone and email from OSM, and occupant records are kept because the owner suspended the normal data-ethics rules for this phase. The exception ends with the phase.

Owner decisions:
- 2026-10 (October 2026): "This is a special project and we will be suspending our normal restrictions on personal org and address data while in the scoping, planning and prototyping phase." (CLAUDE.md, data policy)

| option | what and how |
|---|---|
| keep | Keep organisation records at their premises (UPRN or a non-residential building) only. |
| remove | Drop the contact addresses of charities that have no premises, and phone and email of people (not organisations). A switch for the normal rules in cwplans/tools/fetch-registers.mjs and cwplans/tools/build-registry.mjs is not written yet; then rebuild: node cwplans/tools/fetch-registers.mjs (from its snapshot) and node cwplans/tools/build-registry.mjs. |

If the owner decides nothing: remove (the exception ends with the phase).

Items (2):

- `registry/buildings.json` (also; main group cwg-crawl)
- `registry/sources/registers/charities.json`

## tfl-sheets

**TfL axonometric station sheets (FOI release 2015) used as a layout guide for the station models.** Reason: licence unknown (restricted re-use).

Issue: The sheets are under TfL RPSI re-use, not an open licence. The models use them for topology and counts only; positions come from OSM and published levels; nothing is traced. The sheets themselves are in third_party/ (not published).

Owner decisions:
- 2026-10-05: (use approved by the owner for the scoping phase; layout guide only, nothing traced (no exact words recorded)) (CLAUDE.md, data policy; register source tfl-am3d)
- 2026-10-07: "Repo only for now" (CLAUDE.md, data policy (third_party/))

| option | what and how |
|---|---|
| obtain licence | Ask TfL for a re-use licence for the derived station models. |
| replace | Model the stations from OSM indoor data, data/sourced-levels.json and the LiDAR only. |
| remove | Delete docklands/data/stations.json and the station-models index and the station layer; rebuild with new models: node cwplans/tools/build-station-mesh.mjs (from models made without the sheets; skill blender-station-models). |

If the owner decides nothing: remove from the published site until TfL agrees.

Items (2):

- `feeds/underground/station-models.json`
- `docklands/data/stations.json`

## owner-photos

**The owner's own photos used as reference views.** Reason: owner copyright.

Issue: Night photos of 2026-10-03: the owner's copyright, kept with permission, not open. Day photos of 2026-10-04: CC0 1.0 already. Plane photo: the register says "ask the owner", but its README records the owner's CC0 statement of 2026-10-05. The render half of compare-photo-render.jpg carries OSM data (ODbL credit in the README).

Owner decisions:
- 2026-10-04: "I am copyright holder but will CC0 them." (register (day photos))
- 2026-10-05: "Plane photo - yes cc0, record me as owner" (cwplans/docklands/reference/plane-2026-10/README.md)
- 2026-10-21: "the photos I contrib'd were cc0'd" (CLAUDE.md, data register)

| option | what and how |
|---|---|
| keep | Day and plane photos: CC0 is given; the owner can confirm and the review mark can go. |
| obtain licence | Night photos: the owner can give CC0 in one line, as for the day photos. |
| remove | Night photos: delete docklands/reference/night-2026-10-03/ from the published site (keep them in the repository); the ?view= entries keep their numbers. |

If the owner decides nothing: night photos: keep in the repository, owner decides on publication.

Items (0):

