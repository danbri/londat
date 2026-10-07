# Canary Wharf postcodes: actual and possible

Page: https://danbri.github.io/glitchcan-minigam/magpie/cwplans/postcodes/

A complete list of the postcodes that could belong to Canary Wharf, with each one marked as actual (in the ONS Postcode Directory, live or terminated) or possible (a valid code that has never been allocated). The actual ones are classified against two definitions of Canary Wharf and used as search keys against open sources.

## Files

| file | what it is |
|---|---|
| `postcodes.json` | all 4,000 candidate codes in E14 with status, tier, dates, ward, position, OSM streets |
| `postcodes.csv` | the 2,981 actual postcodes (live and terminated) as a table |
| `queries.json` | what each live Canary Wharf postcode found in GOV.UK, Wikipedia, the FSA food ratings and Wikidata |
| `canary-wharf-ward.geojson` | the ONS boundary of the Canary Wharf ward (May 2026, full extent) |
| `index.html` | the browsable page: summary, map, filters, per-postcode results and links |
| `../tools/postcodes.mjs` | `fetch`, `build`, `query` |

Rebuild:

    node --max-old-space-size=6000 magpie/cwplans/tools/postcodes.mjs fetch   # ONSPD, ward names and boundary, OSM addresses (about 1 minute)
    node magpie/cwplans/tools/postcodes.mjs build
    node magpie/cwplans/tools/postcodes.mjs query                              # about 12 minutes, about one request a second per source

## Method

1. **Candidates.** A full postcode is outward code + sector digit + two unit letters. The unit letters never include C, I, K, M, O or V, which leaves 20 letters and 400 unit codes per sector. E14 has sectors 0 to 9, so there are 4,000 candidates.
2. **Actual.** Each candidate is looked up in the ONS Postcode Directory (ONSPD), August 2026, through the ONS hosted table on ArcGIS. The ONSPD holds every postcode Royal Mail has used, with its introduction date (`dointr`), its termination date (`doterm`, empty while live), a large-user flag and the ward. Result for E14: 1,905 live, 1,076 terminated, 1,019 never allocated.
3. **Canary Wharf.** OSM has no outline of the Canary Wharf estate: Nominatim returns only a point for the place and outlines of single buildings. So two definitions are used, and a postcode can meet both, one or neither:
   - **ward**: the ONSPD ward code is E05009323, the Tower Hamlets ward "Canary Wharf". One Canada Square (E14 5AB) is in it.
   - **box**: the postcode's grid reference is inside the 3D model's Canary Wharf box: WGS84 −0.0300, 51.4980 to −0.0050, 51.5100. The box covers the estate, Wood Wharf, Heron Quays and Crossrail Place.
4. **Tiers.**

   | tier | meaning | count |
   |---|---|---|
   | `cw-core` | live, in the ward and in the box | 325 |
   | `cw-ward` | live, in the ward, outside the box | 80 |
   | `cw-box-other-ward` | live, in the box, in another ward (Poplar 87, Blackwall & Cubitt Town 147, Limehouse 19) | 253 |
   | `terminated-cw` | terminated, was in the ward or the box | 224 |
   | `e14-other`, `terminated-other` | live or terminated elsewhere in E14 | 1,247 and 852 |
   | `possible-unallocated` | valid code, never in the directory | 1,019 |

   47 live Canary Wharf postcodes are large-user postcodes. Each of these is allocated to one organisation that receives a lot of mail.
5. **OSM addresses.** The Greater London OSM extract gives the number of OSM features that carry each postcode in `addr:postcode`, with their streets and kinds (shop, office, building, entrance). 448 live Canary Wharf postcodes appear in OSM.

## What "possible" means

A never-allocated code is not wrong: Royal Mail allocates new postcodes when new buildings or large users need them. Canary Wharf's newest postcodes came in recently. E14 5JG was introduced in July 2026, E14 9TL in January 2026, and E14 5HF and E14 5JA to E14 5JF in August 2025. So the 1,019 never-allocated codes are the pool that future postcodes will come from. A code that appears in a later ONSPD release has been allocated.

Terminations show change in the other direction: 224 Canary Wharf postcodes have ended since 1990. The highest number in one year was 27, in 2023. Introduction and termination dates are therefore an official signal of openings and closings. They show up in each quarterly ONSPD release.

## Querying the web by postcode

`postcodes.mjs query` sends every live Canary Wharf postcode (658) to four open sources, as an exact phrase where the source supports it:

- **FSA food hygiene ratings** (`api.ratings.food.gov.uk`): food premises at the postcode, with the rating date and a "new rating pending" flag. A new premises shows up here soon after it opens and is first inspected. Entries without an address are skipped, because the FSA withholds the address of businesses run from a private home.
- **GOV.UK search API**: only these document types: news stories, press releases, notices, corporate reports, consultations, guidance, accident investigation reports (RAIB, MAIB, AAIB), CMA cases, statistics, transparency and policy papers. Tribunal decisions are never requested. The test search for E14 5AB showed that their titles name private individuals.
- **Wikipedia full-text search**: articles that contain the postcode.
- **Wikidata**: items whose postal code (P281) is one of the postcodes.

Results of the run on 2026-10-03 (658 postcodes, no errors):
- FSA: 526 food premises at 158 postcodes. 34 were "Awaiting Inspection", which usually means a new business. The newest ratings were from 23 September 2026.
- GOV.UK: 111 documents at 34 postcodes.
- Wikipedia: 22 articles at 16 postcodes. Most are organisations based at Canary Wharf, for example the Competition and Markets Authority and the EBRD.
- Wikidata: 23 items.

The page's "Openings and closings" section lists the FSA premises awaiting inspection, the newest ratings, the newest postcodes and the most recently terminated postcodes.

For general web search engines, `queries.json` gives templates such as `"{postcode}" "Canary Wharf" "now open"`. A test on 2026-10-03 showed why each template names the place:
- `"E14 5AB" events` returned events at MIT's Building E14 in Cambridge, Massachusetts.
- `"E14 5NY" opening` returned opening-hours directories. These list the businesses at the postcode (for example the Jubilee Place shops), which is useful as a list of occupiers but does not show openings.

## Limits

- A postcode's position is the ONS grid reference for the postcode, usually the mean of its address points (`grid_quality` gives the quality). A postcode near the edge of the box can have addresses on both sides.
- The ward boundary changes when the council redraws wards. The data uses the May 2026 wards that the August 2026 ONSPD carries.
- The ONSPD has no street names or addresses. Those come from Royal Mail's PAF, which is not open. The streets here come from OSM, so they cover only what OSM mappers have recorded.
- Only E14 is enumerated. The tool takes other districts (`DISTRICTS` in `postcodes.mjs`). Note that filtering the national table by postcode text times out, so the tool fetches record IDs first and then the rows by ID.
