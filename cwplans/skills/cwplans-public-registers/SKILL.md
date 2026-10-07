---
name: cwplans-public-registers
description: >-
  The regulatory and public registers in cwplans (Canary Wharf, Isle of Dogs, E14): DfE GIAS schools, CQC
  care directory, NHS ODS, Charity Commission, Ofsted childcare, Gambling Commission premises, Sport England Active
  Places and FSA pubs and bars. Covers their licences, the fetch tool (tools/fetch-registers.mjs), the fields dropped
  even under the cwplans exception, how build-registry.mjs joins them to buildings (UPRN first, then the register's
  point, mall, street address, name at the postcode, and the postcode alone only with checks) with a key, precision and
  confidence on every link, and the traps catalogued as faults F17 to F20: one UPRN on many records, correspondence
  and registered-office addresses (E14 5HU), care-of addresses, charity contact addresses in homes, postcodes that do
  not mean one building, and provider/site pairs. Also what was rejected and why (Tower Hamlets licensing register
  unreachable, Bank of England PRA terms, FCA and NHS keys). Reach for it before you add or refresh a register, change
  the register join, or explain why a school, clinic or charity sits in the wrong building or in none.
---

# Public registers for cwplans

Policy, the fault register (F-numbers) and the activity log are in the hub skill `docklands-data-curation`
(`cwplans/skills/docklands-data-curation/`). Append what you did to its `ACTIVITY-LOG.md`.
Source README: https://github.com/danbri/londat/blob/main/cwplans/registry/sources/registers/README.md.
Checked against `tools/fetch-registers.mjs`, `tools/build-registry.mjs`, the committed files and `quality/issues.json`
on 2026-10-04.

## Fetch

    NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-registers.mjs              # all
    NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-registers.mjs ods cqc      # some; --refresh re-downloads

Sources: `gias cqc ods charities ofsted-childcare gambling active-places fsa-pubs`. One request at a time per host, at
least 1 s apart, up to 6 tries with Retry-After or doubling pauses on 429 and 5xx. A raw file already in
`data/raw/registers/` (gitignored) is reused unless `--refresh`. Out: `registry/sources/registers/<source>.json`,
`{meta, records}`; `meta` has the URL, fetch date, licence and where it was read, method, counts and `fields_dropped`.

Kept: postcode in E14, or a source coordinate in the registry box (WGS84 -0.030, 51.498 to -0.005, 51.510). Each record
has `in_box`, `in_e14`, `lat`/`lon` and `position`: `source` (the register gives a point) or `postcode centre (ONSPD)`.
Closed and inactive records are kept with their dates, so a building's history can be told.

## Sources (fetched 2026-10-03)

| file | licence | kept (E14) / in the box | position | own ids |
|---|---|---|---|---|
| `gias.json` | OGL v3.0 | 63 / 23 (16 of the 23 are correspondence addresses) | source (Easting/Northing via OSTN15) | URN, UKPRN, UPRN |
| `cqc.json` (directory CSV) | OGL v3.0 | 84 / 47 | postcode centre | location id, provider id |
| `ods.json` (ORD API, 422 detail requests) | OGL v3.0 | 422 / 258 (82 at E14 5HU) | postcode centre | ODS code, UPRN |
| `charities.json` | OGL v3.0 | 316 / 131 | postcode centre | charity number, company number |
| `ofsted-childcare.json` | OGL v3.0 | 45 / 16 | postcode centre | Ofsted URN |
| `gambling.json` | OGL per the Commission's data.gov.uk record only | 14 / 8 (all betting shops) | postcode centre | operator account |
| `active-places.json` | CC BY 4.0, "Contains Data © Sport England" | 37 / 13 (103 facilities) | source | site id, UPRN, TOID |
| `fsa-pubs.json` (from the FHRS snapshot) | OGL v3.0 | 37 / 17 | FSA geocode (often a postcode centre, F7) | FHRS id |

Licence notes: the Gambling Commission download page states no licence; re-check with the Commission before anything
leaves prototyping. The NHS ODS page was behind a Cloudflare challenge, so OGL comes from the `nhs-ods-ord` entry in
`feeds/feeds.json`. CC BY 4.0 is attribution only (not share-alike) and its licence excludes personal data.

## Fields dropped (even under the cwplans exception)

Telephone numbers and email addresses everywhere; GIAS head teacher names; Active Places contact person, job title and
social links; Ofsted "registered person" names unless they look like an organisation (4 E14 names dropped); ODS
relationships and contacts; charity activities text. Ofsted childminders and home childcarers are excluded: Ofsted
redacts them (31,959 of 60,007 rows) and they are people at home addresses.

## Rejected or not reached

| source | result | why |
|---|---|---|
| Tower Hamlets premises licence register (alcohol, late-night refreshment, entertainment, films) | not collected | `alcohol-entertainment.towerhamlets.gov.uk` failed the TLS handshake through the proxy and answered 503 to another client (2026-10-03); the Internet Archive holds only the start page; the search is an ASP.NET postback; the Common Crawl index server reset the connection. `fsa-pubs.json` stands in. Retry, or ask the council for an extract. |
| PRA lists (Bank of England) | rejected | Website terms allow only personal or internal non-commercial use; the database OGL clause does not cover these CSVs; no addresses either. |
| FCA Financial Services Register | rejected for now | The API needs a registered key; the terms were not read. |
| NHS service search API, CQC API | not used | Keys and syndication terms; the CQC OGL directory CSV covers the same locations. |
| Office for Students register | not collected | OGL, but the register refused this client. |
| CQC "HSCA Active Locations" | not used yet | Has coordinates, but also registered manager names; a later run could read only the location columns. |

## The join (`tools/build-registry.mjs`, registers block)

Every placed record becomes a link on an occupant, `occupant.registers[]` = { register, id, kind, status, key,
precision, confidence }, and the source ids go on the occupant. Keys, in order:

1. **FSA pubs** whose FHRS id is already an occupant join that occupant (high).
2. **UPRN** → OS Open UPRN point (`registry/sources/uprn/uprn-canary-wharf.csv`) → the outline it lies in (high).
   Rejected as a key (F17) when one register gives the UPRN to records at two or more postcodes, or when the UPRN point
   is over 150 m from the register's own point.
3. **The register's own point** in an outline (inside: medium; near: low). An FSA point within 3 m of its postcode
   centre is a postcode, not a point (F7), and does not place.
4. **A named mall** in the address puts the unit in the mall's host outline, whatever outline the point lies in (F4).
5. **Street address + postcode** (high); then **street address** alone when exactly one building's numbered address key
   is in the text.
6. **Name + postcode**: an occupant of one building has the same name key and postcode (or mall) (medium).
7. **The postcode alone** (low), never for a charity, and only when the one registry building with that postcode lies
   at the ONSPD postcode centre (within 50 m or containing it) and the address names no other street (F19).

Excluded before the join and counted (F18), as `regOut.unplaced` with the reason:
- GIAS correspondence addresses (`address_role`): 16 "Fieldwork Overseas Establishments" at 30 Skylines Village,
  E14 9TS, which are British schools abroad;
- the registered-office service on the 10th floor of 5 Churchill Place, E14 5HU (82 ODS records in the box; also any
  address matching the `HUB` pattern);
- care-of and accountant addresses (`CARE_OF`);
- a charity placed by anything but a UPRN, with no same-name occupant, in a residential building: a contact address,
  often a trustee's home.

ODS organisation records (providers, headquarters, agencies; `ODS_ORG`) are kept as head-office occupants and never get
a service category.

## The traps, with their audit checks (counts on 2026-10-04)

| fault | trap | check |
|---|---|---|
| F17 | GIAS gives 8 schools at 8 postcodes the UPRN of a council office (inside the Poplar Public Mortuary outline); a first join put 9 schools in that building. One more UPRN point is 300 m from the school's own point | ID-5: 9 |
| F18 | Addresses that are not where the organisation works: correspondence, registered-office service, care-of, charity contact addresses in homes | SE-3: 135 |
| F19 | "The one registry building with the postcode" is not "the postcode covers one building": registry postcodes come from occupants, so a pub carrying E14 0EY took the Newby Place health centre (8 ODS records), and a virtual-office address (71-75 Shelton Street) carried E14 5RE | CV-4: 92 in the box with no building |
| F20 | One organisation as two records in one building (ODS provider and site, "360 CAMHS" and "360 CAMHS LONDON"; OSM "Sk:n" and CQC "Sk:n - London Canary Wharf") | ID-2: 89 (open) |
| | Low-confidence key placements | SP-7: 30 of 325 |

Postcode-only positions cannot choose a building where the postcode covers several: in the box 96 of 258 ODS, 29 of
47 CQC, 54 of 131 charities and 10 of 16 nurseries (README). Per register on 2026-10-04 (`summary.joins.registers` in
`registry/buildings.json`): GIAS placed 7 (UPRN 4, point 3), 8 UPRNs rejected as shared, 1 over 150 m; ODS placed by
street address + postcode 61, UPRN 53, street address 18, postcode alone 14; 82 at E14 5HU and 4 care-of excluded.

The rule behind all of these: **a register address has a role**. Keep the key, its precision and a confidence on every
link, so the atlas can show how sure a placement is; never place by postcode alone without the checks.

## Adding a register

1. Read the licence on the publisher's own page and record where (`meta.licence`, README); no restricted-licence or
   share-alike data (repo `CLAUDE.md`, the cwplans exception).
2. Add a source function to `SOURCES` in `fetch-registers.mjs`; drop phones, emails and personal names; keep closed
   records with dates; record `fields_dropped` and counts.
3. Add a row to `REGS` in `build-registry.mjs` (ids, "current" test, exclusion rule); name the address roles it has.
4. Register the file in `data-register.json` and the tool change in `pipeline.json` in the same commit; run
   `node cwplans/tools/check-data-register.mjs --write`.
5. Rebuild (hub skill, "Rebuild order"), run the audit, and write the counts before and after in the activity log. A new
   trap is a new check and an F-number, not a hand fix.

## Open (2026-10-04)

A postcode-to-building table from OS Open UPRN (records waiting on "postcode covers several buildings"); merge ODS
provider and site pairs (F20); CQC location coordinates; the Tower Hamlets licensing register.
