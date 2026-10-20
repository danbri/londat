# Hosting options: range requests, one-file archives and the site architecture

Written 2026-10-20 for OKR KR2.5 (tile hosting that can grow past GitHub Pages), KR2.3 (one tile format) and KR3.1 (low-end
devices): https://github.com/danbri/londat/blob/main/OKRS.md . Owner, 2026-10-20: "we need to work on scaling. Perhaps gh
pages is not last word in site architecture but consider our options, eg http range reqs?"

Earlier notes: https://github.com/danbri/londat/blob/main/docs/planet-architecture.md (section 5, "Hosting off GitHub
Pages") and https://github.com/danbri/londat/blob/main/docklands/SCALING-AND-OKRS.md . This study replaces the "to be
checked" items of those notes with measurements.

Rules for this study: read requests only, against public URLs. No upload, no account, no data published outside this
repository. Every option that needs an account or an upload is a decision for the owner (section 7).

## 0. Summary

- **Range requests work on GitHub Pages.** Pages answers `Range` with 206 and `Content-Range`, also for suffix ranges
  (`bytes=-512`). A page on https://danbri.github.io/londat/ can read any byte range of any file of the same site. So a
  one-file archive (PMTiles, a ZIP, a 3TZ, FlatGeobuf, GeoParquet) can live on Pages today.
- **Pages is a poor host for a page on another origin.** Pages sends `Access-Control-Allow-Origin: *` but no
  `Access-Control-Expose-Headers` and refuses the CORS preflight (405). raw.githubusercontent.com is the same (preflight
  403), with a 5-minute cache. jsDelivr refuses a suffix range from another origin. GitHub release assets send no CORS
  header at all. Hugging Face, Cloudflare R2 (with a bucket CORS rule), Source Cooperative and the Zenodo API answer the
  preflight for `Range`.
- **Compression trap.** Pages, raw.githubusercontent.com and jsDelivr compress JSON, glb and `application/octet-stream`
  (any unknown extension, such as `.3tz` or `.pmtiles`). With `Accept-Encoding: gzip`, the range is cut from the gzip
  stream, not from the file. Chromium sends `Accept-Encoding: identity` with every `Range` (measured), so the browser is
  safe; other clients (curl `--compressed`, some HTTP libraries) are not. jsDelivr is worse: its CDN cache can answer a
  client that asked for no compression with the brotli bytes (measured). An archive must carry its own compression.
- **Prototype.** The UK skeleton (1,530 files, 37.8 MB) packed into one ZIP of 9.3 MB, read in the browser by a 150-line
  range reader. The same answers as the files (tested). Requests for a flight UK -> south-east -> London plus a search:
  **124 -> 43**. Bytes: 1.50 MB -> 1.79 MB (+19 %; +9 % with a smaller merge gap). Time: about the same (HTTP/1.1 with
  40 ms per request: 1.6 s -> 1.3 s; HTTP/2 with 40 ms: 1.1 s -> 1.6 s). On the live Pages site the files take 1.2 to
  1.5 s (HTTP/2). So an archive is **not** a speed fix for this data set. Its value is fewer files (1 instead of 1,530),
  a quarter of the size on the host, one version hash per data set, and far fewer billed requests on an object store.
- **Chromium cache lock.** Parallel range reads of one URL with the HTTP cache on run one after another (the London step
  0.8 to 0.95 s against 0.24 to 0.4 s). The reader uses `cache: 'no-store'`. A browser cache for the archive must then
  come from the reader (Cache API), not from HTTP.
- **Pages size.** The staged site is 535.5 MB in 9,142 files (2026-10-20). Deflated, it would be 257.9 MB. The JSON of
  `cwplans/feeds/` alone is 199.5 MB -> 37.1 MB. Packing the bulk extracts is the cheapest way to stay under 950 MB.
- **Recommendation (section 6).** Keep the app and the small data on Pages. Put large tile sets (London 3D Tiles, world
  base, terrain) on one range-capable host behind one base URL per region config. First choice for the prototyping
  phase: a Hugging Face dataset (cost 0, versioned, the best CORS of the hosts measured). For production or high traffic:
  Cloudflare R2 with a custom domain (no egress fee). Pack small files into archives only where file count, size or
  per-request cost matters (the bulk extracts, the UK skeleton). Keep 3D Tiles as files for now.

## 1. Measured: the hosts (2026-10-20, 21:15 to 21:35 UTC)

Method: `bash cwplans/tools/probe-range-host.sh <name> <url>`
(https://github.com/danbri/londat/blob/main/cwplans/tools/probe-range-host.sh) from the cloud container (a US east data
centre: the Fastly POP is IAD) through the session's HTTPS proxy. The absolute times include the proxy; use them to rank
the hosts, not as times from London. Browser checks: Chromium 1194 headless, `fetch` with a `Range` header from a page on
https://danbri.github.io (so every other host is cross-origin).

Test files: the UK skeleton manifest (334,843 bytes JSON) and a León tile (105,924 bytes glb) of this repository; for
the other hosts a public file of similar kind.

| host (test URL) | 206 + Content-Range | suffix range | gzip/br and Range (curl) | CORS: Allow-Origin / Expose-Headers / preflight for Range | browser, cross-origin `bytes=0-1023` / `bytes=-512` | Cache-Control, ETag | redirects | TTFB, 5 samples (s) |
|---|---|---|---|---|---|---|---|---|
| GitHub Pages (https://danbri.github.io/londat/cwplans/docklands/data/uk/manifest.json) | yes | yes | gzip on json, glb and octet-stream; the range is cut from the gzip bytes (`0-1023/44527`) | `*` / none / **405** | same-origin: both work, Content-Range readable | `max-age=600`, ETag | 0 | 0.16, 0.21, 0.17, 0.16, 0.19 |
| raw.githubusercontent.com (https://raw.githubusercontent.com/danbri/londat/main/cwplans/docklands/data/uk/manifest.json) | yes | yes | gzip on json (range on gzip bytes); not on glb | `*` / none / **403** | 206 but Content-Range not readable / **fails** | `max-age=300`, ETag (SHA-256) | 0 | 0.14, 0.15, 0.16, 0.14, 0.15 |
| GitHub release asset (https://github.com/protomaps/go-pmtiles/releases/download/v1.28.0/go-pmtiles_1.28.0_Linux_x86_64.tar.gz) | yes | **501** "Unsupported client range" | none | **none** on either hop / 405 | **fails** (no CORS) | github.com hop `no-cache`; asset hop ETag | 1 (302 to release-assets.githubusercontent.com, signed URL, about 1 h) | 0.38, 0.24, 0.23, 0.23, 0.23 |
| jsDelivr (https://cdn.jsdelivr.net/gh/danbri/londat@main/cwplans/docklands/data/uk/manifest.json) | yes | yes, but cut from the brotli bytes (`41090-41601/41602`) although curl asked for no compression | brotli; ranges on the compressed bytes | `*` / `*` / 200 but no Allow-Headers | 206, Content-Range readable / **fails** (Range not allowed by the preflight) | `max-age=604800, s-maxage=43200` (a branch is cached 12 h at the CDN, 7 days in the browser), weak ETag | 0 | 0.97, 0.51, 0.16, 0.17, 0.17 |
| Hugging Face dataset, Xet file (https://huggingface.co/datasets/openai/gsm8k/resolve/main/main/test-00000-of-00001.parquet) | yes | yes | none on parquet | the exact origin / Content-Range, Accept-Ranges, ETag ... / **200, allows range** | both work | redirect `no-store`; CDN hop ETag = content hash | 1 (302 to us.aws.cdn.hf.co, signed, expires after about 1 h) | 0.34, 0.31, 0.33, 0.33, 0.30 |
| Hugging Face, small file (README.md of the same dataset) | yes | yes | br without Range | as above | both work | ETag | 1 (307 to `/api/resolve-cache/...`) | 0.22, 0.23, 0.23, 0.23, 0.24 |
| Cloudflare R2, public bucket on a custom domain (https://r2-public.protomaps.com/protomaps-sample-datasets/cb_2018_us_zcta510_500k.pmtiles) | yes | yes | none | `*` / ETag only (bucket rule) / **204, allows range** | not run; the preflight answer allows it | no Cache-Control; ETag; `cf-cache-status: DYNAMIC` (not cached at the edge) | 0 | 0.41, 0.45, 0.50, 0.42, 0.45 |
| Source Cooperative (https://data.source.coop/protomaps/openstreetmap/v4.pmtiles, 134.8 GB) | yes | yes | none | `*` / `*` / **204, allows any header** | both work | `no-cache, no-transform`, ETag | 0 | 0.64, 0.75, 0.53, 0.59, 0.67 |
| Zenodo, record URL (https://zenodo.org/records/18837714/files/genes_bin42.pmtiles) | yes | yes | none | none / none / 200 without CORS headers | not run (no CORS) | none | 0 | 0.48, 0.51, 0.51, 0.49, 0.55 |
| Zenodo, API URL (https://zenodo.org/api/records/18837714/files/genes_bin42.pmtiles/content) | yes | yes | none | `*` / no Content-Range / **200, allows range** | not run; the size must come from HEAD | rate-limit headers | 0 | 0.52, 0.50, 0.51, 0.50, 0.50 |
| A PMTiles file on GitHub Pages (https://pmtiles.io/stamen_toner(raster)CC-BY+ODbL_z3.pmtiles) | yes | yes | (octet-stream: compressed when asked) | `*` / none / 405 | (the PMTiles viewer reads it same-origin) | `max-age=600`, ETag | 0 | 0.24, 0.18, 0.36, 0.24, 0.40 |

Notes on the table:
- The browser sends `Accept-Encoding: identity` with every `Range` request (Chromium 1194, measured with the request
  headers; the Fetch standard says so). Pages then answers `bytes 0-1023/334843` (the file) for JSON and for
  `application/octet-stream` (`.ibk5` of kgx: `0-99/2056` in the browser, `0-99/539` in curl with gzip). Safari on the
  owner's iPhone: not measured; check it before an archive becomes the default.
- A cross-origin `Range: bytes=a-b` is a CORS-safelisted request header (no preflight); `bytes=-n` is not. So a reader
  must not depend on suffix ranges on raw.githubusercontent.com or jsDelivr. The prototype reader falls back to HEAD (the
  size) and an explicit range.
- A response header that is not exposed is invisible to the page. Without `Content-Range` in `Expose-Headers`, the
  reader cannot learn the file size from a range answer (raw.githubusercontent.com, the Zenodo API, the R2 bucket above).
  HEAD gives `Content-Length` (always exposed).
- Hugging Face answers each `resolve/` request with a redirect that may not be cached (`no-store`). The reader keeps the
  final URL (`response.url`) for the next reads and goes back to the `resolve/` URL on a 4xx (the signed URL expires
  after about 1 h, read from its `Expires` parameter). Then only the first read pays the extra round trip.
- Source Cooperative is slow to first byte (0.5 to 0.9 s here; `server-timing` showed 747 ms with 370 ms in the
  backend). Zenodo is about 0.5 s.

### Limits per host (from the providers' documentation, not measured; check the current pages before a decision)

| host | per file | per site / repository | traffic | other |
|---|---|---|---|---|
| GitHub Pages | 100 MB (the git limit; our rule) | published site 1 GB (our workflow stops at 950 MB); repository recommended under 1 GB, strongly under 5 GB | soft limit 100 GB a month | soft limit of 10 builds an hour (for branch builds; our deploy is a custom Actions workflow); deploy job timeout 10 minutes; not for commercial "file hosting" |
| raw.githubusercontent.com | 100 MB | the repository | GitHub tightened unauthenticated rate limits in 2025; no number is promised | 5-minute cache; a branch name URL changes with each push |
| GitHub release assets | 2 GiB each | no total limit stated | no limit stated | no CORS: browser use needs a proxy |
| jsDelivr (`/gh/`) | a per-file limit (tens of MB in its documentation) | a per-repository limit | "fair use" | not for general file hosting (its terms); a branch URL is cached up to 12 h at the CDN (measured `s-maxage=43200`) |
| Hugging Face dataset | 50 GB per file (Xet/LFS); recommended much smaller | public repositories: free storage within the published limits | rate limits per 5-minute window on `resolve/` for anonymous users (published in the Hub documentation) | versioned (git + Xet); a commit hash in the URL gives an immutable version; the content hash is the ETag |
| Cloudflare R2 | 5 TB per object | none | **no egress fee**; free each month: 10 GB storage, 1 M Class A (write), 10 M Class B (read) operations; then 0.015 USD per GB-month and 0.36 USD per million reads | public access by an `r2.dev` URL (rate-limited, not for production) or a custom domain on Cloudflare (edge cache with cache rules); CORS rule per bucket; Range yes |
| AWS S3 + CloudFront | 5 TB per object | none | S3 egress about 0.09 USD per GB (100 GB a month free for AWS as a whole); CloudFront always-free tier: 1 TB egress and 10 M requests a month | CORS rule per bucket; Range yes; the most mature tooling; a bill can grow without a cap unless you set budgets |
| Source Cooperative (Radiant Earth) | large (the measured file is 134.8 GB) | by agreement | free for public open data | an account and an approved data product; S3-compatible; open licence expected; CORS and Range measured above |
| Zenodo (CERN) | 50 GB per record (more on request) | per record | free | a DOI per version; records are frozen after publication (a new version for each change); rate limits; good for releases, not for a live tile service |

## 2. Our files today

Measured with `node cwplans/tools/pages-size.mjs` (https://github.com/danbri/londat/blob/main/cwplans/tools/pages-size.mjs),
2026-10-20, on the tree of commit 0b9a52c0 (the site as `.github/workflows/pages.yml` stages it; MB = 10^6 bytes):

| folder | files | size | deflated |
|---|---|---|---|
| cwplans/feeds (bulk extracts) | 485 | 199.5 MB | 37.1 MB |
| cwplans/docklands (3D page data, UK skeleton, world, places) | 1,722 | 121.2 MB | 61.5 MB |
| cwplans/cache (GeoPackages, latest.json) | 4 | 68.2 MB | 68.1 MB |
| kgx (graph versions, Shardborough store) | 5,863 | 50.6 MB | 34.7 MB |
| data (the owner's photos) | 53 | 40.4 MB | 40.3 MB |
| cwplans/registry | 89 | 21.9 MB | 3.0 MB |
| all | 9,142 | 535.5 MB | 257.9 MB |

By kind: JSON 2,009 files, 229.8 MB (46.4 MB deflated); GeoPackage 68.1 MB; JPEG 62.3 MB; GeoJSON 56.9 MB (8.6 MB);
gzip 44.2 MB. The workflow's `du -sm` counts more (disk blocks), so its number is a little higher than 535.5 MB.

Facts that follow:
- Pages stores the files as they are. Pages compresses only on the wire. Deflated archives would free about 280 MB of the
  950 MB budget with no loss.
- The three GeoPackages (68 MB) are SQLite files. A browser can query them by range (sql.js-httpvfs style), but today no
  page reads them; they serve QGIS users. They could move to the tile host first.
- Many small files: the kgx store has 5,863 files (median a few KB). The UK skeleton has 1,530. Each file costs a request
  and, on Pages, a slot in the artifact (upload time grows with file count).

## 3. Single-file formats read by range

| format | what it holds | index | browser reader | fit for us |
|---|---|---|---|---|
| PMTiles v3 (https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md) | z/x/y tiles (MVT vector, PNG/WebP raster, any bytes) | 127-byte header, root directory in the first 16 KB, leaf directories; tile ids on a Hilbert curve; duplicate tiles stored once | `pmtiles` (BSD-3), about 20 KB; MapLibre protocol | 2D layers and raster. The tile id assumes the Web Mercator z/x/y pyramid; our geodetic quadtree cells (WorldCRS84Quad) fit the z/x/y keys, but tools and viewers will draw them as Mercator. Good for a 2D map (KR3.2) and for the world base as MVT |
| 3D Tiles in a 3TZ archive (https://github.com/erikdahlstrom/3tz-specification) | a whole tileset (tileset.json, glb, subtrees) | a ZIP; the last entry `@3dtilesIndex1@` holds sorted MD5 hashes of the paths with the offsets of their local headers | none in the browser by default; CesiumJS and 3d-tiles-renderer read tilesets by URL. A reader such as ours plus a `fetchData` / URL hook in the tiles renderer can serve a 3TZ | Possible later (KR2.3). A 3D tile is already 50 to 200 KB, so a file per tile costs little in requests. Use `.zip` or a host that does not compress, because Pages compresses an unknown extension such as `.3tz` |
| Cloud Optimized GeoTIFF (https://www.cogeo.org/) | rasters: terrain (DEM), imagery | internal tiles and overviews, IFDs at the start | `geotiff` (MIT; already a dependency here) | terrain for the globe: Copernicus GLO-30/90 is published as COGs on AWS Open Data. Read the overview that fits the view; build quantized-mesh or heightfield tiles in the page or in the build |
| FlatGeobuf (https://flatgeobuf.org/) | vector features (buildings, roads, points) | packed Hilbert R-tree at the start; a bounding-box query reads the index nodes it needs, then the features | `flatgeobuf` (BSD-2), streaming | a good fit for whole-region feature sets (buildings with heights, OSM extracts, the registry as points): one file per layer, bbox queries by range. No levels of detail by itself |
| GeoParquet 1.1 (https://geoparquet.org/) | columnar tables with geometry | row groups with statistics; bbox covering columns | hyparquet (MIT, pure JS, small) or DuckDB-WASM (MIT; a few MB of wasm, too heavy for KR3.1 low-end devices) | analytics and the knowledge graph side: Overture is published this way; "which buildings over 50 m in view" by column. Not a render format |
| ZIP (this prototype) | any files, unchanged | central directory at the end | `docklands/geo/range-archive.js` (this study, no dependencies) | a container for an existing folder layout: the code that reads the folder does not change (shown below with the UK skeleton) |

How each one replaces many small files:
- **Fewer requests.** A view needs N small objects. With files, that is N requests. With an archive, the reader merges
  neighbours into one range: 124 -> 43 in the prototype. The order of the entries decides how well this works. The
  packer orders cells by Morton code, so the cells of one view are near each other. PMTiles (Hilbert order) and
  FlatGeobuf (Hilbert R-tree) do the same by design.
- **HTTP/2 lowers the cost of a request.** Pages, Hugging Face and the CDNs serve HTTP/2, so 100 small requests on one
  connection cost little more than 40. This is why the prototype gains little time.
- **Caching.** A file has its own URL and ETag; the browser and the CDN cache it. A range of an archive is cached badly:
  Chromium serialises parallel range reads of one URL when the HTTP cache is on (the cache lock), and CDNs cache ranges
  in different ways (Fastly and Cloudflare fetch the whole object, or cache slices). Use immutable, versioned archive
  URLs (a content hash or a commit in the name) with a long `max-age` on the host, and keep a reader cache in the page
  (Cache API) for repeat visits.
- **Compression.** Per-entry deflate inside the archive (our ZIP), per-tile gzip inside PMTiles, meshopt inside glb.
  Never depend on the host's gzip with a range.
- **Updates.** One changed tile rewrites the archive (or the PMTiles file). That is good for versioned releases (one
  hash per data set) and bad for data that changes every hour. Keep live data out of archives.

## 4. Prototype: the UK skeleton as one ZIP read by range

Files (all on the worktree branch; nothing is uploaded):
- Packer: https://github.com/danbri/londat/blob/main/cwplans/tools/pack-range-archive.mjs . Deterministic ZIP (fixed
  date, fixed order, deflate level 9), cells in Morton order, `--last manifest.json` puts the manifest just before the
  central directory.
- Reader: https://github.com/danbri/londat/blob/main/docklands/geo/range-archive.js . `openRangeArchive(url)`: one suffix
  range of 256 KB gets the end record, the central directory and the manifest; reads asked for in one tick merge into one
  range when the gap is under 32 KB; deflate through `DecompressionStream('deflate-raw')`; HEAD fallback; sticky
  redirect; `cache: 'no-store'`. `archiveFetchJson(archive, root)` gives the `fetchJson` that `openSkeleton` takes, so
  `docklands/geo/skeleton.js` is unchanged.
- Server: https://github.com/danbri/londat/blob/main/cwplans/tools/range-server.mjs . Node static server with Range,
  HEAD, CORS with Expose-Headers, gzip like Pages (`--gzip`), a delay per answer (`--delay`), HTTP/2 over TLS
  (`--tls`), and request counters (`/__stats`).
- Flag: `?archive=1` (reads `<set>.zip` next to the set's folder, for example `cwplans/docklands/data/uk.zip`) or
  `?archive=<url>`, in https://github.com/danbri/londat/blob/main/docklands/globe/skeleton-layers.js . Off by default.
  No archive is committed, so on the live site the flag falls back to the files with a console warning.
- Tests: `npm test` (https://github.com/danbri/londat/blob/main/cwplans/tools/test/range-archive.test.mjs: Range parsing,
  Morton order, byte-equal entries, one request for one tick of reads, the suffix fallback, the same skeleton answers as
  the files) and the headless check https://github.com/danbri/londat/blob/main/docklands/test/archive-check.mjs .

To run it yourself:

    node cwplans/tools/pack-range-archive.mjs cwplans/docklands/data/uk docklands/test/out/archive/uk.zip --last manifest.json
    node cwplans/tools/range-server.mjs --gzip --port 8215
    # then http://127.0.0.1:8215/docklands/?view=globe&archive=/docklands/test/out/archive/uk.zip
    node docklands/test/archive-check.mjs [--live]

Archive: 1,530 files (log.json and README.md left out), 37,825,841 bytes -> 9,262,655 bytes, central directory 109,141
bytes, 1,497 entries deflated, SHA-256 `ddc3d0b5...a3c2`. Packing takes 2.3 s. The León place (22 files, 5.9 MB, glb
and JSON) packs to 2.9 MB.

Scenario (what the globe asks for on a flight, then a search): the 10 drawn layers at level 3 over the UK, level 6
over south-east England and level 8 over London (19,423, 10,350 and 7,332 features); search "Leeds"; its Wikidata card;
"where am I" at Canary Wharf. Each run in a new browser context (cold cache). Requests and bytes counted at the server
(they include the reader module for the archive runs); time measured in the page. Headless Chromium, software GL; the
timings vary by about 20 % between runs.

| protocol, delay per answer | layout | requests | bytes | time |
|---|---|---|---|---|
| HTTP/1.1, 0 ms | files (gzip on the wire) | 124 | 1,504,241 | 757 ms |
| | archive (gap 32 KB) | 43 | 1,793,595 | 780 ms |
| | archive (gap 4 KB) | 58 | 1,637,592 | 846 ms |
| HTTP/1.1, 40 ms | files | 125 | 1,504,241 | 1,595 to 1,612 ms |
| | archive | 43 | 1,793,595 | 1,305 to 1,341 ms |
| | archive (gap 4 KB) | 58 | 1,637,592 | 1,437 to 1,493 ms |
| | archive with the HTTP cache on | 45 | 1,788,725 | 2,246 to 2,396 ms |
| HTTP/2 (TLS), 0 ms | files | 124 | 1,504,241 | 857 ms |
| | archive | 43 | 1,793,595 | 868 ms |
| HTTP/2 (TLS), 40 ms | files | 125 | 1,504,241 | 1,106 ms |
| | archive | 43 | 1,793,595 | 1,562 ms |
| | archive (gap 4 KB) | 58 | 1,637,592 | 1,560 ms |
| | archive with the HTTP cache on | 43 | 1,793,595 | 2,277 ms |
| live GitHub Pages, HTTP/2, real network (3 runs) | files | 123 | 1,582,616 (transfer) | 955 to 1,506 ms |

The real page: `/docklands/?view=globe&archive=...` loads with no page errors; `findPlaces("Leeds")` answers from the
archive (2 range requests, 280,527 bytes: the tail and one gazetteer file); no file of the `uk/` folder is read.

What the numbers say:
- Requests fall by 65 %. Bytes rise by 9 to 19 % (merged ranges read some entries that the view does not need).
- With HTTP/2 the files are as fast or faster. With HTTP/1.1 (6 connections a host) the archive is faster.
- The steps that are sequential in `skeleton.js` (`whereAmI` reads 8 layers one after another) cost one round trip each
  in both layouts. That code, not the layout, sets the time of a "where am I".
- With the HTTP cache on, the London step takes 0.8 to 0.95 s instead of 0.24 to 0.4 s: the Chromium cache lock. Fixed
  in the reader with `cache: 'no-store'`.

## 5. Pages limits, and how the hourly and 5-minute caches fit

- Pages (documentation): site at most 1 GB; soft bandwidth limit 100 GB a month; deploy time out 10 minutes. Our
  workflow stops at 950 MB. Today 535.5 MB (section 2). A cold load of the Docklands model is about 33 MB of JSON
  (about 8 MB on the wire with gzip), so 100 GB a month is about 10,000 cold visits a month. Not a limit for now.
- The hourly cache (`cwplans/cache/`, workflow `cache-live.yml`) commits to `main`; the pages read `cache/latest.json`
  from raw.githubusercontent.com (5-minute cache, ETag), and the runs and SQLite files are not on Pages. The 5-minute
  feeds (aircraft, ships, METAR) are on the orphan branches `live-cache` and `adsb-cache`, read from
  raw.githubusercontent.com. These are small JSON files that change often. They need freshness, not ranges: keep them
  on raw.githubusercontent.com for now. Risk: raw rate limits for anonymous use. If they bite, the same workflows can
  write the files to the tile host (Hugging Face by a token secret, or R2 by an API token) with `max-age=60`.
- Archives are for data that changes by release (tiles, skeletons, extracts), never for the 5-minute feeds.

## 6. Recommendation: ranked options

| rank | architecture | money | work | risk |
|---|---|---|---|---|
| 1 | **Pages for the app and the small data; tile sets on one range-capable host.** First host: a Hugging Face dataset (for example `danbri/londat-tiles`), URLs pinned to a commit. Later or for production: Cloudflare R2 with a custom domain such as `tiles.foaf.tv` (needs the domain's DNS on Cloudflare). One `tileBase` per region config, so the move between hosts is one line | 0 on Hugging Face; R2 about 0 at our size (under 10 GB and under 10 M reads a month), then 0.015 USD per GB-month and 0.36 USD per million reads; no egress fee | 2 to 4 agent-days: base URL in the region configs; the reader's sticky redirect; upload step in the build tools; register entries; a host check like section 1 in CI | Hugging Face rate limits and terms for serving a web app (check before launch); a second origin (CORS is fine on both); the data on HF is public and must be openly licensed (no `third_party/`, no "review" sources without a decision) |
| 2 | **All on one host** (R2 or S3 + CloudFront, or Cloudflare Pages / Workers static assets): app and data on one origin | R2: as above; S3 + CloudFront: 0 inside the free tier, then about 0.085 USD per GB | 4 to 8 agent-days: a new deploy workflow, a domain, cache rules, the old URLs redirected | an account and a bill; Cloudflare Pages has its own per-file and file-count limits (archives help); the "full URL" rule changes all links |
| 3 | **Stay on Pages only, pack the bulk folders.** Deflated ZIPs or PMTiles/FlatGeobuf for `cwplans/feeds/`, the UK skeleton and the GeoPackages | 0 | 2 to 3 agent-days: packers per folder, readers behind flags | buys about 280 MB; does not hold London 3D Tiles (150 to 250 MB) plus a world base; same-origin only |
| 4 | raw.githubusercontent.com, jsDelivr or release assets as a tile host | 0 | small | **not recommended**: no exposed Content-Range or a refused preflight (raw), suffix ranges refused and compressed-byte ranges (jsDelivr), no CORS (release assets); rate limits and terms |
| for releases | Zenodo (a DOI for each frozen version) or Source Cooperative (public open data) | 0 | 1 day each | slower first byte (0.5 to 0.9 s); good for citation and archiving, not for the live page |

Formats with the hosts: 3D Tiles 1.1 as files (no change, KR2.3); terrain as COG on the host (or quantized-mesh tiles
built from it); 2D world and UK layers as the current files on Pages, or as PMTiles (MVT) when a 2D map (KR3.2) comes;
large feature sets as FlatGeobuf; tables for analysis as GeoParquet; existing folder layouts as ZIP with the prototype
reader where file count or size matters.

## 7. Decisions for the owner

1. Host for tiles: Hugging Face dataset (recommended for now), Cloudflare R2, AWS, or "stay on Pages" (rank 3).
2. Account: which account owns the host (the linked Hugging Face account `danbri`, or a new Cloudflare account), and who
   holds the write token (a GitHub Actions secret for the build workflow).
3. Domain: a stable data URL (for example `https://tiles.foaf.tv/`), so that the host can change without new links.
4. Licence of hosted data: only data with an open licence goes to a public host. ODbL (OSM, adsb.lol) is share-alike:
   publishing OSM-derived tiles on a second host keeps the ODbL obligations (credit, the share-alike database terms);
   the "review" sources (AIS, crawls, Catastro-derived, Bosnia waiver) need your decision one by one.
5. Provenance: each hosted file gets a data-register entry with its host URL, its SHA-256 and the commit that made it,
   so `npm run check` can verify the host against the register.
6. Archives: pack `cwplans/feeds/` and the UK skeleton now (saves about 280 MB on Pages), or wait for the host.
7. Safari check: test range reads on your iPhone (the reader on `?archive=1` once an archive is published).

## 8. Migration, with the site working at each step

1. (Done in this study.) The reader, the packer, the server and the flag; no change for visitors.
2. Add `tileBase` to the region configs and one place in the readers that builds URLs from it. Default: the Pages URL of
   today. No visible change.
3. Owner decisions 1 to 5. Create the host. Copy one data set (the UK skeleton as `uk.zip`, or a place's 3D Tiles) to it
   by a workflow, with its register entry. Test it with `?archive=<host url>` (or a `?tiles=<host>` override). The
   default stays on Pages.
4. Add a CI step that runs `cwplans/tools/probe-range-host.sh` against the host and fails on a missing 206, CORS or
   preflight answer.
5. Switch the default of that one data set to the host. Keep the files on Pages for one release as the fallback (the
   reader falls back to files when the archive does not open).
6. Move the next sets: the GeoPackages, the bulk extracts (`cwplans/feeds/`), the world base, then the London 3D Tiles as
   they are built (KR2.3). Remove each from Pages only after the host has served it for a week with no errors.
7. Keep the hourly and 5-minute caches on raw.githubusercontent.com. Move them only if rate limits bite (section 5).
8. Re-score KR2.5 with the evidence: the host, the data sets served from it, the Pages size after the move.
