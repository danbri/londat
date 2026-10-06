# _TMI: the CWG maps and guides, read and normalised

Text, OCR and normalised entries from the four Canary Wharf Group PDFs in `../maps/` (see `../README.md` and
`../manifest.json`). Made 2026-10-06 at the request of the owner, danbri ("ocr where needed and normalise, use a subdir
_TMI").

**Rights.** The PDFs and their text belong to Canary Wharf Group; the store guide is designed by Paul Anthony, Ravenshaw
Studios Limited ("© Copyright Ravenshaw Studios Limited and Paul & Linda Anthony 2026"); artworks, photographs and
quotes belong to the artists, photographers and authors named in the files. No open licence. These files are for the
scoping and prototyping phase of magpie/cwplans only, like the PDFs (see `../README.md`). The art texts (descriptions)
are copied here because the PDFs are here; do not copy them into the main repository. Use facts only there.

## Files

| file | from | what it holds |
|---|---|---|
| `store-guide-2026-07-20.json` | `260720_store_guide_JULY_composite_v85_vec.pdf` (2 pages, text as outlines, so OCR) | 692 list entries: page, group (shopping-malls, street-retail, estate, legend), section (shops, restaurants, cafes-bars, services, entertainment, residential, offices-tenants, office-tenants, estate-buildings, legend), name, `grid_refs` [{row, col}], `extra` (the rest of the line, e.g. "Atrium Kitchen 5M", "level -3, Canada Square Car Park, take lift at 11G"), `level`, `buildings` (office tenants: address and grid square per building), `name_matched` (CWG directory slug, title, edit distance), raw `ocr_text`, `ocr_confidence`, `bbox`. Also: the grid of each page, 14 mall name labels with their colour and grid cell, the mall colours, 21 floor-level badges (value, grid cell), title and footer text, the OCR lines that were dropped or read again. |
| `store-guide-2026-07-20.ocr.tsv` | same | 4,357 raw OCR words: page, region, tile, block, line, word, x0, y0, x1, y1 (PDF points), confidence, text. Regions: lists, key, title, footer, plan (the map), cols/rows (grid margins), reread. |
| `AccesibilityMap_MAY-2025_v2.json` / `.txt` | `AccesibilityMap_MAY-2025_v2.pdf` (text layer) | 174 map labels (text, lines, bbox, font size, angle, `curved` for text set on a curve) and 14 legend entries. The symbols (lifts, toilets, ramps, car parks) are drawings with no text: their positions are NOT in this file. |
| `JUNE-2025-Childrens-Art-Trail_Map_Online_AW.json` / `.txt` | children's art trail (text layer) | 12 artworks: number, title, year, artist, description, activity (LOOK / COUNT / IMAGINE / DRAW text), `location_text` where the text gives one, `map_markers` (boxes of that number on the page 2 map; a number can occur more than once). |
| `Art-Brochure_Whale-cover.json` / `.txt` | art brochure (text layer) | 99 entries: 85 artworks with a code (A1 to E21; ranges such as C4-12 and C26-28 count as one entry: 99 numbers covered, no gap in any zone), 3 parts of C26-28, 4 "hidden gems", 3 "spotlighted" repeats (`repeat_of_page`), 4 programme items. Fields: code, zone, zone_name, number (number_to), title, artist, year, medium, location, indoors, lighting_note, description, page, bbox. |

`.txt` files: the text layer by page, in the PDF's stream order, one text line per line.

Coordinates everywhere: `bbox = [x0, y0, x1, y1]` in PDF points, origin at the top left of the page, y down.
Grid references: `row` is the number, `col` the letter. The store guide grids have no row 13 and no columns I or O.

## Method

Tool: `magpie/cwplans/tools/cwg-maps-tmi.mjs` in danbri/glitchcan-minigam (npm only: pdfjs-dist 6.4.299,
@napi-rs/canvas, tesseract.js 7.0.0 with the eng `4.0.0_best_int` model). Re-run:

    cd glitchcan-minigam && NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/cwg-maps-tmi.mjs   # about 2 minutes

- Store guide: each page is rendered with pdf.js. The lists are OCR'd at 400 dpi in tiles (3,200 px high, 240 px
  overlap; a line belongs to the tile whose core holds its centre). Lines are put into columns by their left edge;
  a line that is indented, or starts with "(" or a lower-case letter, continues the line above when that line has no
  grid reference yet. Section headers are matched by name. Lines under 75 % confidence are read again alone at
  600 dpi; the better reading is kept (`ocr_reread`, and `pages.pageN.reread_lines`). Lines under 40 % are dropped
  (listed in `dropped_low_confidence_lines`; all were symbol pictures).
- Grid references are read from the end of the line. Inside that run only, OCR confusions are fixed and recorded in
  `ocr_fixed_from` (S or $ for 5, ")" for J). A line-initial "|", or "l" before t, p, v, d, s, m, n or c, is read as
  "I" (`name_ocr_fixed`); the raw text stays in `ocr_text`.
- Names are matched to the CWG directory titles (`registry/sources/brands/cwg-directory.json`): normalised text,
  edit distance at most 12 % of the length (max 3). A match is a hint; the name is never replaced by it.
- Grid: the letters and numbers in the margins are OCR'd and a straight line (position = a + b x index) is fitted
  through those read. Page 1: 10 column and 6 row labels read, pitch 105.6 / 108.1 pt, rms residual 0.8 / 0.1 pt.
  Page 2: 3 and 13 read, pitch 106.0 / 108.2 pt, rms 0.3 / 0.3 pt.
- Plan: OCR at 300 dpi in 2,600 px tiles (all words in the TSV). Mall labels: OCR lines that match a mall name and sit
  on a coloured background, plus a second pass that finds boxes of each mall colour and OCRs them inverted.
  Level badges: dark grey discs (#575856) found by colour, the digit OCR'd, the minus sign found by shape.
- Text PDFs: pdf.js text items, joined into lines, then into entries by font size and position (headings 15-16 pt,
  fact lines 7 pt; the fact block ends at the first wider line gap).

## Accuracy (measured)

- A random sample of 100 store-guide entries (seeded, all sections except the legend) was checked by eye against the
  rendered page: 99 raw OCR lines were exactly right; 1 ("Lakrids by Bülow 5H") had two wrong characters (u for ü,
  S for 5). After the grid-reference fix, 100 of 100 grid references in the sample are right.
- All list lines were also OCR'd with native Tesseract 5.3.4 on the same 400 dpi tiles: 688 of 714 lines agree.
  Every disagreement was checked by eye: 14 list lines have a raw error in this tool's first reading (about 2 %);
  after the fixes above, 5 entries still have a wrong character in the name: "Lakrids by Bulow" (Bülow), "Sgstrene
  Grene" (Søstrene), "/a'ta" (Za'ta), "ISmash" (iSmash), "Caffé Nero" (Caffè, page 1). Four of the five have the right
  `name_matched`. Errors that both engines make are not found by this check: "| Thai" was one (now fixed). So read
  about 1 % as a lower bound for names.
- Directory: 276 of the 420 retail entries match a directory title (261 exactly after normalisation, 15 by edit
  distance). Check the 15 before use; "The Qube" -> "THE CUBE" is probably a different place.
- Mall labels: 14 found of the 19 seen by eye (missed: page 1 Canada Place, Park Pavilion, One Canada Square Lobby;
  page 2 Jubilee Place, Churchill Place). Level badges: all 20 on the page 1 plan read right by eye (plus the "0" in
  the key). A badge's grid cell is the cell of its centre; a badge on a cell line gets one of the two cells.
- Text PDFs: no OCR. The trail has 12 of 12 artworks; the brochure covers every code number in every zone.

## Printed so (not OCR errors)

Checked by eye on the page: "Bewliehill $J" (no such grid square; read as 5J and marked `ocr_fixed_from: "$J"`),
"Arrancini of Sicily" (page 1; "Arancini" on page 2), "Germological Institute of America", "Pinnicle Wealth
Management", "Welhunt", "Potatoe Art Studio", "Hireright 20 Water Street 4E" (20 Water Street is 18C elsewhere),
"Notes Coffee Roasters, kiosk 7L" on page 2 (7L is a page 1 square; left without `grid_refs`, with a note), and the
brochure's "ScibbleForm" in the trail ("ScribbleForm" in the brochure) and "Skycraper".

## mallmap/ (the Living Map archive, normalised)

Made by `magpie/cwplans/tools/cwg-mallmap-tmi.mjs` from `../mallmap/`. Every feature of the indoor tiles once, with its
properties as served, its geometry in WGS84 (7 decimal places) from the most precise zoom at which it lies whole in one
tile (`zoom_used`; 10,088 of 10,092 whole; the other 4 are their pieces at the lowest zoom as a Multi* geometry,
`whole: false`). One FeatureCollection per floor (`indoor-floor-<floor_level>.geojson`, -4.0 to 2.0, with -0.5 = Level
-1M and 0.5 = Level M) and `outdoor.geojson`; `features.json` = the 537 API feature records (one per id); `places.json`
= the 536 named places; `summary.json` = counts per floor and class. Tiles are not simplified by zoom (each zoom from 14
to 18 holds all 8,871 indoor features); only the number of cut pieces changes. Rights: Canary Wharf Group / Living Map.
