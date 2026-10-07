# Facade imagery and facade facts — Canary Wharf towers of 100 m and over

Checked 2026-10-03. Two files:

- `photos.json` — every photo used: building (cwb- id), local file (or null), image URL, page, licence,
  author, date taken, face shown (N/E/S/W, and how it was judged), size, use (`texture` or
  `reference-only`), the rectified patches made from it. Also 8 YouTube drone videos as references.
- `facades.json` — per building: architect, completion, floors, height, cladding, glass/frame/spandrel
  colours, bay width, floor height, emphasis, crown, setbacks, night lighting, and for each value whether it
  was **measured**, **judged** (by looking at photos) or **assumed**. `measurement` holds the raw periods,
  aspect corrections and the cross-checks.

Pixels are in `data/raw/facades/` (git-ignored, about 110 MB): `<cwb-id>/src-<id>.jpg` (downloaded open
photos), `<cwb-id>/rect-<key>.jpg` (rectified patches at metric aspect), `_aerial/` (2026 airship views),
`contact.jpg` (all rectified patches on one sheet).

## Licence rule

- Downloaded only CC0, Public Domain Mark and CC BY (2.0/4.0). Result: 49 files — 33 CC BY 2.0,
  15 CC BY 4.0, 1 Public Domain Mark. Attribution (author, licence, page) is in `photos.json`; any
  texture made from them must carry it.
- CC BY-SA, NC, ND and all-rights-reserved images were not downloaded. Seven Commons CC BY-SA photos were
  looked at (`file: null`) for facts only. YouTube videos: title, channel and URL only; nothing downloaded.
- Building footprint widths (used as a scale for bay widths) come from the OSM extract (ODbL) already in
  `data/raw/registry/osm-cw.json.gz`; `facades.json` lists them per building as `footprint_obb_m`.

## Method (see `facades.json` → `method`)

1. OpenCV LSD line segments in a hand-chosen facade region → RANSAC vanishing points (vertical and
   horizontal) → affine rectification by homography.
2. Metric aspect from the vanishing points and a focal length (from the two vanishing points when plausible,
   else a 26 mm-equivalent phone lens). Patches are resampled to that aspect.
3. Bay and floor periods: autocorrelation of column/row gradient profiles (FFT cross-check); the fundamental
   chosen by looking at the patch.
4. Metres: floor height = height / floors (assumed) unless a face width gives a scale; bay = OSM face width /
   bay count when the whole face is visible, else from the floor height and the metric aspect.
5. Colours: k-means (k=3, Lab); roles (glass, frame, spandrel) assigned by judgement.

Checks where a known value exists:

- One Canada Square: 19.9 window bays measured across the west face; known 19.8 (3,960 windows / 50 floors /
  4 faces), +0.5%. Floor height from the metric aspect 4.0–4.07 m against an assumed 3.9 m, +2 to +4%.
- Landmark Pinnacle: panel width 0.94 m (face width / count) and 0.97 m (floor height and aspect), within 3%.
- HSBC: measured floor height 3.92 m against 200 m / 45 = 4.44 m (which includes the crown), −12%.
- 25 Bank Street: two photos give bay 1.74 m and 1.61 m, 8% apart.

## Counts

- 31 target ids (the brief said 33; its list has 31). Rectified open texture for 17 buildings:
  0413, 0577, 0451, 0715, 0590, 0520, 0417, 0813, 0712, 0645, 0424, 0582, 0585, 0589, 0525, 0701, 0317.
- Specs or judged facts only for 8: 0647 (copied from its twin 0645), 0658, 0592, 0801, 0514, 0963, 0737, 0459.
- Nothing found for 6: 0659 (50-60 Charter Street), 0641 (22 Marsh Wall), 0830 (One Thames Quay),
  0343 (Charrington Tower), 0593 (Vertus), 0966 (Sirocco Tower).

## Gaps and cautions

- Faces: 32 of the 45 Flickr photos have no geotag. Faces were judged from landmarks (HSBC/Citi either side of One
  Canada Square from Cabot Square, docks); several are `unknown`. Close-range geotags (under 25 m) are weak.
- Old photos: 40 Bank Street, 1 West India Quay, 33 Canada Square and part of 25 Bank Street are from
  2011–2016 (no newer open photo found).
- Curved or cylindrical towers (One Park Drive, One Bank Street, 1 West India Quay) cannot be rectified by one
  homography; their patches are valid only in a narrow strip.
- Height disagreements seen, not patched: Harcourt Tower registry 169 m vs Wikipedia 192.4 m; 40 Charter Street
  160 m vs 178.6 m (and not complete — est. February 2027); Wardian East 184 m vs 187.2 m.
- Commons from this container: the API and upload host return HTTP 429 (retry-after 600 s). The four
  Commons CC BY files were fetched with the web-fetch tool instead. Flickr originals (`_o`) also return 429;
  the 4k size was used.
- Data register: these files are not yet in `data-register.json`. Before committing, add entries for
  `registry/sources/facades/photos.json` and `facades.json` (sources: Flickr CC BY photos, Wikimedia Commons,
  Wikipedia/Wikidata text, OSM footprint widths — `osm.use: derived`) and run
  `node cwplans/tools/check-data-register.mjs --write`.

## Tools and intermediate files

The scripts are kept as the facade agent ran them (2026-10-03). They read and write JSON in the
current folder, so run them from `work/`, with a Python that has OpenCV, numpy and scikit-learn.

| file | what |
|---|---|
| `tools/facade.py` | rectification and measurement of one facade region (LSD, RANSAC vanishing points, homography, autocorrelation periods, k-means colours) |
| `tools/measure.py` | periods and colours of a patch cut by hand (no rectification) |
| `tools/metric.py` | metric aspect of each rectified patch from the vanishing points and a focal length: `work/rois.json` + `work/meas.json` → `work/aspect.json` |
| `tools/build.py` | the patches, bays and floors in metres: `work/rois.json`, `aspect.json`, `meas.json` → `work/results.json`, `data/raw/facades/<cwb-id>/rect-*.jpg` |
| `tools/write_facades.py` | `work/results.json` + `work/footprints.json` + `photos.json` → `facades.json` |
| `work/rois.json` | the facade regions chosen by eye, per photo (a hand step: this is the judgement in the method) |
| `work/meas.json` | the raw measurement of each region (facade.py output, collected by hand) |
| `work/footprints.json` | OSM footprint face widths per building (oriented bounding box), the scale for bay widths |

`photos.json` was written by hand from the search results; it is the input, not an output.
