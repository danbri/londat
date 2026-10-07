## Policy and owner rules that govern the methods

This section is hand-written (`methods-intro.md`). `tools/check-data-register.mjs --write` puts it at the top of
`METHODS.md`; everything after it is generated from `pipeline.json`.

Owner instruction, 2026-10-03: "record ALL our data methods in skills or other concrete committed artifacts". So every
method of this project is in one of three places: a tool's activity in `pipeline.json` (method, rules, inputs,
outputs, network, order), a hand step in `pipeline.json` `manual_activities` (what a person or an agent decided, and
where the decision is written), or this section (the rules that govern all of them).

### The rules, with their source and date

| rule | source and date | what it means for a method |
|---|---|---|
| Personal, organisation and address data allowed here, for this phase only | Repo `CLAUDE.md`, Data ethics, "EXCEPTION — magpie/cwplans/" (owner, October 2026: "This is a special project and we will be suspending our normal restrictions on personal org and address data while in the scoping, planning and prototyping phase.") | Company addresses, occupant and owner records, postcode-level business and home data may be fetched, joined and committed in `magpie/cwplans/` only. The exception ends when the owner says the project leaves prototyping. |
| No proprietary, restricted-licence or virally licensed data | `CLAUDE.md`, same exception | Read the licence of each source before a file is committed. The VOA rating list is named as restricted: `registry-voa.mjs` output stays local. |
| OpenStreetMap (ODbL) allowed for now, and tracked | `CLAUDE.md` (owner, 2026-10-03: "ODbL is ok for now, and will be thoroughly reviewed as part of the planning and prototyping activities later. Keep track of our use of this data carefully.") | Every committed file says how it uses OSM (`data-register.json` `osm.use`) and from which extract; every page that shows OSM data carries "© OpenStreetMap contributors" linked to https://www.openstreetmap.org/copyright. No other share-alike source without the owner's agreement. |
| Website crawls are fair use for scoping | `CLAUDE.md` (owner, 2026-10-03: "Website crawls - direct and via IA or CommonCrawl etc are fair use for our scoping purposes.") | Pages fetched directly, from the Internet Archive or from Common Crawl, and data taken from them, are allowed. Record each crawl in the data register with its method and date. Re-check before anything leaves prototyping. |
| Store-finder searches with a UK postcode | Curation skill (owner, 2026-10-03: "we are permitted per industry convention to submit storefinder forms with UK postcodes") | A crawl may type a UK postcode into a brand's store-finder search and follow the result to the branch page. Nothing else: no other forms, no names, emails, accounts or bookings, no login. robots.txt and the per-host gap still apply. Record how each page was reached (search, postcode, finder URL). |
| Every committed data file is registered | `CLAUDE.md`, same exception | Add the `data-register.json` entry in the same commit as the file, then run `node magpie/cwplans/tools/check-data-register.mjs --write`. |
| Every tool has its method written down | Owner, 2026-10-03 (above); curation skill, "Methods" | A new or changed tool updates its `pipeline.json` activity in the same commit. The check fails on an unlisted tool and on an empty method or rules. |
| Keep sources ready for a knowledge graph | Curation skill (owner, 2026-10-03: "In future we will create a corpus that brings select sources through a data integration pipeline into a Knowledge Graph environment. Bear that in mind as we record sources and transforms.") | Keep source identifiers as they come (OSM type/id, Wikidata QID, UPRN, TOID, FHRS id, company number, cwb- id); keep dates and qualifiers with values; `pipeline.jsonld` exports the activities as W3C PROV-O. |
| Catalogue error classes first | Curation skill (owner, October 2026) | A wrong value gets an error class and a check in `tools/audit-quality.mjs`; the record is not patched by hand. A tool changes only for a fault in our own pipeline or join rule, and the audit counts before and after go in the activity log. |
| Pace our own requests | Curation skill (owner, 2026-10-03: "maybe the rate limiting should come from us? Or a more carefully posed efficient query? QLever is very good") | One well-posed query (VALUES over the ids) in place of many small ones; `tools/lib.mjs` `qlever()` runs one query at a time, at least 1.5 s apart, with backoff on 429 and 5xx. Every crawler identifies itself (User-Agent `glitchcan-cwplans/0.1 (https://github.com/danbri/glitchcan-minigam)`) and keeps a per-host gap. |
| Memorial and burial content is not material | `CLAUDE.md`, Data ethics (Bristol trees rule; June 2026 incident) | The trees payload keeps only position, taxon, height, crown, source and record id. Wikidata memorials, graves, cemeteries, tombs and plaques are dropped; people (Q5) are not owners or occupants. Museum records flagged "sensitive" are left out of the published subset. EA flood-defence owner and maintainer fields are dropped. |
| Lessons go in skills, not in code comments | `CLAUDE.md` (owner, August 2026: "Don't store your lessons in code, use agentskills with frontmatter.") | A tool header says what the tool does and how to run it; the reasons and the measured lessons are in the curation skill; the method is in `pipeline.json`. |
| Ship at once | Curation skill (owner, 2026-10-03) | Commit and push each working change as soon as its check passes; regenerate this file in the same commit. |

### Crawl and store-finder method (all crawlers)

- Identify: User-Agent `glitchcan-cwplans/0.1 (https://github.com/danbri/glitchcan-minigam)`; the headless render adds
  that token to a desktop Chrome string.
- robots.txt per RFC 9309: the group for `glitchcan-cwplans`, else `*`; longest match wins, Allow wins a tie; a 4xx
  robots.txt allows all; a 5xx or unreachable robots.txt disallows all; checked again on every redirect to a new host.
- One request at a time per host with a gap (1.5 s for the plain crawl, 2 s for the headless render, about 1 s for the
  store-page check), a few hosts at once, a timeout, and backoff on 429, 5xx, timeouts and resets (Retry-After first).
- Skipped by rule: FSA ratings pages, OSM, Wikidata, Companies House and Land Registry pages (their data comes from
  APIs and bulk files), Wikipedia (CC BY-SA, share-alike), social networks, and the live canarywharf.com (it answers
  scripts with an Imperva challenge; its pages are read as Internet Archive `id_` copies).
- Kept: structured data (schema.org JSON-LD, microdata, RDFa), titles, OpenGraph fields cut to 200 characters,
  links, feeds. No other page text. Rendered pages stay local (gitignored).
- A page counts for a branch only when it names the place (postcode, street, mall); a result that does not is reported
  as such, not dropped silently.

### Hand curation (general rules)

- A hand decision is written to a file the tools read (`fsa-decisions.json`, `cwg-decisions.json`,
  `storelocator-manual.json`, `data/sourced-levels.json`, `registry/sources/facades/work/rois.json`, the `JUDGEMENT`
  table in `tools/build-towers.py`), with its reason. The tools apply it on every run; nobody edits an output by hand.
- Research catalogues (`feeds/`, `feeds/underground/`, `docklands/facts.json`) keep the URL, the fetch date, the
  licence as read, and a short quote where a value is taken. Copyright plans are looked at, not copied.
- Where a method was run as a one-off script that is not committed, its hand step in `pipeline.json` says so
  (`gap`). Commit the script next time the step is run.

### Licence decisions

The licence of each source is in `data-register.json` `sources` (readable in `DATA-REGISTER.md`), with the reason
for each decision in the source's README. The open decisions and refusals are in the hand step `licence-decisions`
below (area "Provenance export").
