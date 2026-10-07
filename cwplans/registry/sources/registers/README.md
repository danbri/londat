# Registers: regulatory and public registers for Canary Wharf and E14

Built 2026-10-03 by `tools/fetch-registers.mjs`. One file per source, each `{meta, records}`. `meta` holds the
source URL, fetch date, licence (and where the licence was read), method, counts and the fields dropped.
Raw downloads are in `cwplans/data/raw/registers/` (gitignored).

    NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-registers.mjs            # all sources
    NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-registers.mjs ods cqc    # some; --refresh re-downloads

Area: the registry box WGS84 [-0.030, 51.498, -0.005, 51.510] (Canary Wharf estate and the north Isle of Dogs)
and the postcode district E14. A record is kept when its postcode is in E14 or its source coordinate is in the
box. Each record has `in_box`, `in_e14`, `lat`/`lon` and `position`: `source` (the register gives a point) or
`postcode centre (ONSPD)` (it gives only a postcode; `in_box` then means the postcode centre is in the box).

Record fields (all files): `id`, `name`, `kind`, `address`, `postcode`, `lat`, `lon`, `position`, `status`,
dates, `url` of the record, and the source's own ids (URN, ODS code, charity number, UPRN, TOID).

## Sources

| file | source | licence | in the box | E14 | position | join keys |
|---|---|---|---|---|---|---|
| `gias.json` | DfE Get Information About Schools, daily all-establishments CSV | OGL v3.0 | 23 (16 of them correspondence addresses, see below; 7 real) | 63 (44 open, 19 closed) | source (Easting/Northing via OSTN15) | URN, UKPRN, UPRN (43), postcode |
| `cqc.json` | CQC care directory CSV (30 Sep 2026) | OGL v3.0 | 47 | 84 | postcode centre | CQC location id, provider id, postcode |
| `ods.json` | NHS ODS ORD API (organisations with an E14 postcode; 422 detail requests) | OGL v3.0 | 258 (82 at E14 5HU, see below) | 422 (355 active, 67 inactive) | postcode centre | ODS code, UPRN (147), postcode |
| `charities.json` | Charity Commission register extract | OGL v3.0 | 131 | 316 (registered only) | postcode centre | charity number, company number, postcode |
| `ofsted-childcare.json` | Ofsted childcare providers MI, 30 June 2026 | OGL v3.0 | 16 | 45 | postcode centre | Ofsted URN, postcode |
| `gambling.json` | Gambling Commission register of gambling premises | OGL (data.gov.uk record; see below) | 8 | 14 (all betting shops) | postcode centre | operator account, postcode |
| `active-places.json` | Sport England Active Places (sites + facilities) | CC BY 4.0, "Contains Data © Sport England" | 13 | 37 (30 open, 7 closed; 103 facilities) | source | site id, UPRN (32), TOID, postcode |
| `fsa-pubs.json` | FSA hygiene ratings, type Pub/bar/nightclub (from the FHRS530 snapshot) | OGL v3.0 | 17 | 37 | source (FSA geocode; often a postcode centre, fault F7) | FHRS id, postcode |

Licence notes:
- **Gambling Commission:** the download page states no licence. The Commission's own data.gov.uk record
  "Licensed gambling premises" (8dc9bef0-ad46-497b-9a74-30a6ce9d2f98) says UK OGL. Re-check with the
  Commission before anything leaves prototyping.
- **NHS ODS:** OGL v3 per the catalogue entry `nhs-ods-ord` in `feeds/feeds.json`; the digital.nhs.uk page is
  behind a Cloudflare challenge for this container, so it was not re-read today.
- **Active Places:** CC BY 4.0 is attribution only (not share-alike). The licence excludes personal data: site
  contact names, job titles, emails and phones are dropped.

## Fields dropped

Telephone numbers and email addresses everywhere. GIAS head teacher names. Active Places contact person
(title, first name, surname, job title) and social links. Ofsted "registered person" names unless they look
like an organisation (Ltd, trust, school ...): 4 E14 names dropped. CQC registered managers are not in the CSV
used. ODS relationships and contacts. Charity activities text. Full lists per file in `meta.fields_dropped`.

## What the data says (catalogue, not corrections)

- **Correspondence addresses (class "meaning", like SE-1 registered offices).** 16 GIAS establishments use
  30 Skylines Village, E14 9TS ("Fieldwork Overseas Establishments": British schools abroad administered by Fieldwork Education). They
  are not schools on the Isle of Dogs. `address_role` marks them. Charity contact addresses are the same kind
  of value: for small charities they are often a trustee's home or an accountant, not where the charity works.
- **Registered-office hub in ODS.** 82 of the 258 ODS records in the box are at E14 5HU (5 Churchill Place,
  10th floor, a company-secretarial service): care-home operating companies ("Social Care Provider") and others
  whose services are elsewhere. Same class as SE-1. ODS in the box by role (active): GP practices 2 (Roserton
  Street Surgery, The Barkantine Practice; 8 in E14), pharmacies 5 (13), dental practices 11 (22), optical
  sites 4 (9), NHS trust sites 6 (9).
- **Postcode-only positions.** CQC, ODS, charities, Ofsted and gambling records give only a postcode. In the
  box, 96 of 258 ODS records, 29 of 47 CQC records, 54 of 131 charities and 10 of 16 nurseries have a postcode that covers more than
  one registry building, so a postcode join alone cannot choose the building.
- **Ofsted redaction.** 31,959 of 60,007 rows in the national file are childminders or home childcarers with
  name, address and postcode "REDACTED". Only childcare on non-domestic premises can be placed.
- **Closed and inactive records are kept** with their dates (GIAS 19 closed, Active Places 7 closed, ODS
  inactive roles), so a building's history can be told.

## Gaps and rejected sources

| source | result | why |
|---|---|---|
| Tower Hamlets premises licence register (alcohol, late-night refreshment, regulated entertainment, films) | **not collected** | `alcohol-entertainment.towerhamlets.gov.uk` (Civica eLR) failed the TLS handshake through the proxy and answered HTTP 503 to a second client on 2026-10-03. The Internet Archive holds only the start page (2026-01-13), and the search is an ASP.NET postback. The Common Crawl index server reset the connection. Retry later, or ask the council for an extract. `fsa-pubs.json` is the stand-in for alcohol premises. |
| Cinemas and music venues | no register | No regulator lists them. The council premises licence register (films, live and recorded music) is the only official list, and it was not reached. Use OSM (another agent) meanwhile. |
| Office for Students register | not collected | Licence is OGL (officeforstudents.org.uk/copyright), but `register.officeforstudents.org.uk` answered "You do not have permission to view this directory or page" to this client. GIAS already holds the E14 further-education college. |
| FCA Financial Services Register | rejected for now | The API needs a registered key; the register terms were not read. Facts only, no data. |
| PRA lists of banks, building societies and insurers (Bank of England) | rejected | Bank of England website terms: download for personal or internal non-commercial use only; the database OGL clause does not cover these CSVs. The lists have no addresses either. |
| NHS service search API | rejected for now | Needs a key from the NHS developer portal; content syndication terms. |
| CQC API | not used | Needs a subscription key. The OGL directory CSV covers the same locations. |
| CQC "HSCA Active Locations" ODS | not used yet | Has coordinates and registration dates but also registered manager names; ODS spreadsheet. A later run could read only the location columns. |
| Ofsted childminders | excluded | Redacted by Ofsted, and they are people at home addresses. |

## Joining to building occupants

Keys, in order of strength:

1. **UPRN** (GIAS 43 records, Active Places 32, ODS 147). A UPRN gives a point through
   OS Open UPRN (`registry/sources/uprn/uprn-canary-wharf.csv`); point-in-outline then gives the `cwb-`
   building. 14 GIAS, 12 Active Places and 58 ODS UPRNs are in that list today. Mall and below-ground units need the
   mall and level rule (fault F4), not the 2D test.
2. **TOID** (Active Places): OS Open Linked Identifiers (`uprn-linked-ids-canary-wharf.csv`) maps TOID to UPRN.
3. **Source coordinates** (Active Places, GIAS, FSA): point-in-outline, with the F4 and F7 cautions.
4. **Postcode**: places a record in a postcode, not a building. Unique only where the postcode covers one
   registry building.
5. **Address text and name**: match the building name or number and street against registry addresses and the
   CWG directory; company numbers in `charities.json` join to Companies House records.

Each join should keep the source id, the key used and its precision, so the atlas can show how sure a
placement is.
