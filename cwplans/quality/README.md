# Data quality: error classes and what they mean for compositing

Browse the issues: https://danbri.github.io/glitchcan-minigam/magpie/cwplans/atlas/#quality
Generated tables with every check, its method and examples: [CATALOGUE.md](CATALOGUE.md). Machine-readable: `issues.json`.

Re-run after any rebuild:

    node magpie/cwplans/tools/audit-quality.mjs

The audit does not correct anything. It measures the same 34 checks on every rebuild, so that the rules for combining sources (the compositing layers) are designed from the error classes that actually occur, and so that a rule change shows up as a change in the counts.

## Summary (2026-10-03)

1,463 issue records from 34 checks (the five routing-network checks NET-1 to NET-5 report counts only). Severity: 9 high, 758 medium, 696 low. The two pipeline faults (PL-1, PL-2) are fixed and read 0.

| class | what goes wrong | checks | main numbers |
|---|---|---|---|
| identity | one thing has two records, or two things share one record | ID-1 to ID-4 | 3 Wikidata items on 2 outlines each (OSM tags the same item twice); 78 occupants recorded by two sources and not merged, 5 mapped twice in OSM; 20 buildings named after an occupant |
| position | a point is placed in the wrong building, or its position means something else | SP-1 to SP-6 | 86 of 181 mall or below-ground occupants are placed by a 2D test in an outline that is not their mall (the malls run under several buildings); 412 of 764 FSA positions (54%) are postcode centres or shared points; 161 of 761 named OSM occupants are outside every outline; OSM and FSA put the same branch a median 34 m apart (90th percentile 107 m, maximum 258 m) |
| attribute conflict | sources give different values for one attribute | AT-1 to AT-5 | 46 of 72 occupants have a CWG mall level that differs from the OSM level, in a pattern that depends on the mall; 9 buildings are newer than the LiDAR; 6 floor counts differ between OSM and Wikidata; the Jubilee line levels we took from Wikipedia and an interview are 4 m (Canada Water) and 6 m (North Greenwich) deeper than TfL's measured rail levels |
| validity | a value is not in the form the tools expect | VA-1 to VA-4 | 100 of 881 OSM level values are lists, ranges or fractions ("0;1", "0-2", "0.5"); since 2026-10-03 one parser reads all of them (VA-2: 0 unreadable); 20 features carry a terminated postcode |
| pipeline | our own tools damage the data | PL-1, PL-2 | fixed 2026-10-03, now 0. Before: 57 OSM features with several postcodes in one tag lost them from their registry record (our tools read the list as one invalid postcode); 52 branch addresses read "Unit Unit". The fix brought back 96 postcode links and 3,432 company-to-building matches |
| currency | a value was true once | TM-1 to TM-4 | 1,902 of 16,619 companies at Canary Wharf postcodes (11%) are not active; the CWG directory copies are a median 322 days old; of 34 Wikidata occupant links 4 are current, 6 have ended (the registry still lists them) and 24 have no date |
| coverage | a source does not see everything | CV-1, CV-2 | only 28% of buildings have a name and 8% a Wikidata item; 205 of 374 CWG directory entries are in no other source; of the 271 branches, OSM sees 214 (79%), CWG 165 (61%) and the FSA 120 (44%, food only), and 57 are not in OSM |
| meaning | a field does not mean what its name suggests | SE-1, SE-2 | 21 postcodes have 100 or more registered companies (E14 5HU: 2,652): registered offices, not occupants; 5,888 of 6,629 heritage positions are where an object is kept, not where it was found |

## What the numbers say

**No source is the reference.** Each source is good at one thing and wrong or silent on others. OSM is the best for geometry and for occupants placed in buildings, but it names buildings after tenants and covers only part of the estate's shops. The FSA file has every food business with a rating, but more than half of its positions are postcode centres. The CWG directory has the mall and level of 374 shops and restaurants, but its copies are months old and its levels use a different scheme from OSM. Companies House is complete for registered offices, which are not occupancy. A composite layer must take each attribute from the source that is good at it, and keep the others as evidence.

**Many errors are joins, not values.** The largest classes (ID-2, SP-3, SP-4, PL-1) come from matching records across sources, not from wrong values in one source. The One Canada Square fault fixed on 2026-10-03 was of this kind: correct Wikidata, correct OSM, wrong link. Joins therefore need their own record: method (contains, within 12 m, postcode, name), distance, and confidence, kept next to the result.

**Positions have a precision and a meaning.** "Has coordinates" is not enough. An FSA point at the postcode centre places a business in a postcode, not in a building (SP-3). A Wikidata museum object is at its museum (SE-2). A Portable Antiquities find is at the centre of a 1 km box. Each position needs a precision class and a relation type before it can go on a map or into a containment test.

**The estate is three-dimensional; the joins are not.** The Canary Wharf malls (Cabot Place, Canada Place, Jubilee Place, Crossrail Place) and the passages between them run below and through several building footprints. A point-in-outline test puts a mall shop in whatever building is above it: Boots at Canada Place landed in The Ivy (by proximity, 2 m), Nicolas in the One Canada Square mall landed in Crossrail Place (SP-6, 86 cases). Occupants of a mall need the mall as their container, with level, and the building above only as context.

**Levels are labels, not heights.** The OSM `level` tag is a floor index chosen by mappers. The CWG directory uses the estate's own names ("Mall Level -1", "Street Level 0"). AT-3 shows the offset between them depends on the mall: in Cabot Place, Canada Place, Crossrail Place and One Canada Square the CWG level is mostly the OSM level minus 1 (19 of 26 in Cabot Place); in Jubilee Place and Churchill Place they mostly agree. This is a scheme difference, not mapper error, and it can be measured and stored as a per-mall table. Heights in m OD come only from published slab levels (the Crossrail Place figures).

**Several "errors" are ours.** PL-1 and PL-2 are faults in this project's tools, found by the audit: OSM's ";" lists are not split, and a label is added to a free-text field. Both were fixed in the parsers on 2026-10-03 and tested on fixtures; the checks stay, and read 0. The fix also changed SE-1 (24 → 36): recovered postcodes matched more companies to residential buildings, so more registered-office clusters became visible. A fix in one layer can raise a count in another; say why when it happens.

**Time is missing from most links.** Wikidata says the Financial Services Authority occupies One Canada Square; it was abolished in 2013. The query did not fetch start and end dates, so current and former tenants look the same (TM-4). Company status, FSA rating dates, CWG archive dates and the LiDAR survey date all need to travel with the values they qualify.

## A layered design for compositing

The classes above suggest five layers. Each layer is rebuilt from the one below; nothing is edited by hand except the rule tables.

1. **Source records.** As fetched, never changed: source, record id, fetch date, licence, raw fields. (Today: `data/raw/` and `registry/sources/`.)
2. **Normalised observations.** One parser per source that splits lists (PL-1), parses levels into ranges (VA-2), splits addresses into fields (PL-2, VA-1), validates postcodes against the current ONSPD and keeps terminated ones as history (VA-3), adds a precision class and relation type to every position (SP-3, SE-2), maps categories through one crosswalk (AT-4), and states the datum of every height or level.
3. **Links.** Entity ids (`cwb-` for buildings; mall or complex ids for the malls; an occupant id still to be designed) and a link record for every join: the two records, method, distance, confidence, date. One item to one outline (ID-1). Same-name occupants in one building are merged only through a second key (ID-2).
4. **Composite attributes.** For each attribute, a precedence rule and a tolerance. All values are kept; the rule picks the one to show, and a conflict beyond the tolerance becomes a flag:

   | attribute | first choice | then | flag when |
   |---|---|---|---|
   | building name | Wikidata label | OSM name, unless it is an occupant or brand (ID-3); then address | OSM and Wikidata differ |
   | height | LiDAR (buildings older than the survey) | OSM tag or Wikidata for newer buildings | differ by more than 10 m and 10% (AT-1) |
   | floors above ground | OSM `building:levels` | Wikidata | differ by 2 or more, or storey height outside 2.5–6 m (AT-2) |
   | floors below ground | OSM `building:levels:underground` | Wikidata | no source: unknown, not zero |
   | station and tunnel level | asset owner's level against a stated datum (TfL rail levels, Crossrail slab levels) | a rounded depth "below ground" from a secondary source, only with its reference point | sources more than 2 m apart (AT-5) |
   | occupant container | CWG mall or OSM indoor area with level | OSM point inside the outline (street-level shops only) | the mall and the footprint building differ (SP-6) |
   | occupant position | OSM point | FSA point only if not a postcode centre | OSM and FSA more than 50 m apart (SP-4) |
   | occupant level | OSM level (index) | CWG level through the per-mall offset table | the two disagree after the offset |
   | occupant category | project vocabulary through the crosswalk | source category kept | crosswalk pair crosses families (AT-4) |
   | "is here now" | seen in a source dated within 12 months | older sightings marked as history | only in a source older than 12 months (TM-2) |
   | registered companies | Companies House | — | never used as occupancy (SE-1) |

5. **Views.** The atlas and the 3D model read composite values and show the flags and the sources for each value.

## Next steps, in order

1. Done 2026-10-03: the two pipeline faults are fixed at the parser level (`tools/osm-values.mjs`, fixture tests); PL-1 and PL-2 read 0. Level lists, ranges and fractions are parsed by the same module (VA-2: 0 unreadable).
2. Add a precision class and relation type to every position in the registry and the branch table; stop using postcode-centre FSA points for building placement.
3. Store link records (method, distance, confidence) in the registry instead of bare results.
4. Measure the per-mall level offset table from AT-3 and use it for the CWG levels.
5. Fetch Wikidata start and end qualifiers (P580/P582) and dissolution dates, and company status dates.
6. Re-crawl the CWG directory (directly or from Common Crawl) and record which entries are still present.

Steps 2 to 4 are the first composite layer. The audit gives the measure for each: the count of the matching check should fall, and no other count should rise.

## Limits of the audit

- A check finds only the class it was written for. Errors that no check describes are not counted.
- Some checks count disagreement, not error: in AT-1 either source may be right, and in ID-3 a single-use building may correctly carry its tenant's name.
- SP-1 counts more unplaced occupants (161) than the registry summary (121) because it also counts tourism and craft features.
- VA-1 looks only for repeated address words in source strings; names that repeat on purpose ("Tian Tian Market") are not flagged.
