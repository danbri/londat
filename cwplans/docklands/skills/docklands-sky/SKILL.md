---
name: docklands-sky
description: >-
  The sky, the page clock, the weather and the tide on the Docklands 3D page (cwplans/docklands/sky.js, Menu > Sky,
  ?t=photo) and the Three.js port: astronomy-engine sun, moon (phase, bright limb), planets, rise/set, twilight; stars;
  constellation lines; the Milky Way; CelesTrak satellites and the ISS; IAU star names and Messier objects; Open-Meteo
  clouds placed by the EUMETSAT cloud mask; aircraft (adsb.lol: near-live 5-minute live-cache branch, recorded 7-day
  cache, live API); the London City METAR (wind, low cloud); London City approach paths; EA tide readings by chainage,
  faulty readings left out (F21); the photo-time solution for the owner's night photos (23:56 BST, ±4 min);
  tools/fetch-sky.mjs and its snapshots. Reach for it before you change sky.js or its hooks, add a sky object or source,
  refresh the snapshots, solve a photo's time from the sun or moon, or explain what the sky, a star, a satellite, an
  aircraft or the river level shows. Licences and credits.
---

# Docklands sky, time, weather and tide

Page: https://danbri.github.io/londat/cwplans/docklands/?t=photo (Menu > Sky).
Code: `cwplans/docklands/sky.js` (one classic script, global `DocklandsSky`). Readable method and numbers:
`docklands/README.md` "Sky, time, weather and tide"
(https://github.com/danbri/londat/blob/main/cwplans/docklands/README.md). The photo solution:
`docklands/reference/night-2026-10-03/README.md`. The rest of the page is the `docklands-3d-page` skill; data policy
is `docklands-data-curation`.

## Libraries and data (licences, credits)

| what | file | licence | credit shown |
|---|---|---|---|
| astronomy-engine 2.1.19 (Don Cross) | `docklands/vendor/astronomy.browser.min.js`, `astronomy.LICENSE` | MIT | Sky panel |
| satellite.js 7.1.0, subset (io, propagation, transforms) bundled with esbuild to a global `satellite` | `docklands/vendor/satellite.min.js`, `satellite.LICENSE` | MIT | Sky panel |
| Yale Bright Star Catalogue 5th ed., CDS V/50, 2,887 stars to V 5.5 | `docklands/data/sky/stars.json` | public domain (NASA ADC); cite | Sky panel |
| constellation lines, d3-celestial (Olaf Frohn) | `docklands/data/sky/constellation-lines.json` | BSD-3-Clause | Sky panel |
| CelesTrak GP elements (OMM): ISS, Tiangong, "visual" group | `docklands/data/sky/sats-2026-10-03.json` | no licence stated; US Government data; credit CelesTrak; at most one download per 2 hours | panel and attribution line |
| Open-Meteo hourly weather | `docklands/data/sky/weather-2026-10-03.json` | CC BY 4.0 ("Weather data by Open-Meteo.com") | panel and attribution line |
| EA flood-monitoring tidal readings (Tower Pier 0007, Charlton 0003, Silvertown 0001) | `docklands/data/sky/tide-2026-10-03.json` | OGL v3.0 | panel and attribution line |
| IAU Catalog of Star Names (WGSN), 324 names joined by HR | `docklands/data/sky/star-names.json` | CC BY (IAU products); names are facts | Sky panel |
| NASA HEASARC MESSIER table, 109 objects (not OpenNGC: CC BY-SA) | `docklands/data/sky/messier.json` | US Government, no copyright | Sky panel |
| EUMETSAT Meteosat cloud mask (CLM) via EUMETView WMS, 23:00 UTC 3 Oct 2026 | `docklands/data/sky/clm-20261003T2300Z.png` | CC BY 4.0 (Core data, EUMETSAT Data Policy arts. 4-6); "Contains modified EUMETSAT Meteosat data 2026" | panel and attribution line |
| London City Airport runway 09/27 thresholds (OSM way 340355375) | `docklands/data/sky/lcy-approach.json` | ODbL (OSM, tracked) | Sky panel |

Refused: d3-celestial's `mw.json` (Milky Way outlines from J. R. Vieira's catalogue, no licence stated), so the band is
computed; PLA tide tables (UKHO predictions, not open), so future tides show "no prediction". All sources are keys in
`data-register.json` `sources` (yale-bsc5, d3-celestial, celestrak, open-meteo, ea-flood-monitoring); the CelesTrak
entry is marked for review. `vendor/` is not registered (the check skips it); `sky.js` is registered as code.

## How the page uses it

- Hooks in `index.html` (keep them small; another agent owns Night lighting): the three `<script>` tags before the main
  script; `drawSky(nm)` calls `DocklandsSky.draw(ctx)` and then restores the state (`aC` enabled, `pr`, depth on, blend
  off); `render()` draws the sky when Night is on or `DocklandsSky.day` is true, and calls `DocklandsSky.after(ctx)` after
  `placeLabels()`; `sunMoon(d)` delegates (the Night note uses it); `__docklands.setTidal(v)` (the live panel's
  `tidalLevel` path, and it moves `NIGHT.wl` so reflections follow) and `__docklands.relight(dir)` (`LIGHT` with
  `LIGHT0` kept, rebuilds plain terrain, greens and buildings); a "Sky" tab and `#paneSky`. `DocklandsSky.init()` runs on
  DOMContentLoaded, after the main script.
- Clock: `S.t` (ms UTC). `fromLondon('2026-10-03T22:30')` converts London wall time with `Intl` (BST/GMT). Live by default
  (every 30 s); a set time is written back to `?t=`. `?t=photo` = `PHOTO.iso`.
- "Light and night follow the clock" (on with `?t=` or after a time change; off when Night is ticked by hand): Night when
  the sun is below −6°; by day the sky is drawn and `relight` follows the sun (elevation clamped to at least 7°, only after
  a 3° change, 0.5 s debounce: a rebuild costs about a second).
- Directions: astronomy-engine gives true azimuths; model −z is grid north. True north comes from the derivative of
  `area.js meta.geo` at the viewpoint (1.54° west of grid north at Greenland Pier). HOR frame of astronomy-engine:
  x north, y west, z up (`horToModel`). `M` (EQJ→model) and `GM` (model→galactic) are built per time by rotating basis
  vectors with `RotateVector`, not by reading `rot[][]` (its index order is easy to get wrong).
- Sky shader, pass 0: the measured night city glow (README Night), a day gradient, twilight towards the sun, haze from
  visibility, the Milky Way band, the sun disc; distant hazy ground below the horizon. Points: stars (refraction and
  airmass extinction in the vertex shader, size and brightness from V, colour from B−V), constellation lines,
  planets, Jupiter's moons, satellites. Pass 1 (premultiplied over): the moon (real size, at least 4 px radius; phase
  from the phase angle, limb from the sun direction across the disc; dark side transparent), then cloud layers at 1, 3.5
  and 8 km (noise thresholded by the layer's cover; far away the alpha tends to the cover), lit orange from below at
  night, white by day, moonlit near the moon.
- Star limit (`nelm()`): 4.2 London (Bortle 8 to 9), 6.3 "dark site"; twilight to 2.2 at −6°, −4.5 in daylight; minus
  moonlight and low visibility. Night style always uses the −18° sky. The Milky Way shows only above limit 4.6.
- Satellites: lit (cylindrical shadow), above the horizon, sun below −6°; magnitude from range. Snapshot used within 7
  days of 4 Oct 2026; otherwise only with "Fetch" (live CelesTrak, cached 2 h in localStorage, as CelesTrak asks).
  `nextIss(from)`: 20 s steps over 3 days, above 10°, sunlit, sun below −6°.
- Weather and tide: snapshot for 3 and 4 October 2026; other dates only with "Fetch" (no request before the visitor
  asks, the live panel's rule). Tide: linear in time between 15-minute readings (no value over a 30-min gap), linear by
  chainage along `data/river.json`'s centreline between the gauges, for every vertex of the river ("Second pass").
- Map lines: `#skyOv` 2D overlay, from the viewpoint to the sun and moon azimuths (solid) and their rise/set azimuths
  (dashed); hidden within 500 m of the viewpoint and in capture mode.

## The photo time

3 October 2026, **23:56 BST (22:56 UTC), about ±4 min**: the moon in `promenade-skyline-railing.jpg` (centre by a circle
through the lit limb and both cusps, not the bright blob), a pinhole camera fitted to four tower tops from the river-wall
eye (One Canada Square horizontally only: its model apex sits about 0.9° above the photo's in both photos), true
azimuth = grid + 1.54°, matched to astronomy-engine. Azimuth is the robust measure; the spread of azimuth times over the
plausible eyes is the error. Checks: limb 227° measured and computed, 46% lit. At that time: 15% low cloud, 14 km
visibility, 87% humidity; Thames −1.20 m OD at Greenland Pier, falling. To solve another photo: same steps; keep the
eye on the wall, measure the moon by limb and cusps, and report the azimuth-time spread.

### Photo time from shadows (day photos, 2026-10-04)

`node cwplans/tools/solve-photo-sun.mjs` (input `docklands/reference/day-2026-10-04/points.json`) solves a day photo
with the sun out of frame: a pinhole camera fitted to tower tops (`towers.json`), the foot of a vertical post and the shadow of
its top back-projected onto a level deck, sun azimuth = shadow bearing + 180° (+ 1.54° grid to true), matched to
astronomy-engine (the vendored browser build, run in a `vm` context; pass it that realm's `Date`, or its `instanceof Date`
check throws). The azimuth does not depend on the assumed camera height; the shadow length does, so altitude needs a known
object height. `pier-wide-skyline.jpg` (Greenland Pier, ultra-wide, fitted horizontal field 99.8°, rms 3.8 px): three bitt
shadows give 150° to 168° true, **about 11:30 BST (10:29 UTC), 11:05 to 12:10 BST**. The error is reading the foot of a post
(hidden by its base plate): 10 px moves the azimuth about 8°. Use long, thin, clearly footed shadows (lamp posts, railings)
when a photo has them; lit and dark faces of towers with known orientation are a check, not a measure (glass reflects).

## Refresh the snapshots

    NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-sky.mjs [stars] [lines] [sats] [weather] [tide] [names] [messier] [clouds [2026-10-03T23:00Z]] [lcy] [--date 2026-10-03]

Method and rules: `pipeline.json` activity `fetch-sky` (area "sky"). CelesTrak keeps no history: fetch satellites within
a day or two of the date. A new date's files need new names in `sky.js` (`SNAP`) and register entries; then run
`node cwplans/tools/check-data-register.mjs --write` (must exit 0). Node fetches through the agent proxy time out
now and then (`UND_ERR_CONNECT_TIMEOUT` while curl works): the tool retries three times.

## Tests

- Serve the repo (`python3 -m http.server 8765 --bind 127.0.0.1` from the repo root); Playwright with the container's
  Chromium and SwiftShader; wait for `window.DocklandsSky`, then `__docklands.renderNow()` and read the canvas.
- Run `?t=photo` (and `&view=rotherhithe`), `?night`, the default page and a day time (`?t=2026-10-03T13:00&view=rotherhithe`)
  at 1600 x 900 DPR 1 and 390 x 844 DPR 3, with the Sky tab open; no page errors or console errors.
- `DocklandsSky.A` has the sun, moon and planets; `DocklandsSky.S` has `wxNow`, `tide`, `satPts`, `drawn` (star limit).
  At `?t=photo`: moon 7.25° up at 57.85°, 46% lit, limb 227°; tide −1.20; star limit about 4.1.
- Look at the moon: Sky > "Look at the moon", Buildings "Hidden" to see the disc; compare the lit side with the photos.
- Time a frame with a readback (`toDataURL`) after `renderNow()`: `gl.finish()` does not wait in headless SwiftShader.
  Measured: 1306 ms with the sky, 1117 without (800 x 600, night photo view).
- In map views the top of the screen is usually below the horizon: judge the sky and clouds from an eye-level view.

## Second pass (2026-10-04): what was added, how, and what failed

- **Tide along the river.** `tideAt` returns `field(x, z)`: linear in chainage (`data/river.json` centreline) between
  every gauge with a reading, flat beyond the end gauges; `__docklands.setTidal(v, field)` gives each vertex of the tidal
  water its own height; reflections use the level under the camera. `cleanGauges` drops a reading whose difference from
  the nearest other gauge departs more than 0.45 m from the median of that difference over 2 h either side (F21: Tower
  Pier, 4 Oct 00:00-01:15 UTC). No EA tidal gauge lies between Tower Pier and Charlton. Gradient in the snapshot: Tower
  Pier minus Charlton +0.36 to -0.53 m; about 0.3 m across the model at most.
- **A low tide was invisible** (fault in the page, found here): the LiDAR ground over the river is the survey's water
  surface (2.8 m OD), so any tide below it hid under the ground and the photo view showed a dark river with no
  reflections. While a tide is set, the ground more than one 20 m cell inside the tidal water sinks to the tide - 0.8 m
  (`terrainSink`, `tidalMask()` in index.html).
- **Moonlight and the moon's glitter path** are in index.html (`MOON`, `moonNow`, `moonGlitter`; the 3D-page skill). They
  read `DocklandsSky.A.moon` (dir, alt, mag) and `A.sun.alt` and `S.wxNow` (cloud).
- **Names on the sky** (`labels()` in `after()`): IAU names when V <= min(star limit - 0.5, 2.5); Messier when V <= star
  limit - 1.5; above 1 degree; not behind buildings (`__docklands.horizon(x, y, z)`, the skyline per half degree); 30
  names at most; no overlaps. `S.labelled` lists what was drawn (tests read it).
- **Clouds**: `clmFor(t)` picks the committed mask within 90 minutes of 23:00 UTC 3 Oct, else (with Fetch) the EUMETView
  slot (`msg_fes:clm`, 15 min, 25 min latency, from 2020-09-01); `clmLoad` turns white pixels into a luminance texture on
  unit 2 and the mean within 60 km; the sky shader's `layer()` adds 0.9 x (mask - mean) to the layer's cover, the mask
  displaced by the wind since its slot. Licence research: EUMETSAT Data Policy (2026-01 PDF) Article 4 puts all SEVIRI/FCI
  Derived Products and all hourly Level 1 data in "Core" (CC BY 4.0, Article 5; redistribution, Article 6; attribution
  string, Article 6.3); sub-hourly Level 1 (the 15 or 10 minute infrared images) is "Recommended" (licensed): use the
  mask, or hourly images only. NASA GIBS has no night geostationary layer over Europe. Parallax and cloud height: not handled.
- **Aircraft**: the WebGL page has no live aircraft. The licence survey (OpenSky: written agreement for any live product;
  adsb.fi: personal non-commercial; ADS-B Exchange: commercial; adsb.lol: ODbL; airplanes.live: terms behind a bot
  challenge) left only adsb.lol, which is share-alike. Owner decision 2026-10-09: the Three.js port uses adsb.lol on
  request (section "Live aircraft in the Three.js port" below). The `cwplans-live-state` skill came to the same survey
  answer for helicopters. Stub: "London City Airport approach paths" (`approaches()`): OSM
  thresholds, 5.5 degree glide path, 15 m crossing height, 12 km, a dot per km.

Lessons: an EA gauge can go bad for hours near low water while its neighbours stay smooth: compare gauges, not one series
with itself (a jump test kept two of the five bad readings). A WMS that answers with CORS is usable live from the page;
check the data policy category (Core or Recommended) per product and per time step, not per provider.

## Tide prediction (2026-10-09)

PLA and UKHO tide predictions are not open, so the project fits its own. `cwplans/tools/fit-tide-harmonics.mjs` reads EA
flood-monitoring 15-minute tidal readings (OGL v3.0; the API keeps about 4 weeks, plus one archive day in seven back one
year: 72 to 76 days a gauge) for Tower Pier 0007, Charlton 0003 and Silvertown 0001, fits 34 constituents by least
squares with nodal corrections (L2 uses the M2 factors) and writes `docklands/data/sky/tide-harmonics.json`
(register entry; pipeline.json activity fit-tide-harmonics). The raw readings are cached and gitignored; their SHA-256
is in the output. The fit stage reads only the cache. Not a kgx graph step, so no Flow activity.
- Fit rms 0.24 to 0.25 m; M2 2.53 m at Tower Pier. Held out on 3-4 Oct (the snapshot in tide-2026-10-03.json): rms 0.19
  to 0.22 m, max 0.37 to 0.51 m, high water within 0.23 m and 5 to 9 min, low water within 0.20 m and 8 to 11 min.
  Held out on the last 48 h: rms 0.25 to 0.26 m, high-water time 23 to 31 min out (the surge is not in a harmonic fit).
- The page (Three.js port): `docklands/tide.js` holds the prediction (the fit tool imports the same file: one copy) and
  the level along the river by chainage between the gauges, as sky.js does; `docklands/layers/tide.js` sets the tidal
  water's height through the water material's positionNode (attributes `tidal`, `tbase`), writes `WU.tideLevel` and
  `WU.tideRate`, sinks the ground in the tidal water to the UKHO bed - 0.4 m (else -5 m), and draws a foreshore mesh:
  edges classed walled (EA defences, 38.4 km, plus 0.6 km bridge piers), revetment (0.5 km), natural (1.3 km); wet mud
  with wetness from the tide curve, shingle, walls with a wet band and weed below high water. The foreshore profiles are
  stated defaults, not surveyed; OSM beach and mud polygons are not in the local data.
- Spring and neap: example 11 Oct 2026, low water 08:55 at -2.43 m OD, high water 14:43 at +3.99 m OD.
- Open: the wetness uses one tide curve at the model centre (the prediction, offset to the level now). The live EA
  fetch is done (below, "Tide surge").

### Tide surge (Three.js port, 2026-10-09)

The harmonic fit has no weather. The surge (wind, pressure, river flow) is the residual reading - prediction: in winter
high water was 0.4 to 0.7 m above the prediction (27 Feb, 9 Jan 2026); on 9 Oct 2026 at 10:30Z the river was 0.65 m
below it. `docklands/tide.js nowcast(S, readings, t)` gives the level of one gauge:
- inside the readings (15-minute steps, no gap over 30 min): the readings, linear (30-minute interpolation rms 0.03 to
  0.04 m);
- elsewhere: prediction + r, r = (a r0 + (1 - a) rc) w from the nearest reading at distance d, a = exp(-d / 2 h),
  w = exp(-d / 8 h); r0 = its residual; rc = the residual at the same tidal phase whole M2 periods back towards the
  readings (most of the residual repeats with the tide: the fit's timing errors), 0 when the readings do not reach;
  none beyond 48 h. `SURGE` holds the constants.
- Tuning (history-check.mjs "nowcast", readings up to a cut-off, then the page's level, rms by lead): EA API 4 weeks
  0.27 -> 0.13 m (0-1 h), 0.27 -> 0.23 (1-3 h), 0.27 -> 0.25 (3-12 h), the same as the prediction beyond 12 h;
  held-out days 0.21 -> 0.08 (0-1 h), 0.24 -> 0.20 (6-12 h); high water in the next 12 h (the page's level near each
  predicted extreme, `extremesNear`, 90 min): height 0.31 -> 0.22 m on held-out days (winter 0.48 -> 0.35, bias
  -0.48 -> -0.35), time 12 -> 8 min (API 4 weeks), 12 -> 10 (held out), 14 -> 15 (winter: no better). Winter 1-3 h is
  0.30 -> 0.31 (a one-day file has no cycle before the cut-off). Extremes found freely on the readings gave a false high
  water at -0.7 m from the faulty F21 readings of 4 Oct: anchor on the predicted extremes.
- What failed: carrying r0 alone (better for 1 h, worse than the prediction at 3 to 6 h: a timing error changes sign at
  every high and low water); the mean residual of the last cycle (the daily means alternate +-0.2 m in Sep-Oct 2026, a
  fit artefact, so it does not persist); a time shift plus offset fitted to the last 6 or 12 h (worse at every lead);
  rc = r0 when the readings are short (worse at 1-3 h on one-day files).
- Sources in the layer (`layers/tide.js`), merged per gauge (`mergeReadings`, readings more than 1.5 m from the
  prediction dropped): the fit file's last 7 days, the 3-4 Oct snapshot, the hourly cache (`cache/latest.json` theme
  `tide`, last 24 h, loaded when the clock is within 3 days of now), and the EA API itself
  (`/flood-monitoring/id/measures/<id>-level-tidal_level-i-15_min-mAOD/readings?startdate&enddate`, OGL v3.0, answers
  with `access-control-allow-origin: *`, keeps about 4 weeks) for the clock's day and the days either side. On by
  default, as the weather (owner, 2026-10-09: "all wind/weather"); `?ea=0` or Menu > Tide box switches it off. The tide
  note says which source: "EA readings", "prediction + 0.15 m measured residual, from an EA reading 2.4 h before,
  fading" or "prediction, no surge". `STATS.tide.now`: `source`, `residualCentre`, `fromReadingH`, `eaError`.
- Check: `node docklands/test/tide-source-check.mjs --base http://127.0.0.1:<port>` (source kinds at 3 h ago, 2 and 6 h
  ahead, 10 days ago, 9 Jan, 3 Oct; with and without `?ea=0`).
- Open: the page does not fetch days older than 4 weeks (the EA daily archive CSV is the whole country, 59 MB for
  9 Jan 2026), so a past winter day shows the prediction without surge; no surge forecast (the EA / Met Office storm
  tide forecast is not open).

## Three.js port clock (2026-10-09)

The port (`docklands/`) has its own clock: `main.js setClock(t)` (Menu > Clock, `?t=`, share hash `t=`) calls
`sky3.js Sky3.setTime` (sun and moon from the same astronomy-engine build, SkyMesh, stars, moon disc, light rig); the tide
layer, the wind layer and the weather layer follow `ctx.clock` in their frame hooks (one frame late: their data are
asynchronous). Check: `node docklands/test/clock-check.mjs --base http://127.0.0.1:8251 [--live] [--render]` (server on the
repository root). It compares the page with references that do not use the page's code: sun and moon by Meeus
(ch. 25, 47 truncated, 48 for the phase; topocentric parallax in altitude), published facts (timeanddate London sunrise
21 Jun 2026 04:43 BST at 49 degrees, sunset 21 Dec 2025 15:53 GMT at 231 degrees, full moon 26 Sep 2026 16:49 UTC, new moon
10 Oct 2026 15:50 UTC, the photo moon above), EA readings (snapshot; `--live`: 4 weeks from the API, cached 6 h in the
temporary directory) and Open-Meteo (snapshot; `--live`: archive API, ERA5); prints a table, exits 1 beyond the stated
tolerances. `--render` checks the shadow of a 300 m test pole at Mudchute (plan view, bearing by a 2-degree histogram of
the darker pixels) and the moon disc in a 4-degree view aimed at the computed moon.
- Measured (2026-10-09, after the fixes): sun azimuth and altitude within 0.01 degree of Meeus; moon within 0.02 degree,
  lit fraction within 0.005; photo moon 7.26 degrees up at 57.86, 46%, limb 227.2 (published 7.25, 57.85, 46%, 227);
  sunrise and sunset altitudes -0.19 and -0.20 degrees at the published minutes; light direction 0.00 degree from the
  computed sun; night begins at civil dusk to the minute; London time to UTC right on both switch days.
- Faults found and fixed in `sky3.js`: (1) directions used grid north as true north: the sun light, the SkyMesh sun and
  the stars were 1.55 degrees out (true north is 1.55 degrees west of grid north at the observer; now from the
  derivatives of `area.js meta.geo`, as sky.js `setObserver`); (2) night (`sun < -6`) used the apparent altitude, and
  astronomy-engine's `'normal'` refraction adds about 0.64 degrees even far below the horizon, so night began 4 to 6
  minutes late (3.8 min on 3 Oct, 6.2 min at midsummer); now `altGeo` (no refraction); (3) in the repeated hour when the
  clocks go back (25 Oct 2026 01:00 to 01:59) `fromLondon` gave the second (GMT) instant, so 00:00 to 00:59 UTC could not
  be set; now the first (BST); (4) no moon was drawn: now a disc with phase and bright limb (lit by the sun direction in
  the disc's frame, additive, real size but at least 0.3 degree radius, earthshine by night, hidden by cloud).
- Weather (`docklands/layers/weather.js`, new): snapshot 3-4 Oct, the hourly cache within 90 min of its hour (total cloud
  only), or Open-Meteo on request (Menu box or `?weather=meteo`; forecast API back 85 days, archive before). Sets
  `Sky3.setWeather`: SkyMesh cloud coverage, sun dimmed by the layers (stated factors: low passes 15%, mid 30%, high 70%),
  stars, moon and moonlight hidden by cloud, the night background lit by the city under cloud, haze `scene.fogNode`
  1 - exp(-3.912 d / visibility) at most 0.85, rain or snow streaks round the camera slanted by the wind. Without data:
  a fair sky, and the menu says so.
- Open: the wind layer (`layers/wind.js`) has data only for 3-4 Oct, the hour of the cache, or with its own Open-Meteo box;
  other times show a default 4 m/s from 240 degrees (the check marks these WARN). The weather layer exposes `ctx.weather`
  (`now`, `evaluate`); one fetch could serve both. Wet ground needs the ground material (`materials.js`). The tide
  prediction has no surge: over 4 weeks of EA readings (12 Sep to 9 Oct 2026, in the fit's period) the worst day
  rms is 0.49 m (neap, 20 Sep), the worst high or low water 45 min and 0.49 m out, the worst single reading 0.99 m; the
  check's tide tolerances (rms 0.5 m, 60 min, 0.6 m) are those of a surge-free fit, not of a forecast. Inside the fit
  file's last 7 days and on 3-4 Oct the page shows the readings themselves. The EA's Tower Pier readings of 4 Oct
  00:00-01:30 UTC are F21 (faulty) and the check leaves them out.
- The check ran clean on 2026-10-09 (263 rows, 0 failures, 16 warnings: the wind default at 10 times, the Open-Meteo
  snapshot's cloud 37% above ERA5 at 22:30 on 3 Oct: two models). Open-Meteo answered HTTP 429 to the browser once that
  day (a shared address): the weather layer then says "did not answer" and draws a fair sky.

## Live aircraft in the Three.js port (adsb.lol, 2026-10-09)

Owner decision, 2026-10-09 (answer to "Which ADS-B source may the port use?"): "adsb.lol (ODbL) (Recommended)": "Free
live API, open data under ODbL, like OSM. Fetched in the browser only after a tap, shown with the ODbL credit, recorded in
the data register as 'review', nothing committed. Simulated traffic stays as the fallback." Code: `docklands/planes-live.js`
(request, back-off, tracks, type table, heights, privacy rule) and `docklands/layers/planes.js` (drawing, card, credit,
menu). Register: source `adsb-lol` in `cwplans/data-register.json` (with "review"). The WebGL page has none.

- **API** (read 2026-10-09 from https://api.adsb.lol/docs and its OpenAPI document `/api/openapi.json`, version 0.0.2):
  `GET /v2/point/{lat}/{lon}/{radius}` (same as `/v2/lat/{lat}/lon/{lon}/dist/{radius}`; radius in nm, up to 250), also
  `/v2/closest`, `/v2/hex`, `/v2/callsign`, `/v2/reg`, `/v2/type`, `/v2/sqk`, `/v2/mil`, `/v2/ladd`, `/v2/pia`. Answer:
  `{ac: [...], msg, now (ms), total, ctime, ptime}`, readsb fields (hex, flight, r, t, category, alt_baro (ft or
  "ground"), alt_geom, gs, track, track_rate, roll, baro_rate, geom_rate, squawk, nav_qnh, lat, lon, seen_pos, mlat,
  dbFlags ...). The page asks `/v2/point/51.505/-0.02/25` (the model box and the London City approaches): 67 to 79
  aircraft, 38 kB, in the morning of 9 Oct 2026. No API key. Terms in the OpenAPI text: "You can use the API for free. In
  the future, you will require an API key which you can get by feeding to adsb.lol. If you want to use the API for
  production purposes, please contact me". The source (github.com/adsblol/api, `app.py`): "Rate limits are dynamic based
  on the environment load. If you get 4xx errors, you are doing something wrong." No numbers are published.
- **Licence**: OpenAPI `info.license`: "Open Data Commons Open Database License (ODbL) v1.0",
  https://opendatacommons.org/licenses/odbl/1-0/ ; text: "The license for the API as well as all data ADSB.lol makes public
  is ODbL. This is the same license OpenStreetMap uses." https://www.adsb.lol/docs/open-data/api/ : "API License: ODbL
  1.0". No attribution string is given; the page uses "Aircraft: © adsb.lol contributors, ODbL" with links to adsb.lol and
  the licence (corner credit while live aircraft show, the menu note, every card). Feeders give their data as CC0
  (https://www.adsb.lol/privacy-license/).
- **CORS: the fault.** `api.adsb.lol` sends no `Access-Control-Allow-Origin` header (checked 2026-10-09 with curl and
  several `Origin` values: none; OPTIONS answers 405; the FastAPI source has no CORS middleware, only one OPTIONS handler
  for `/0/planespotters_net/hex/{hex}`). Chromium through the container proxy: "blocked by CORS policy: No
  'Access-Control-Allow-Origin' header is present". The proxy passes the header for other hosts (api.github.com). So a
  browser on https://danbri.github.io/ cannot read the answer: on the live site the box shows "adsb.lol did not answer:
  ... no CORS header", backs off and the simulation stays. Ways out (owner to decide): adsb.lol adds CORS (ask them:
  info at adsb.lol, or the API repository); or a small relay that adds the header (a Cloudflare Worker or similar);
  `?adsb=<base URL>` points the page at a relay with the same `/v2/point` path (https or this site only). Not done: a
  public CORS proxy (a third party would see every request).
- **When it asks**: only after the visitor ticks "Live aircraft (adsb.lol, ODbL)" (Layers > Simulated); nothing before
  (the test counts the requests: 0 before the tap). Then every 8 s while the layer is on, the tab is visible and the page
  clock is within 5 minutes of the real time; paused otherwise. Errors: 15 s, doubled to 120 s; HTTP 429: 60 s at least;
  10 s timeout. With no good answer for 60 s, or another clock, the near-live 5-minute cache shows (section "Near-live aircraft" below), then the recorded aircraft of the 7-day cache, else the simulation (labelled "simulated").
- **Position**: `geo(lon, lat)` (`A.meta.geo`, the quadratic fit of `build-docklands.mjs` `fitGeo()` over
  0.095 W-0.015 E, 51.474-51.522 N) used outside its fit box. Error against PROJ ETRS89 -> OSGB36 with OSTN15
  (EPSG:4258 -> 27700, `uk_os_OSTN15_NTv2_OSGBtoETRS.tif`): 0.01 m at the centre, 0.47 m at 10 km, 1.2 m at 20 km, 2.5 m
  at 30 km, 5.8 m at 46 km (25 nm), worst of 16 bearings. Check, London City threshold 27 (AIP 51°30'17.58"N
  0°03'57.59"E): page (5933.24, -161.92), PROJ (5933.21, -161.97); threshold 09: (4425.17, -195.93) and (4425.16,
  -195.97). The OSM runway way ends (`lcy-approach.json`) are 70 m and 100 m inside the AIP thresholds along the runway
  (osm 27 (5862.7, -164.1), osm 09 (4525.0, -193.7)): the way ends are not the thresholds.
- **Height** (m OD): `alt_geom` is GNSS height above the WGS84 ellipsoid (readsb), so OD = alt_geom x 0.3048 - N, N from
  a quadratic fit to OSGM15 (PROJ `uk_os_OSGM15_GB.tif`, EPSG:4937 -> EPSG:7405, 14 x 14 grid over the 25 nm circle, max
  error 0.10 m): 45.41 m at 51.505 N 0.02 W, 45.32 m at London City, 45.0 to 46.0 m over the circle. About 35 % of the
  aircraft send no alt_geom: then pressure altitude + a QNH correction = the median of (GNSS height OD - pressure
  altitude) of the aircraft below 10,000 ft in the same answer (51 ft from 25 aircraft on 9 Oct, about QNH 1015), else
  (median nav_qnh - 1013.25) x 27.7 ft/hPa. Some aircraft may report GNSS height above mean sea level, not the ellipsoid:
  then they are drawn 45 m low (not detected). "ground" -> the model ground, or 6 m outside the model.
- **Between polls**: dead reckoning from the report time (receipt - seen_pos) with gs, track and track_rate (a constant
  turn, capped at 0.1 rad/s) and the vertical rate, for at most 20 s; a new report blends in over 1.5 s (no blend for a
  jump over 2 km); an aircraft with no report for 60 s goes. Trails: one point per report, the last 2 minutes, one
  LineSegments (orange, 0.8).
- **Models by `t`** (ICAO type designator): E-jets, A220, ATR 42/72, Dash 8, A320 family, 737, 757, 767, 787, A330, A350,
  777, A340, 747, A380, business jets, turboprops, light aircraft and helicopters (EC35, EC45, A169, A139, AS65, A109,
  S92, H47, R44 ...) to the models of `planes-models.js` with the type's size; unknown `t` by ADS-B category (A1 light,
  A2 small, A3 large, A4 B757, A5 heavy, A7 rotorcraft); category C (ground vehicles, obstacles) and type TWR are not
  drawn. The card names the real type and the model drawn.
- **Privacy rule**: callsign, registration and squawk are shown only for a flight under an operator's ICAO callsign
  (three letters and a digit, e.g. BAW26E) that is not on LADD or PIA (dbFlags bits 8 and 4) and has an ICAO address (no
  "~"). Others (private aircraft flying under their registration, which leads to the owner in the CAA G-INFO register;
  LADD or PIA; no callsign) are shown by type only. The owner/operator field is never shown. 9 Oct sample: a LADD
  aircraft (dbFlags 8) and a Cessna 152 under its registration were both type only.
- **Tests** (2026-10-09, WebGL 2 and WebGPU in software): `node docklands/test/load.mjs --query 'view=cw&layers=planes'`
  (no errors); a Playwright run that ticks the box with `api.adsb.lol` answered by recorded answers (Playwright
  `page.route`, CORS header added, `now` set to the time of the request): 72 aircraft drawn, 58 with trails after three
  polls at 8 s, both cards, the credit, then the clock set 3 h back: polling paused and the simulation back. The same run
  against the real API: the CORS error, the note, the back-off and the simulation, no page errors.

### Recorded aircraft: the 7-day cache (2026-10-09)

Owner, 2026-10-09, asked "How should the page reach adsb.lol?": "Eventually find or build a proxy. For today build a cache
of last 7 days for our areas, and show equivalent data for the matching time and day of week." That answer approves a
committed cache (the earlier decision said "nothing committed"); CLAUDE.md, "Data policy", records both.

- **Source**: the adsb.lol daily history, GitHub releases of `adsblol/globe_history_<year>` (one release per pod and UTC
  day; we use `v<YYYY.MM.DD>-planes-readsb-prod-0`; there are also `-staging-0` and `-mlatonly-0`). Assets: one tar split
  into 2,000,000,000-byte parts `.tar.aa`, `.tar.ab`, `.tar.ac` (2026-10-08: 4.19 GB). Contents: `heatmap/NN.bin.ttf` (48
  half-hour heatmaps, about 1 GB), `acas/`, `README.txt`, `LICENSE-ODbL.txt`, `LICENSE-cc0.txt` and about 84,000
  `traces/<last 2 hex>/trace_full_<hex>.json` (gzip inside, despite the name; 3.15 GB). Release README: "This database is
  made available under the Open Database License"; feeders waive their rights under CC0. The release of day D is uploaded
  early on D+1 (2026-10-08 files dated 03:24 UTC on 2026-10-09). A trace: `{icao, r, t, dbFlags, desc, ownOp, year,
  timestamp (UTC midnight), trace: [[dt s, lat, lon, alt_baro ft | "ground" | null, gs kt, track, flags, vertical rate,
  details {flight, category, alt_geom, squawk, nav_qnh ...} | null, source, alt_geom, geom_rate, ias, roll], ...]}`; flags
  bit 1 = new leg, bit 3 = the altitude column is geometric. Chosen over polling `/v2/point` from an Action because the
  traces are the full tracks at their native rate (one point a second to a few seconds at low level) and need no
  schedule every few minutes. The api.github.com listing of the releases is blocked in this container (proxy policy), but
  `git ls-remote --tags` and the `releases/download/` URLs work.
- **Tool**: `cwplans/tools/fetch-adsb-cache.mjs` streams the parts (minimal tar reader, nothing on disk), gunzips each
  trace, skips it unless the text has ",51.", parses it, keeps the points within 25 nm of 51.505 N 0.02 W, and splits legs
  (new-leg flag, a gap over 10 min, a callsign change). Height: alt_geom (ft above the WGS84 ellipsoid) when present, else
  alt_baro + the hour's median (alt_geom - alt_baro) of the area's aircraft below 10,000 ft (`corr_ft`, 400 ft at 17 UTC
  on 2026-10-08: about 150 ft geoid plus high QNH); "ground" kept as a flag. Thinning: at most one point a second, one a
  minute above 15,000 ft. One run per day: about 3.5 to 4 min (CPU: gunzip and JSON.parse of about 84,000 traces; the
  download itself runs at about 95 MB/s here). FAULT met: with the parse slower than the download, the throttled
  connection was cut after a few minutes ("terminated"); the tool now asks the part again from the byte it reached
  (HTTP Range, 206) and goes on.
- **Privacy**: `identified()` of `planes-live.js` applied in the tool: a callsign only for an operator ICAO callsign
  without LADD/PIA and with an ICAO address; every other leg gets an anonymous key (`x<n>`, per day) and keeps only
  type and category: no ICAO address for those (it leads to the registration), and no registration, owner or squawk for
  any leg.
- **Store**: orphan branch `adsb-cache` of danbri/londat, one commit, force-pushed by each run (git history does not
  grow): `index.json` (days held, counts, licence), `README.md` (ODbL notice), `adsb/<date>/day.json`,
  `adsb/<date>/<HH>.json.gz` (UTC hour: legs overlapping the hour with 2 min before for trails and one point after;
  `{v, date, hour, t0, corr_ft, cols, legs: [{k, c?, ty, cat, p}]}`, `p` = delta-coded integers [t s from t0, lat 1e-5,
  lon 1e-5, alt / 25 ft, q (0 GNSS, 1 pressure + corr_ft, 2 ground), gs kt, track deg]). Sizes (backfill of 2026-10-09, days 2026-10-02 to 2026-10-08): 2,041 to 2,384 aircraft in the area a day, 6,690 to 7,832 legs (1,480 to 2,085 by type only), 820,000 to 965,000 points, 4.8 to 5.7 MB a day in 24 hour files (22 kB at 03 UTC to 418 kB at 14 UTC), 35.7 MB for 7 days. The page reads
  https://raw.githubusercontent.com/danbri/londat/adsb-cache/ (Access-Control-Allow-Origin: *, cached about 5 min); the
  Pages site is not used (no deploy needed, nothing towards its 1 GB). The commit is built without touching main's
  working tree or index: `GIT_INDEX_FILE=<tmp> git --work-tree <out> add -A`, `git write-tree`, `git commit-tree`, `git
  push -f origin <commit>:refs/heads/adsb-cache`; with an unchanged tree nothing is pushed.
- **Workflow**: `.github/workflows/adsb-cache.yml`, 05:41 and 13:41 UTC daily and on request; `--restore` first copies
  the branch (`git fetch --depth=1 origin adsb-cache`, `git archive FETCH_HEAD`), so only the new day is fetched; the
  default GITHUB_TOKEN (contents: write) pushes. Local run (backfill of 2026-10-09):
  `NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-adsb-cache.mjs --out /tmp/adsb-cache --push`.
- **Page** (`planes-live.js` `createRecorded`, `layers/planes.js`): with the Aircraft layer on (it is on by default) and
  "Recorded aircraft" ticked (default; `?adsbrec=0` off), the page reads `index.json`, then the hour file that the clock
  maps to. Choice: index and hour files are read when the layer is on, without a tap, because they come from GitHub
  (the host that already serves `cache/latest.json`), never from adsb.lol; the live API stays behind its tick. Mapping:
  the clock's own London date when it is held, else the newest held day with the same London weekday, at the same London
  time (the DST offsets of both dates allowed for); a clock before or after the held week maps by whole weeks. Drawing:
  straight lines in time between the recorded points (no draw across a gap over 11 min), heading from the track, bank
  from the turn rate, height in m OD (alt x 0.3048 - geoid OSGM15), trails of the last 2 min, labels `REC <callsign or
  type> <ft>`, cards "recorded". Order: live (ticked, clock now, answering) > recorded > simulated (cache unreadable, no
  matching day, an hour file failed, or unticked); while a file loads nothing is drawn. Corner label: "Recorded Thu
  2026-10-08 08:30 London, same weekday and time · Aircraft: © adsb.lol contributors, ODbL" (no "same weekday" when the
  date itself is held); the menu note says RECORDED, the day used and the page clock. `?adsbcache=<base>` reads another
  copy (https or this site). Test hook: `__docklands3.layers.planes.api.recorded` and `ctx.stats.planes.rec*`.
- **Tests** (2026-10-09, Playwright, own server, `layers=planes`): `t=2026-10-08T18:00` on WebGL 2 against the real
  branch on raw.githubusercontent.com: index and `2026-10-08/17.json.gz` read (both with `Access-Control-Allow-Origin: *`),
  72 aircraft, exact day, 55 of 69 moved within about 10 s (the rest on the ground at Heathrow), credit and note right, no
  page errors. `t=2026-10-09T10:00 --webgpu` (WebGPU backend): Friday 2026-10-02 10:00 "same weekday and time", 103
  aircraft, 80 of 101 moved. Close-ups on both backends: the model, the REC label and the trail; the card. With
  `planes=0`: no request to the cache. `docklands/test/load.mjs --query 'view=cw&layers=planes'`: ok at both sizes.
  The tool: backfill of 7 days (about 4 min a day), `--push` twice (the second: "already holds this tree").

### Near-live aircraft, ships and METAR: the 5-minute live-cache (2026-10-09)

Owner, 2026-10-09, after running the adsb-cache workflow by hand: "Couldn't we crontab it for every 5 mins? And default to
live for the rest?"; then "We want the webapp to always have fresh air and boat data plus recent history" and "Basically we
want all the data we can". CLAUDE.md, "Data policy", records the approval.

- **Tool**: `cwplans/tools/fetch-live-cache.mjs`, one run = one GET each of adsb.lol `/v2/point/51.505/-0.02/25`, Open Waters
  `/v1/vessels?bbox=51.474,-0.095,51.528,0.085` and aviationweather.gov `/api/data/metar?ids=EGLC&format=json&hours=24`
  (User-Agent `londat-live-cache/1 (https://github.com/danbri/londat; ...)`). Buffers: aircraft 60 min, ships 2 h (plus the
  newest position of every vessel Open Waters still lists: moored ones up to 7 days), METAR 24 h. A failed source keeps its
  previous file. `--restore` reads the branch (`git fetch --depth=1 origin live-cache`, `git show FETCH_HEAD:<file>`);
  `--push` = temporary index, `write-tree`, `commit-tree`, `push -f` (as fetch-adsb-cache). `--from-adsb/--from-ais/
  --from-metar FILE` for tests. Register: branch `live-cache`, sources `adsb-lol`, `openwaters-ais` (+ AISHub, aisstream,
  volunteer CC0), `awc-metar`; pipeline.json activity `fetch-live-cache`.
- **aircraft.json**: `{v, generated, now (ms, newest answer), t0 (s), snaps [{t, n, total, corr_ft}], next_anon, ac: [{k,
  c?, ty, cat, P: [[t s from t0, lat 1e-5, lon 1e-5, alt / 25 ft above WGS84, q 0 GNSS 1 pressure+corr 2 ground, gs kt,
  track, vertical rate fpm (64), turn rate 0.01 deg/s]]}]}`. Report time = answer `now` - `seen_pos`; `seen_pos` > 60 s,
  category C and type TWR/GND/SERV dropped. Privacy: `identified()` as before; identified aircraft are keyed by ICAO
  address; every other aircraft gets `x<n>` and is joined to its earlier anonymous reports only by type and dead-reckoned
  position (1.5 km + 30 % of the distance flown, nearest first, within 20 min), never by address (a salted hash of the
  address would need a secret: 24 bits are brute-forced at once). Measured 2026-10-09 18:06-18:29 UTC: 66 to 69 aircraft an
  answer, 61 to 63 kept, 3 to 5 by type only; 12 kB after 3 answers, 20 kB after 5; about 50 kB expected for 12.
- **ships.json**: `{now, t0, snaps [{t, features, kept, dropped_licence, private_not_listed, no_position}], vessels:
  [{mmsi, kind, name, callsign, imo, flag, ship_type, class, length, beam, destination, source, licence, licence_class,
  attribution, P: [[t s from t0 (AIS "seen"), lat 1e-5, lon 1e-5, sog 0.1 kn, cog, heading, nav_status]]}]}`; a position is
  added when the vessel moved or 30 min passed. Measured: 105 features, 83 to 84 kept, 22 small private craft counted;
  34 to 38 kB. FAULT met: the first version dropped every vessel whose last report was over 2 h old (38 of 83 left): Open
  Waters lists moored vessels up to 7 days; now the newest position stays.
- **metar.json**: `{station, obs: [{t s, report, type, raw, wdir (deg true or "VRB"), wspd_kt, wgst_kt, vis_m (from the
  report text: 9999 and CAVOK = 10000; the API's visib is statute miles, "6+"), clouds [{cover, base_ft}], temp_c, dewp_c,
  qnh_hpa, flt_cat}]}`; 48 reports a day (two an hour), 15 kB. Terms (https://aviationweather.gov/data/api/): "keep requests
  limited in scope and frequency", 100 requests a minute; NWS: "public domain, unless specifically noted otherwise". The
  reports come from the Met Office through the WMO: review before anything leaves the prototyping phase.
- **CORS** (checked 2026-10-09 with `Origin: https://danbri.github.io`): api.adsb.lol none, aviationweather.gov none,
  ais.openwaters.io `*`, raw.githubusercontent.com `*`. So the browser reads the branch, and Open Waters itself first.
- **raw.githubusercontent.com caching, measured**: `cache-control: max-age=300`; after a push at 18:08:41 UTC the new file
  was served at 18:13:40 (5 min); a query string (`?m=<minute>`, `?m=<seconds>`) gave the same cached copy (`x-cache: HIT`,
  same ETag): the CDN ignores the query, so the page does not add one. It reads with `cache: 'no-cache'` (the browser
  revalidates by ETag instead of keeping its own copy 5 min). So the page's data are 5 to 12 minutes old (5 min CDN, up to
  5 min to the next run, plus any delay of the schedule).
- **Workflow**: `.github/workflows/live-cache.yml`, cron `*/5 * * * *` and workflow_dispatch, contents: write, concurrency
  `live-cache` with cancel-in-progress, 4 min timeout, Node 22, GITHUB_TOKEN only. GitHub may delay or skip 5-minute
  schedules under load. The branch `adsb-live` (first plan) was never pushed.
- **Page, aircraft** (`planes-live.js` `createNearLive`, `NL`; `layers/planes.js`): order: tapped live (browser API or
  `?adsb=` relay) > near-live (default) > recorded day > simulation. Near-live stands when the file is under 20 min old
  (`NL.fresh`) and the page clock is between the oldest answer (- 1 min) and the newest answer + 12 min (`NL.reckon` 6 min
  + `NL.fade` 6 min); read when the layer is on and the clock is within 70 min of now, again every 60 s. Between two
  reports of an aircraft: straight in time (no line across a gap over 21 min); after the last report: ground speed and
  track (turn rate for at most 30 s, vertical rate for at most 120 s, `NL.climb`: without that cap a climbing A320 reached
  the 45,000 ft clamp after 11 min) for 6 min, then the label fades over 6 min and the aircraft goes. Trails: the reports
  of the last 20 min plus the drawn position. While the first read is pending nothing is drawn (no flash of the recorded
  day). Corner label "Live (adsb.lol, 3 min ago) · Aircraft: © adsb.lol contributors, ODbL", or "Last hour (adsb.lol, 18:42
  London)" for a clock more than 2 min before the newest answer. Labels `<callsign or type> <ft>` (no prefix), card
  "near-live". `?adsblive=0` off (menu "Near-live aircraft"), `?adsbrec=0` recorded off, `?livecache=<base>` another copy.
  Hooks: `layers.planes.api.nearLive`, `STATS.planes.near`, `near_state`, `near_age_s`; flights `proc: 'near-live'`. The
  aircraft-on-reported-position rule (no wheel lift in the air, `liftOf`) is kept: near-live goes through the `F.rec` path.
- **Tests** (2026-10-09, `node docklands/test/live-cache-check.mjs [--webgpu] [--only planes|ships|metar]`, own server,
  `?layers=` limits the page): no `?t=`: "Live (adsb.lol, 2 min ago)", 61 aircraft, 61 trail segments (WebGL 2) and "6 min
  ago", 61 (WebGPU); `t=` yesterday: "Recorded Thu 2026-10-08 18:29 London", 70 aircraft; `adsblive=0&adsbrec=0`: 6 to 7
  simulated, no credit. No request to api.adsb.lol in any case. `load.mjs --query 'layers=planes,water,tide&weather=0'`:
  ok on WebGL 2 and WebGPU at both sizes.
- **Open**: the data are 5 to 12 min old, so near now most aircraft are dead-reckoned (straight lines; a landing aircraft
  overshoots the runway until it fades); a relay with CORS would give seconds (the owner's "eventually find or build a
  proxy"); the GitHub contents API is fresh but allows 60 requests an hour without sign-in (not used); fading is the
  label only (the aircraft materials are shared, so the model does not fade).

### METAR (London City Airport) on the wind and weather layers (2026-10-09)

Owner, 2026-10-09: "Yes" (use the real airport observation for the wind). `layers/wind.js` `getMetar()` (shared with
`layers/weather.js`) reads `metar.json` of the live-cache branch (again when 5 min old). Wind: the report nearest the clock
within 45 min, after `?wind=` and before every Open-Meteo source: speed and gust in knots x 0.514444, direction true
(METAR), then `GRID_CONV` to the grid as before; "VRB" takes the direction of the nearest report that has one. Note
"London City Airport METAR 17:20 (NOAA AWC, public domain)". Weather: the same report sets low cover (bases below
6,500 ft) and mid cover (6,500 to 20,000 ft) from FEW 1.5/8, SCT 3.5/8, BKN 6/8, OVC 8/8 (NSC/NCD/CLR/SKC/CAVOK: 0), total
cover at least the largest layer, visibility (10 km or more: the Open-Meteo value when larger), RA/DZ/SN when Open-Meteo
has no rain, temperature and humidity from the dew point; the source reads "... + London City Airport METAR 17:20 (cloud
layers, visibility ...)". With no Open-Meteo hour the METAR alone gives the weather. `?metar=0` off; menu box "Wind from
the London City Airport METAR". Test (live-cache-check `--only metar`): `t=` 10 min after a METAR: wind 7.2 m/s from 240
(METAR 24014KT), low cover 44 % (SCT022 SCT034), visibility 10 km; `t=2026-09-20T12:00`: no METAR source. Not done: cloud
types (CB, TCU) are not drawn; "///" layers from an AUTO station count by their cover only.

## Not done

Cloud heights and small clouds (the mask has neither); live aircraft on the WebGL page (licence; the Three.js port has
them on request from adsb.lol, but adsb.lol sends no CORS header, see above); tide predictions for future times (no
open source); the moonlight strength is drawn, not calibrated against a moonlit photo; One Canada Square's 0.9 degree
misfit in the photo fit is explained only as "not the model" (docklands/README.md, second pass).
