---
name: docklands-sky
description: >-
  The sky, the page clock, the weather and the tide on the Docklands 3D page (cwplans/docklands/sky.js, Menu > Sky,
  ?t=2026-10-03T22:30 or ?t=photo): astronomy-engine sun, moon (phase, bright limb), planets, rise/set, twilight;
  Bright Star Catalogue stars and the London star limit; constellation lines; the Milky Way band; CelesTrak satellites
  and the next ISS pass; IAU star names and Messier objects; Open-Meteo clouds placed by the EUMETSAT cloud mask; why
  no live aircraft (ADS-B terms); London City Airport approach paths; EA tide readings by chainage along the Thames,
  faulty readings left out (F21); the photo-time solution for the owner's night photos (23:56 BST, about ±4 min); the
  fetch tool and snapshots (tools/fetch-sky.mjs, docklands/data/sky/). Reach for it before you change sky.js or its
  hooks in index.html, add a sky object or source, refresh the snapshots, solve a photo's time from the sun or moon,
  or explain what the sky, a star, a satellite or the river level shows. Licences and credits are here.
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
- **Aircraft**: none, by licence (OpenSky: written agreement for any live product; adsb.fi: personal non-commercial;
  ADS-B Exchange: commercial; adsb.lol: ODbL; airplanes.live: terms behind a bot challenge). The `cwplans-live-state`
  skill came to the same answer for helicopters. Stub: "London City Airport approach paths" (`approaches()`): OSM
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
- Open: a live EA fetch on request (the WebGL page's rule: no fetch before the visitor asks); the wetness uses one tide
  curve at the model centre.

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

## Not done

Cloud heights and small clouds (the mask has neither); live aircraft (licence); tide predictions for future times (no
open source); the moonlight strength is drawn, not calibrated against a moonlit photo; One Canada Square's 0.9 degree
misfit in the photo fit is explained only as "not the model" (docklands/README.md, second pass).
