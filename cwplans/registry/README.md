# Canary Wharf building registry

Page: https://danbri.github.io/londat/cwplans/registry/ (a building: `…/registry/#cwb-0413`)

Internal ids for the buildings of Canary Wharf, cross-referenced to OSM, Wikidata, postcodes and open registers, with their occupants and owners. Occupants and owners are organisations only. The registry never records private individuals: no residents, no company officers, no individual owners.

Data policy: in October 2026 the owner suspended the normal restrictions on personal, organisation and address data for this project during the scoping, planning and prototyping phase (see the exception in the repo's `CLAUDE.md`). The files below were built before that and still apply the limits described here. The licence limit still applies: no proprietary or restricted-licence data is committed. The OSM data (ODbL, share-alike) used here is an open question for the owner.

## Files

| file | what it is |
|---|---|
| `buildings.json` | `{summary, buildings: [...], unplaced_by_postcode: {...}}` |
| `ids.json` | the id register: OSM element → `cwb-NNNN`, and the next number to issue |
| `index.html` | list, search, map and per-building detail |
| `../tools/registry-osm.mjs` | OSM features with full tags in the box, from the Greater London extract |
| `../tools/registry-wikidata.mjs` | Wikidata through QLever (`https://qlever.dev/api/wikidata`) with `geof:distance` |
| `../tools/registry-fhrs.mjs` | FSA Tower Hamlets file (FHRS530), saved as a dated E14 snapshot; with two snapshots it writes `fhrs-changes.json` (new ids = registrations, usually openings; missing ids = closures) |
| `../tools/build-registry.mjs` | joins everything into `buildings.json` |

Rebuild:

    node --max-old-space-size=6000 cwplans/tools/registry-osm.mjs
    node cwplans/tools/registry-wikidata.mjs
    node cwplans/tools/registry-fhrs.mjs
    node cwplans/tools/build-registry.mjs

## Ids

- A building is an OSM building outline (`building=*`, way or multipolygon) whose centroid is in the Canary Wharf box (WGS84 −0.0300, 51.4980 to −0.0050, 51.5100; the box of the 3D model and the postcode list). OSM `building:part` shapes are listed under the outline that contains them.
- Ids have the form `cwb-0001`. The first run issued them in reading order: north to south in 100 m bands, then west to east. `ids.json` keeps them by OSM element, and a rebuild reuses them. The second and third rebuilds issued none (`minted_this_run: 0`). A new building gets the next free number, and a retired id is never used again.
- Limit: an id follows its OSM element. If a mapper deletes and redraws a building, it gets a new id. Matching by geometry overlap would keep the old id; that is not implemented yet.

## How things are joined

- **Building name**: the Wikidata label where the building has a Wikidata item, else the OSM name. OSM often names a tower after its main occupant ("HSBC UK" for 8 Canada Square, "Barclays" for One Churchill Place). The OSM name is kept as `osm_name`.
- **Wikidata item**: the OSM `wikidata` tag. Otherwise the one building-type Wikidata item (building, skyscraper, tower, station, hotel, shopping centre and similar) whose coordinate is inside the outline. An item that an OSM outline already names in its `wikidata` tag is not attached to a second outline: One Canada Square's coordinate falls in the Cabot Place mall outline below the tower, and until 2026-10-03 both outlines carried its record.
- **Occupants**, each with a role and a source:
  - OSM shops, offices, amenities, leisure, healthcare and transport features that have a name: placed in the outline that contains them, or in the nearest outline within 12 m (entrances on the wall). Level from OSM `level`, brand from `brand` and `brand:wikidata`. Public artworks and information boards are listed as features, not occupants.
  - FSA food premises (Tower Hamlets open-data file) with a position: placed the same way, with rating and rating date. Premises with no position, often new registrations, are listed by postcode under "Occupants listed by postcode only" (88). Home-based businesses, whose address the FSA withholds, are not kept.
  - Wikidata: organisations whose headquarters (P159) is the building ("headquarters"); the building's occupants (P466); and other non-building items whose coordinate is inside it.
- **Owners**: Wikidata "owned by" (P127), organisations only (10 buildings). Values that are people are dropped in the query.
- **Postcodes**: OSM `addr:postcode` on the building and its occupants, FSA postcodes of the premises placed in it, and Wikidata postal code. Each is checked against the postcode list (`../postcodes/`) for status and tier.
- **Look-up links per postcode**: Companies House advanced search by registered-office postcode (company-level results) and the HM Land Registry price-paid search. These are links to the official services. Their results are not copied here.

## Counts (2026-10-03, after the Wikidata join fix)

1,129 buildings: 315 named, 89 with Wikidata, 252 with occupants (1,161 occupant records), 10 with an owner. Of the OSM occupants, 650 were placed in a building and 121 were not inside or near any outline. 444 FSA premises were placed by position.

## Company and property joins (added 2026-10-03)

Sources and access are described in `sources/SOURCES-companies-property.md`. Rule for everything below: company-level and property-level data only. Figures about homes are shown only where at least 5 homes are counted, so no figure describes a single home.

| join | how | result |
|---|---|---|
| OS Open UPRN + Open Linked Identifiers (OGL) | UPRN points inside the building outline; their TOIDs and USRNs | 27,502 UPRNs placed; TOIDs and streets per building |
| GLA London Building Stock Model 2 (OGL) | homes on the building's TOIDs: count, property type, construction age band, EPC band totals | 600 buildings; "fewer than 5" where small |
| HM Land Registry INSPIRE Index Polygons | freehold index polygon(s) at the building's centre; INSPIRE id, which is not a title number | 1,306 links |
| Companies House Basic Company Data | registered office postcode in the building's postcodes, and the address contains the building's name or number and street | 6,355 of the 16,619 companies at Canary Wharf postcodes |
| HM Land Registry Price Paid (OGL) | sales whose number and street match the building: homes sold, sales, first and last date, median price, new builds | 275 buildings |

- In a residential building (with homes, or tagged as apartments or houses), only the number of registered companies is shown: a registered office there is often someone's flat. One building has 486 companies registered at one flat.
- A registered office is not proof that a company works in the building. Formation agents, accountants and insolvency firms hold many.
- `companies-by-postcode.json` lists the companies per postcode: number, name, status, category, incorporation date and SIC codes. It has no address lines; the Companies House page for each number has the public record.
- `homes-by-postcode.json` gives price-paid totals per postcode, only where at least 5 homes have sold.

**Not published:**
- The per-sale price-paid records with flat numbers, and the agent's per-postcode summaries that do not apply the minimum of 5. They stay in `sources/` and are not committed.
- The Companies House rows with address lines: not committed.
- The VOA non-domestic rating list (business rates, 4,546 rated properties at Canary Wharf postcodes, rateable value £457.1m). It is under a restricted VOA licence, not OGL, so even the postcode totals are not committed until the owner decides.

**Needs an account:** HM Land Registry CCOD and OCOD (UK and overseas companies that own property): a free account, licence agreement and API key. Without them, the API returns 403. EPC data: GOV.UK One Login.

## Chain-store branches (added 2026-10-03)

`sources/brands/` (method and the full branch table in its README): the UK brands of the OSM name-suggestion-index (BSD-3-Clause), found at Canary Wharf in OSM, the FSA data and the Canary Wharf Group directory. canarywharf.com blocks scripts, so the CWG directory comes from Internet Archive copies (sitemap of March 2026, entry pages mostly from November 2025) and can be months out of date. 271 branches of 211 brands. In the registry, 211 existing occupants gained their brand, mall, CWG page and store page; 35 branches were added as occupants (marked "approximate" when the position is only a mall or postcode centre); 25 could not be placed in a building.

## Wet areas and museum records (added 2026-10-03)

- `sources/pla/`: UKHO INSPIRE bathymetry of the Thames (PLA multibeam survey 2013–2017; 25 m grid west of −0.0133°, 50 m east of it; heights above Admiralty Chart Datum; the PLA Tide Booklet 2025 gives chart datum as 3.20 m below ODN at London Bridge and 3.35 m at North Woolwich), the HMS Belfast berth survey, and UKHO wrecks and obstructions. Open Government Licence; not for navigation. The PLA's own layers (navigation channels, mean high water mark, wharves and piers, foreshore zones, tidal flow model) carry no licence statement and the Canal & River Trust layers forbid commercial use: both are kept locally, not published.
- `sources/museums/`: 6,629 open records with positions (Wikidata CC0, Historic England OGL, OGL and CC-BY records from the ADS/ARIADNE catalogue), and the Greater London Archaeological Priority Areas (OGL). Most Wikidata records are objects kept in a museum in the box (the coordinate is where the object is kept, not where it was found). Records flagged as burials or memorials are not published.

Canary Wharf Group's own pages (canarywharf.com) could not be read: the site returns a bot-challenge page to scripts.
