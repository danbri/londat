# Audit of the Three.js port: time, roofs, piers, wildlife, trees, reveal sheet (2026-10-09)

This audit checks six items of the owner's goal list for the Three.js port
(https://danbri.github.io/londat/docklands/) against recorded evidence. The WebGL page that it ports is
https://danbri.github.io/londat/cwplans/docklands/ .

All measurements were made on 2026-10-09 in the cloud container: headless Chromium 141 (Playwright 1.56.1), WebGL 2 on
SwiftShader, WebGPU on Dawn's SwiftShader adapter where the text says so. These are software renderers. The numbers are
not phone or GPU numbers.

The test scripts are in https://github.com/danbri/londat/tree/main/docklands/test . Each script starts with a header that
gives the command. Run each script from the repository root, with `python3 -m http.server <port> --bind 127.0.0.1` running
in that root. The scripts write their full output to `docklands/test/out/audit/`, which git ignores. A few small JPEGs and
the history results are kept in https://github.com/danbri/londat/tree/main/docklands/test/audit .

| item | verdict | key numbers |
|---|---|---|
| 1 time vs historical data | PARTIAL | sun and moon within 0.02°; tide: EA readings where they cover the clock, else prediction + a fading measured residual (rms 0.27 → 0.13 m in the first hour, high water height 0.31 → 0.22 m on held-out days); prediction alone 0.25 m rms on held-out days; wind −0.8 m/s bias and +10° direction bias in the data against London City Airport METARs (grid north fixed); low cloud class agrees 70 % of hours |
| 2 roof shapes ported | PASS | 22,654 roof prisms in each page, same shapes for each of the 8 kinds; screenshots match |
| 3 piers, berths, boats | PASS | 8 of 8 TfL river-bus piers in the box; 275 piers and pontoons; HMS Belfast and 5 other vessels; the Woolwich Ferry is 3.2 km outside the box; Blackwall Pier is now a fixed masonry pier (Grade II), not a pontoon |
| 4 birds and foxes from data | PASS (after a fix) | 21 species, 9,974 open records (NBN Atlas 8,405, GBIF 1,569); 34 of 34 foxes seen were on wood or park cells |
| 5 trees: species and seasons | PASS | taxon from the source for 75.0 % of 81,852 trees (species 59.1 %); STATS.trees: in January evergreens 1.0 in leaf, deciduous 0.0; bloom peaks day 101 (cherry) to 125 (hawthorn); autumn colour half-way from day 261 (horse chestnut) to 303 (oak); green share of tree pixels 7 % (Jan), 44 % (Apr), 94 % (Jul), 48 % (Oct) |
| 6 reveal sheet | PASS | falls from 951 m, lands at 1.2 s, squash and stretch from −3.0 % to +1.9 %, bounce, dissolve, done by 2.9 s; the same on WebGL 2 and WebGPU |

Faults that this audit fixed are in "Faults fixed". Faults that stay open are in "Faults left open".

## 1. Time scrubber vs historical data: sun, moon, tide, wind, weather

**Verdict: PARTIAL.** The sun and the moon are correct. The tide now shows the EA readings where they cover the clock
time, and near the readings the prediction plus a fading measured residual (the surge). Older than 4 weeks, it is the
harmonic prediction without surge. Wind and cloud follow Open-Meteo, which agrees reasonably with airport observations;
the wind is now turned from true north to the model grid. The Open-Meteo wind is 0.8 to 1.3 m/s below the airport
anemometer, and no correction is applied. When Open-Meteo refuses requests (HTTP 429), the page shows a stated default
wind and no weather.

### Method

- **Sun, moon, night, London time.** https://github.com/danbri/londat/blob/main/docklands/test/clock-check.mjs `--live`
  sets the page clock to 12 historical times. It compares the page with Meeus (Astronomical Algorithms, ch. 25, 47 and
  48), which does not use the page's code. It also compares the page with published facts: timeanddate sunrise and
  sunset for London, full moon 26 Sep 2026, new moon 10 Oct 2026, and the moon in the owner's photo of 3 Oct 2026.
- **Tide.** https://github.com/danbri/londat/blob/main/docklands/test/history-check.mjs compares the page's prediction
  code (https://github.com/danbri/londat/blob/main/docklands/tide.js with
  https://github.com/danbri/londat/blob/main/cwplans/docklands/data/sky/tide-harmonics.json) with Environment Agency
  15-minute readings (OGL v3.0) at Tower Pier (0007), Charlton (0003) and Silvertown (0001).
  - **Held out:** 7 EA daily archive days that the fit did not read: 2025-11-14, 2026-01-09, 2026-02-27, 2026-04-17,
    2026-06-05, 2026-07-24 and 2026-08-28. They are 42 to 329 days before the fit, at k mod 7 = 0. The fit read days
    at k mod 7 = 3.
  - **In the fit's period:** the EA API's last 28 days.
  - clock-check.mjs `--live` also reads the level that the page shows, through the tide layer, on 4 test days.
  - **Surge (added 2026-10-09, after the audit):** history-check.mjs, section "nowcast", gives the page's level
    (https://github.com/danbri/londat/blob/main/docklands/tide.js `nowcast`) with only the readings up to a cut-off time
    T0, and compares it and the prediction alone with the readings after T0. Cut-offs: every 2 h over the EA API's last
    4 weeks (leads to 48 h); 06, 09 and 12 UTC on the 7 held-out days (leads to the end of the day). High and low waters
    in the 12 h after T0: the page's rule (`extremesNear`). In range: every other reading left out and interpolated.
  - https://github.com/danbri/londat/blob/main/docklands/test/tide-source-check.mjs opens the page and reads the source
    of the level at 6 clock times, with the EA API on (the default) and with `?ea=0`.
- **Wind and cloud.** history-check.mjs takes METARs of London City Airport (EGLC, about 2 km east of Canary Wharf) from
  the Iowa Environmental Mesonet ASOS archive. These are observations that the page does not use. The script compares
  them with each source that the page uses for a clock time:
  - the committed snapshot weather-2026-10-03.json (3 and 4 Oct);
  - the Open-Meteo forecast API, past hours (the page's default source up to 85 days back);
  - the Open-Meteo archive, ERA5 (the weather layer's source before 85 days);
  - the hourly cache, cwplans/cache/latest.json.

  The script uses the page's interpolation: vector interpolation for the wind, linear for the cloud. clock-check.mjs
  checks that the page reads those sources and interpolates them correctly.
- **Dates.** The script uses 11 days, each with 24 METARs: 2025-12-21, 2026-03-15, 06-21, 08-28, 09-12, 09-20, 09-29,
  10-03, 10-04, 10-06 and 10-08.

### Evidence

- **clock-check.mjs `--live`:** 260 rows, 0 failed, 14 warnings.
  - Sun azimuth and altitude are within 0.01° of Meeus at all 12 times. The moon is within 0.02°. The lit fraction is
    within 0.005.
  - The photo moon is 7.26° up at 57.86°, 46 % lit (published: 7.25°, 57.85°, 46 %).
  - Night starts at civil dusk to the minute (18:07Z on 3 Oct 2026).
  - Both clock-change days convert to UTC correctly.
- **Tide on held-out days.** Results by gauge (full table: https://github.com/danbri/londat/blob/main/docklands/test/audit/history.json):

  | gauge | days | rms mean (worst) | max error | HW time error mean (worst) | HW height error mean | LW time error mean | LW height error mean |
  |---|---|---|---|---|---|---|---|
  | Tower Pier | 7 | 0.25 m (0.43 m, 27 Feb) | 0.78 m | 14 min (31 min) | 0.39 m | 19 min | 0.17 m |
  | Silvertown | 7 | 0.25 m (0.42 m, 27 Feb) | 0.74 m | 13 min (35 min) | 0.37 m | 19 min | 0.16 m |
  | Charlton | 4 | 0.20 m (0.24 m) | 0.69 m | 16 min (33 min) | 0.30 m | 11 min | 0.15 m |

- **Tide in the EA API's last 28 days** (inside the fit's period): rms mean 0.24 to 0.26 m, worst day 0.49 m (Tower Pier,
  20 Sep, neap), worst reading 1.15 m off. High water time error 13 min mean, 52 to 56 min worst. High water height
  error 0.15 to 0.16 m.
- **Tide on the page, before the surge fix.** On 3 and 4 Oct and in the fit file's last 7 days the page showed the EA
  readings themselves: rms 0.00 m. At other times it showed the prediction. On the 4 test days in clock-check, high- and
  low-water times are within 45 min, with a mean of 14 min (39 extremes).
- **Tide on the page, after the surge fix** (prediction = before; page = after; rms in m):

  | readings up to T0, then | lead 0-1 h | 1-3 h | 3-6 h | 6-12 h | 12-24 h | 24-48 h | HW height MAE, next 12 h | HW time MAE |
  |---|---|---|---|---|---|---|---|---|
  | EA API, 4 weeks (3 gauges, 336 cut-offs each) | 0.27 → 0.13 | 0.27 → 0.23 | 0.27 → 0.25 | 0.27 → 0.25 | 0.26 → 0.26 | 0.26 → 0.26 | 0.17 → 0.16 m | 12 → 8 min |
  | held-out days (7) | 0.21 → 0.08 | 0.23 → 0.23 | 0.20 → 0.18 | 0.24 → 0.20 | 0.31 → 0.31 | | 0.31 → 0.22 m | 12 → 10 min |
  | held-out winter days (14 Nov, 9 Jan, 27 Feb) | 0.28 → 0.10 | 0.30 → 0.31 | 0.24 → 0.23 | 0.30 → 0.25 | 0.41 → 0.41 | | 0.48 → 0.35 m (bias −0.48 → −0.35) | 14 → 15 min |

  - Inside the readings the page interpolates between 15-minute readings: rms 0.03 to 0.04 m over 30-minute gaps.
  - Beyond 12 h the residual has faded (8 h e-folding) and the level is the prediction again. The one worse bin, winter
    1-3 h (+0.01 m), is on one-day files: there is no tidal cycle of readings before 06:00.
  - Live, 9 Oct 2026 at 10:45Z the EA readings were 0.67 m below the prediction (`tide-source-check.mjs`). The page
    showed the readings; 2 h after the last reading it showed prediction − 0.13 m, 6.5 h after it prediction − 0.29 m.
  - The tide note says the source: "EA readings", "prediction − 0.13 m measured residual, from an EA reading 2.5 h
    before, fading", or "prediction, no surge".
  - Full results: https://github.com/danbri/londat/blob/main/docklands/test/audit/history.json (`nowcast`).
- **Wind and cloud against the EGLC METARs** (264 hours for ERA5, 168 for the forecast API, 46 for the snapshot):

  | source the page uses | days | speed bias | speed MAE | direction MAE | low-cloud class agrees |
  |---|---|---|---|---|---|
  | snapshot weather-2026-10-03.json (3, 4 Oct) | 2 | −0.50 m/s | 0.63 m/s | 15° | 68 % |
  | Open-Meteo forecast API, past hours (≤ 85 days back) | 7 | −0.77 m/s | 0.88 m/s | 14° | 73 % |
  | Open-Meteo archive, ERA5 (weather > 85 days back) | 11 | −1.26 m/s | 1.30 m/s | 13° | 71 % |
  | hourly cache (within 90 min of its hour) | 3 hours | −0.73 m/s | 0.73 m/s | (no direction in its series) | |

  - Direction error is counted when both speeds are 2 m/s or more.
  - Cloud classes are < 25 %, 25 to 75 % and > 75 %. The page's low cloud is compared with the METAR cover. METAR codes
    count as FEW 19 %, SCT 44 %, BKN 75 %, OVC 100 %, NCD 0 %.
  - Open-Meteo directions are clockwise of the METARs by +7° to +15° on most days: the mean direction bias is +10°
    (forecast API, 8 days: +3, +7, +9, +15, +18, 0, +15, +14) and +5° (ERA5, 8 days with a direction).
  - **True north (fixed 2026-10-09):** the page used the data's true direction as a grid direction. True north is 1.55°
    west of grid north at the model centre (`sky3.js GRID_CONV` = −1.55°, from the derivatives of `area.js meta.geo`), so
    the waves, debris, rain and tree sway pointed 1.55° clockwise of the data. Now `WU.windDir` = true direction +
    GRID_CONV; `STATS.surface.wind` gives `dir` (true, as the note), `gridDir` and `gridConv` (load.mjs: 249° true,
    247.7° grid). Against the METARs, the drawn direction bias goes from about +11.6° to +10.1° (forecast API days).
  - Total cloud is 29 to 65 points above the METAR cover. An automatic airport station reports only low and middle
    cloud (NCD = no cloud detected), so this difference is expected.
  - Rain: 4 of 5 rain hours (8 Oct, 21 Dec) are rain in Open-Meteo too. On 28 Aug, ERA5 had 10 false rain hours.
- **When Open-Meteo refuses.** The container's address got HTTP 429 "Daily API request limit exceeded" from
  api.open-meteo.com and archive-api.open-meteo.com for most of the day. During those times:
  - the page shows the stated default wind, 4 m/s from 240° (clock-check WARN rows on 26 Sep, 29 Sep, 20 Sep, 10 Oct and
    25 Oct);
  - the page shows no weather (a fair sky) on 21 Jun, 21 Dec, 26 Sep, 29 Sep and 20 Sep.

  The forecast API answered again later for 7 of the 8 days that history-check.mjs asked for. A visitor's browser has
  its own address and its own limit.

Live deep links:
- The tide now, with the EA readings and the fading residual (Menu > Tide gives the source):
  https://danbri.github.io/londat/docklands/?view=greenland
- The same without the EA API (the hourly cache and the prediction only): https://danbri.github.io/londat/docklands/?view=greenland&ea=0
- Spring tide, high water 14:43, from Greenland Pier:
  https://danbri.github.io/londat/docklands/?view=greenland&t=2026-10-11T14:43
- Low water 08:55 the same day: https://danbri.github.io/londat/docklands/?view=greenland&t=2026-10-11T08:55
- The photo evening, 3 Oct 22:30 (snapshot wind and cloud):
  https://danbri.github.io/londat/docklands/?view=rotherhithe&t=2026-10-03T22:30

### Faults

- **Fixed: wrong warning in clock-check.mjs.** clock-check.mjs said "no weather data at the page without Open-Meteo
  ticked". Open-Meteo has been on by default since 2026-10-09, and the real cause was HTTP 429. The weather layer now
  gives `STATS.weather.error` (https://github.com/danbri/londat/blob/main/docklands/layers/weather.js), and the check
  prints the layer's reason.
- **Open: shared request limit.** One Open-Meteo request limit serves the wind layer and the weather layer, and each
  layer makes its own request for each day. One request could serve both layers. That change needs `layers/wind.js`,
  which this audit could only read.
- **Open: wind speed is low (no correction applied).** The model wind is 0.76 m/s (forecast API, 192 hours) to
  1.26 m/s (ERA5, 264 hours) below the airport anemometer; the snapshot 0.50 m/s. No documented, standard correction
  applies: both are 10 m winds, and the difference is the model grid cell's rougher (urban) surface against an open
  airport mast on the dock. An empirical factor from 11 days would be a tuned value, not a standard. The numbers are
  reported, not applied.
- **Fixed: grid north.** `layers/wind.js` now turns the data's true direction to the model grid (−1.55°).
- **Fixed in part: no surge in the tide.** The page uses the EA readings (the fit file's last 7 days, the 3-4 Oct
  snapshot, the hourly cache's last 24 h, and the EA API for the clock's day and the days either side, back 4 weeks) and
  carries the measured residual from the nearest reading, fading over about 8 h. Open: before 4 weeks back (for
  example the winter days in this table) the page has no readings and shows the prediction without surge; the EA daily
  archive is a 59 MB file of the whole country for each day. No surge forecast ahead of the readings.
- **Decision for the owner:** the EA API request is on by default, as the weather is (owner, 2026-10-09: "all
  wind/weather"); `?ea=0` or the box in Menu > Tide switches it off. The WebGL page asks only after a tap.

## 2. Roof model approximation ported

**Verdict: PASS.**

### Method

https://github.com/danbri/londat/blob/main/docklands/test/roofs-compare.mjs opens the same share hash on both pages, at
noon on 4 Oct 2026. The port runs with `?look=0`, because the WebGL page's default look is flat. The script wraps
`DocklandsRoofs.prism` (https://github.com/danbri/londat/blob/main/cwplans/docklands/roofs-layer.js, the same file in both
pages) before the page runs, and counts the calls and the distinct buildings in the last build. Then it makes the
screenshots.

The script uses the roof views from the docklands-3d-page skill:
- terraces in Deptford: `#v=1&c=-1450,3480,4,160,0.6,0.7`;
- Bow: `#v=1&c=-1425,1875,4,220,0.3,0.6`;
- rear outriggers near Deptford Park: `#v=1&c=1875,-1875,8,260,0.5,0.65`;
- an oblique view over the Isle of Dogs: `#v=1&c=300,900,4,900,0.8,0.5`.

### Evidence

- **Roof prisms:** 22,654 distinct buildings in each page, in each of the 4 views. roofs.json decodes to 22,656 entries.
  The two that are not built belong to detailed models or towers, which have their own geometry.
- **Prisms by kind, the same in both pages:**

  | kind | g gable | parts (outriggers, L shapes) | k skillion | h hipped | go gable (OSM) | p pyramid | ho hipped (OSM) | po pyramid (OSM) |
  |---|---|---|---|---|---|---|---|---|
  | count | 14,704 | 5,329 | 1,745 | 406 | 236 | 174 | 34 | 26 |

- **Screenshots:** in each pair, the port is on the left and the WebGL page on the right.
  https://github.com/danbri/londat/blob/main/docklands/test/audit/roofs-pairs.jpg . The ridges, the hips, the gable
  ends and the outriggers are in the same places. The shading is different: in the port, three.js lights the roofs; the
  WebGL page uses its own shade() function. The WebGL page also draws its trees layer, which the port's test view does
  not load.
- **Page errors:** none.

Live deep links (the same view on each page):
- Port: https://danbri.github.io/londat/docklands/?look=0#v=1&c=-1450,3480,4,160,0.6,0.7&n=0
- WebGL page: https://danbri.github.io/londat/cwplans/docklands/#v=1&c=-1450,3480,4,160,0.6,0.7&n=0

## 3. Official dock berths, boats and piers

**Verdict: PASS.** Every official TfL river pier in the model box is in the model. The Woolwich Ferry and Royal Wharf are
outside the box.

### Method

- The official list is the TfL Unified API `StopPoint/Mode/river-bus`, fetched 2026-10-09. TfL open data is "Powered by
  TfL Open Data". The script took one point per pier name and tested it against the model box (lon −0.095 to 0.015,
  lat 51.474 to 51.522) and against the piers in
  https://github.com/danbri/londat/blob/main/cwplans/docklands/data/piers.json .
- `StopPoint/Mode/river-tour` returned an empty list.
- No PLA pier list was used, because no PLA pier list with an open licence was found.
- https://github.com/danbri/londat/blob/main/docklands/test/piers-check.mjs loads the layer, reads `STATS.piers`, and
  counts the SIMULATED boats alongside at 9 clock times. It also makes screenshots with `?piers=all`.

### Evidence

- **TfL river-bus piers in the box: 8 of 8 in piers.json.** Each one is joined by NaPTAN, at 10 to 37 m from the TfL
  point:

  | TfL pier | NaPTAN | lines | in piers.json |
  |---|---|---|---|
  | London Bridge City Pier | 930GLBR | RB1, RB6 | OSM way 122815198 |
  | Tower Pier | 930GTMP | RB1, RB6 | Tower Millennium Pier, OSM relation 2734159 |
  | Doubletree Docklands / Nelson Dock (Rotherhithe) | 930GNEL | RB4 ferry | no OSM pier shape: a 30 × 7 m pontoon (stated default), `synthetic` |
  | Canary Wharf Pier | 930GCAW | RB1, RB4, RB6 | OSM way 26795488 |
  | Greenland (Surrey Quays) Pier | 930GGLP | RB1, RB6 | OSM way 11288193 |
  | Masthouse Terrace Pier | 930GMHT | RB1, RB6 | OSM way 256777444 |
  | Greenwich Pier | 930GGNW | RB1, RB6 | OSM way 39821958 (and two more OSM pontoons) |
  | North Greenwich Pier | 930GMIL | RB1, RB6 | OSM way 227722338 |

- **Outside the box:**
  - Royal Wharf Pier is at about x 3,100 m. The box ends at x 2,350 m.
  - The Woolwich Ferry North and South piers are at x 5,595 m, 3.2 km outside the box.
  - Woolwich Arsenal, Barking Riverside, and every pier west of Bankside are also outside.

  The Woolwich Ferry is not in range.
- **Other London River Services piers** in the box (in OSM, with `network=London River Services` or a known name):
  - St Katharine's Pier;
  - Butler's Wharf Pier (tour pier, Thames River Sightseeing);
  - Wapping Pier;
  - Cherry Garden Pier;
  - Tower Bridge Wharf Pier;
  - the Metropolitan Police Service Pier (Wapping).

  Trinity Buoy Wharf's pier is in the model as an unnamed OSM jetty (ways 159852587 and 366594955).
- **Tour boats:**
  - City Cruises (Tower Millennium Pier and Greenwich Pier): every 40 min, with seasonal first and last departures from
    the operator's page.
  - Thames River Sightseeing (Butler's Wharf and Greenwich): every 60 min, a stated default.
- **Historic vessels:**
  - HMS Belfast: a low-poly Town-class cruiser at true size, in its OSM place.
  - St Peter's Church (barge).
  - Light Ship 95.
  - Knocker White (tug).
  - SS Robin.
  - Suncrest.
- **What the page builds:** 275 piers and pontoons, 245 pontoons (244 after the Blackwall Pier fix), 38 gangways, 1,768 floating parts (1,766), 244 lamps,
  6 vessels, and 24 model buildings hidden under the vessels.
- **SIMULATED boats alongside (TfL timetable calls, tour frequencies):**

  | time | Thu 8 Oct 07:30 | 08:10 | 12:00 | 12:20 | 17:45 | 23:30 | Sat 10 Oct 14:00 | 14:05 | Tue 15 Dec 16:30 |
  |---|---|---|---|---|---|---|---|---|---|
  | boats | 2 | 2 | 5 | 3 | 2 | 1 | 6 | 2 | 4 |

  With `?piers=all` there are 12 boats.
- **Screenshot:** Tower Millennium Pier with boats and HMS Belfast on the left, Canary Wharf Pier on the right.
  https://github.com/danbri/londat/blob/main/docklands/test/audit/piers-pair.jpg
- **Page errors:** none.

Live deep links:
- HMS Belfast and Tower Pier, a boat at every berth:
  https://danbri.github.io/londat/docklands/?piers=all#v=1&c=-4250,-130,4,420,2.6,0.45&n=0&t=2026-10-08T12:00
- Canary Wharf Pier at a timetabled noon: https://danbri.github.io/londat/docklands/#v=1&c=-640,-30,4,260,2.2,0.5&n=0&t=2026-10-08T12:00

### Faults

- **Fixed: Blackwall Pier (2026-10-09).** OSM way 190723549 (`man_made=pier`, `area=yes`, name "Blackwall Pier",
  `wikidata=Q27082768`) has no `floating` tag. The tool made it float only because its name has "Pier". The evidence:
  - Wikidata Q27082768 is "Blackwall Pier And Entrance Lock To Former East India Dock Basin": instance of pier and of
    lock, a Grade II listed building (NHLE 1260086), "architectural structure in Tower Hamlets". It is the masonry
    pier head at the entrance of the East India Dock Basin, not a pontoon.
  - Under its 912 m² outline, 1 m cells: 896 are land (2.6 to 4.9 m OD in the LiDAR terrain), 15 are tidal water, 1 is
    dock. The centre is on land.
  - In the port before the fix (screenshots, top row): at low water (11 Oct 08:55, −2.43 m OD) a 49 × 22 m pontoon lay on
    the foreshore below the bank; at high water (14:43, +3.99 m OD) it floated over the bank.

  The fix, in https://github.com/danbri/londat/blob/main/cwplans/tools/build-piers.mjs : a pier floats by its name only
  when its centre is on water (`floating=yes` still floats anywhere). Blackwall Pier is now a fixed pier: its OSM outline,
  deck 4.9 m OD (the highest land under it), kind "jetty". It is the only pier that changed: 128 floating (was 129),
  244 pontoons (was 245), 147 jetties (was 146); the vessels and the other 274 piers are the same. The data register
  check passes (733 files registered).
  - Screenshots, before (top) and after (bottom), low water left, high water right:
    https://github.com/danbri/londat/blob/main/docklands/test/audit/blackwall-pier.jpg
  - Live deep links: https://danbri.github.io/londat/docklands/#v=1&c=1578,-409,4,170,2.2,0.42&n=0&t=2026-10-11T08:55 (low
    water) and https://danbri.github.io/londat/docklands/#v=1&c=1578,-409,4,170,2.2,0.42&n=0&t=2026-10-11T14:43 (high
    water).
  - OSM: https://www.openstreetmap.org/way/190723549 ; Wikidata: https://www.wikidata.org/wiki/Q27082768
- **Open: no positions.** The boats are simulated, not real positions. TfL publishes no positions for river buses. AIS
  vessels within 25 m of a berth replace the simulated boat (`layers/ships.js`).

## 4. Birdlife and foxes from real data

**Verdict: PASS, after one fix in the page.**

### Method

- Read https://github.com/danbri/londat/blob/main/cwplans/docklands/data/wildlife.json , made by
  https://github.com/danbri/londat/blob/main/cwplans/tools/fetch-wildlife.mjs .
- https://github.com/danbri/londat/blob/main/docklands/test/wildlife-check.mjs puts the camera over the densest 400 m
  window of each habitat class of the file's 10 m raster, and over Canary Wharf Pier. It does this at noon in January,
  April, July and October, and at 21:30 in October.
- The script classes each animal drawn by the raster cell under it. For a swimmer, water within 30 m counts, which is
  the tool's rule.

### Evidence

- **Sources:**
  - NBN Atlas: 8,405 records, CC0, CC BY and OGL. The partners are BTO/JNCC/RSPB Birds (OGL, 4,839), Birdex
    (CC BY, 2,090), iRecord unverified (CC BY, 1,399), the RSPB House Sparrow Parks Project, BTO non-avian, and the
    Mammal Society Mammal Mapper (CC BY).
  - GBIF: 1,569 records. These are iNaturalist research-grade records with CC0 or CC BY only (1,522), NABU naturgucker,
    and the TIPU ringing data.
  - In total, 2,386 records are located to 100 m or better and are used for the habitat weights.
- **Rejected, as the file records:**
  - eBird: 186,681 records in the box; its terms restrict reuse.
  - CC BY-NC records: 106,051 bird records on NBN, and Birda, Observation.org and Xeno-canto.
  - The Mammal Society's NC resource.
  - GiGL and the London Wildlife Trust: not open.
- **Species (21):**
  - feral pigeon, woodpigeon;
  - mallard, tufted duck;
  - Canada, greylag and Egyptian goose;
  - coot, moorhen;
  - cormorant;
  - mute swan;
  - great crested grebe;
  - black-headed, herring, lesser black-backed, common and great black-backed gull;
  - carrion crow, magpie;
  - grey heron;
  - red fox (68 records, 17 located).

  Every species in the owner's list is there.
- **Habitats (hectares in the box):** none (built) 3,057, river 427, park 416, wood 161, dock 69, garden 58, pond 12.
  Densities by class are stated defaults in `layers/wildlife.js` (`DENS`).
- **Where the simulation puts them** (all runs together, the most common species):

  | habitat | most common species |
  |---|---|
  | built | feral pigeon, herring gull, lesser black-backed gull, woodpigeon, black-headed gull, magpie |
  | park | woodpigeon, crow, Canada goose, magpie |
  | dock | coot, mallard, tufted duck, great crested grebe, moorhen, greylag |
  | river | lesser black-backed and herring gull, cormorant |
  | pond | moorhen, mallard, Canada goose, coot |
  | wood | magpie, woodpigeon, crow, fox |

- **Foxes:** all 34 foxes seen in the 30 runs were on wood (32) or park (2) cells. There were 1 or 2 by day and up to 4
  at night (`MAX_FOX` 4).
- **Seasons, after the fix** (animals in the window over the densest park):

  | species | Jan | Apr | Jul | Oct |
  |---|---|---|---|---|
  | black-headed gull | 9 | 10 | 2 | 15 |
  | common gull | 14 | 3 | 4 | 14 |
  | lesser black-backed gull, at the river spot | 10 | 34 | 24 | 21 |

- **Page errors:** none.

Live deep link (park and wood south of Greenwich, October night, animals drawn 4 times larger):
https://danbri.github.io/londat/docklands/?wildlife=big#v=1&c=1250,3000,2,160,0.6,0.7&n=1&t=2026-10-15T21:30

### Faults

- **Fixed: seasons followed recording effort.** In the file, the season of each species is its records by month. Surveys
  and recording apps peak in April to June: all species together have 1,726 records in May and 290 in September. So
  16 of 21 species had their peak in May. The feral pigeon, a resident bird, was at 3 % of its peak in October, and
  the coot, the moorhen and the tufted duck peaked in May.

  https://github.com/danbri/londat/blob/main/docklands/layers/wildlife.js now divides each species' monthly records by
  all records of that month (a reporting rate), then smooths and normalises them. The results now agree with the known
  seasons:
  - black-headed gull: low in May (0.08), high from November to January;
  - common gull and greylag: high in winter;
  - lesser black-backed gull: high in summer;
  - cormorant: low in summer, high from August to February;
  - waterfowl: about flat.

  The data file did not change. The 0.3 floor and the `SEASON_PRIOR` values stay.
- **Open: breeding-season surveys.** Land birds (the pigeons, the crow and the magpie) still peak in spring after the
  correction, because breeding-season surveys count them more. The tool
  (`cwplans/tools/fetch-wildlife.mjs`) could write the reporting rate into the file. That needs a tool and data change
  with a register entry.

## 5. Trees: species and seasonality

**Verdict: PASS** for "trees more realistic including seasonality, species from OSM or official data" (re-checked
2026-10-09 with the new `STATS.trees` hook: 6 of 6 criteria pass). The limits: the leaf calendars are typical dates for
London by species (stated values, ±5 days a tree), not this year's weather; the 25 % of trees with an inferred species
were all deciduous (fixed in the mixes, takes effect at the next species build).

### Method

- Read https://github.com/danbri/londat/blob/main/cwplans/docklands/data/tree-species.json , made by
  https://github.com/danbri/londat/blob/main/cwplans/tools/build-tree-species.mjs .
- https://github.com/danbri/londat/blob/main/docklands/test/trees-season.mjs shows two views of Mudchute with only the
  trees layer, at noon on 15 January, 20 March, 15 April, 15 July, 15 October and 15 November 2026. For each date it
  renders a frame with the trees layer hidden as the baseline. It classes the pixels that the trees change as green,
  autumn-coloured, blossom (pale), or bare and other.
- The same script reads `STATS.trees` (https://github.com/danbri/londat/blob/main/docklands/layers/trees.js , new): the
  counts, and `seasonAt(day)` for every second day of 2026. `seasonAt` computes on the CPU, with the shader's formulas,
  the leaf fraction (0 bare, 1 full), the autumn-colour share of the foliage and the share of trees in flower, for all
  trees, evergreen, deciduous, and the 12 most common profiles. It prints 6 criteria with PASS, PARTIAL or FAIL.

### Evidence

- **Basis of the species, of 81,875 trees:**

  | basis | trees | share |
  |---|---|---|
  | species from the source | 48,397 | 59.1 % |
  | genus or family from the source | 12,998 | 15.9 % |
  | OSM `leaf_type` / `leaf_cycle` only | 437 | 0.5 % |
  | inferred from the setting (park 13,615, street 3,488, wood 1,966, waterside 974) | 20,043 | 24.5 % |

  A taxon from the source is known for 75.0 % of the trees. The inferred ones are all 12,670 Forest Research TOW crowns
  and the OSM nodes and records with no usable taxon.
- **Sources:**
  - GLA London Public Realm Trees (OGL): 55,060 trees, 54,836 of them with a taxon;
  - OSM (ODbL): 13,611;
  - Forest Research TOW (OGL): 12,670;
  - planning.data.gov.uk TPO trees: 534.
- **Profiles:** 43 profiles are used, plus one fallback. The most common are plane (16,292), lime (6,952), birch (5,376),
  cherry (5,217), ash (4,544) and oak (4,056).
- **Criteria (trees-season.mjs, 2026-10-09):**

  | criterion | verdict | evidence |
  |---|---|---|
  | species from official or OSM data | PASS | taxon from the source for 75.0 % of 81,852 trees drawn (species 59.1 %); 20,460 inferred |
  | January: evergreens in leaf, deciduous bare | PASS | 15 Jan: leaf fraction 1.0 for 2,764 evergreens, 0.0 for 79,088 deciduous trees |
  | spring flowering by species | PASS | bloom peaks (day of year): cherry 101, wild cherry 103, horse chestnut 123, hawthorn 125, whitebeam 125 (cherry plum, bloom day 78, and magnolia, 90, are profiles too, but not among the 12 most common that STATS lists); share in flower on 15 Apr 0.105 |
  | species-specific autumn timing | PASS | autumn colour passes half the foliage: horse chestnut 261, cherry 281, lime 285, birch 285, ash 287, maple 291, plane 299, oak 303 (spread 42 days); half the leaves down: horse chestnut 287 to oak 327; leaf-out: horse chestnut 91 to ash 131 |
  | pixels follow the season | PASS | close view, green share 0.07 (Jan), 0.08 (20 Mar), 0.44 (Apr), 0.94 (Jul), 0.48 (Oct); autumn share 0.005 (Jul), 0.08 (Oct), 0.32 (15 Nov) |
  | no page errors | PASS | none |

- **Drawn:** 81,852 trees (23 over 35 m skipped); about 2,000 full trees within 380 m and 79,600 far forms
  (`STATS.trees.drawn`).
- **Season, share of tree pixels (the first audit run, 4 dates):**

  | view | 15 Jan | 15 Apr | 15 Jul | 15 Oct |
  |---|---|---|---|---|
  | Mudchute, 300 m: green / autumn / bare and other | 0.135 / 0.068 / 0.796 | 0.553 / 0.007 / 0.439 | 0.918 / 0.001 / 0.081 | 0.475 / 0.085 / 0.440 |
  | Mudchute, 120 m: green / autumn / bare and other | 0.067 / 0.066 / 0.867 | 0.443 / 0.016 / 0.541 | 0.940 / 0.005 / 0.055 | 0.477 / 0.078 / 0.445 |

  The tree pixel count rises from 21,920 in January (bare crowns) to 41,983 in July (full crowns), in the 120 m view.
- **Screenshots** (top row 300 m, bottom row 120 m; 15 January, 20 March, 15 April, 15 July, 15 October, 15 November):
  https://github.com/danbri/londat/blob/main/docklands/test/audit/trees-seasons.jpg . In January and March the twigs are
  bare. In April there is fresh green and blossom. July has full crowns. In October there is yellow and red autumn
  colour, with evergreens still green; in November most crowns are thin and orange-brown.
- **Page errors:** none.

Live deep links (the same view in each month):
- https://danbri.github.io/londat/docklands/#v=1&c=560,1500,2,120,2.4,0.35&n=0&t=2026-01-15T12:00
- https://danbri.github.io/londat/docklands/#v=1&c=560,1500,2,120,2.4,0.35&n=0&t=2026-04-15T12:00
- https://danbri.github.io/londat/docklands/#v=1&c=560,1500,2,120,2.4,0.35&n=0&t=2026-07-15T12:00
- https://danbri.github.io/londat/docklands/#v=1&c=560,1500,2,120,2.4,0.35&n=0&t=2026-10-15T12:00

### Faults

- **Fixed: no stats hook.** `STATS.trees` now gives the counts (trees, drawn: full and far forms, species known and its
  share, evergreen, deciduous, by profile) and `season` / `seasonAt(day)` (above).
- **Fixed: green on bare trees in blossom.** Before the leaves (cherry plum, magnolia, early cherries), the crown
  showed blossom only in noise patches and the young-leaf green between them, so a bare tree in flower looked half in
  leaf. Now the whole crown is flower before the leaves, and patches when in leaf (`crownColour` in trees.js).
- **Fixed in the mixes, not yet in the data: inferred trees were all deciduous.** Of the trees with a taxon from the
  source, 4.5 % are evergreen (2,748 of 61,395: conifer 846, holly 547, other evergreen 488, pine 461, evergreen oak 157,
  palm 157, columnar cypress 92). Of the 20,460 trees with an inferred species (street, park, wood and waterside mixes),
  0 % were evergreen, so all of them were bare in winter. The street, park and wood mixes in
  https://github.com/danbri/londat/blob/main/docklands/tree-species.js now carry about 4.5 % evergreens. This takes
  effect when `node cwplans/tools/build-tree-species.mjs` rebuilds `cwplans/docklands/data/tree-species.json` (then run
  the register check); that file was outside this change.
- **Open: the calendar is not this year's weather.** Leaf-out, colour and leaf-fall days are typical London dates by
  species, ±5 days a tree. A warm spring or a late autumn does not move them.

## 6. The falling translucent data sheet

**Verdict: PASS on WebGL 2 and on WebGPU.**

### Method

https://github.com/danbri/londat/blob/main/docklands/test/reveal-frames.mjs opens
`?layers=overlays&ov=&view=area`, with Data overlays loaded and no part on. The script imports
https://github.com/danbri/londat/blob/main/docklands/reveal.js , which is the same module instance as the page's import.
It sets the reveal clock to manual and ticks "Conservation areas" in the menu: a click on the checkbox of that menu row.

The script steps the clock to 0, 0.4, 0.8, 1.1, 1.22, 1.3, 1.4, 1.6, 2.0, 2.4 and 2.9 s. At each step it reads the
sheet mesh `reveal:Conservation areas` (height, width) and makes a screenshot. It runs once on WebGL 2 (`--webgl`) and
once on WebGPU (`--webgpu`).

### Evidence

The geometry is the same on both backends. The motion is computed on the CPU with a fixed clock.

| t (s) | 0 | 0.4 | 0.8 | 1.1 | 1.22 | 1.3 | 1.4 | 1.6 | 2.0 | 2.4 | 2.9 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| mean height (m) | 952 | 909 | 657 | 332 | 165 | 51 | 23 | 17 | 11 | 10 | sheet removed |
| width rel. to start | 1 | 0.997 | 0.987 | 0.975 | 0.970 | 1.019 | 1.009 | 0.993 | 0.999 | 1.000 | |
| layer shown | no | no | no | no | yes | yes | yes | yes | yes | yes | yes |

- **The fall:** the sheet falls from 951 m.
- **Stretch:** the sheet narrows by 3.0 % as it falls.
- **Landing:** the first vertices land between 1.1 and 1.22 s, and the layer shows at that moment.
- **Squash:** on impact the sheet spreads to +1.9 %, then springs back (−0.7 %, then 0).
- **Bounce:** the bounce decays over about 1 s; the highest point drops from 129 m to 53 m as the sheet drapes.
- **Dissolve:** from 1.45 s (noise holes with a bright edge, frames 2.0 and 2.4 s). The sheet is removed at 2.8 s.
- **`__docklandsReveal.stats`:** started 1, done 1, skipped 0. The drawing is "trace", 2,048 × 1,568 px, over
  8,098 × 6,201 m, on a 110 × 110 grid.
- **Preparation time:** 6.4 s on WebGL 2 and 0.7 s on WebGPU. These are first-use times in software. The 6.4 s run had
  a load average of 9 to 11 from other agents.
- **The look on each backend:**
  - WebGPU: frosted glass, the scene behind refracted and lightened, with the label "Conservation areas" on the south
    edge.
  - WebGL 2: a light translucent tint (opacity 0.28), as designed.
- **Frames:** https://github.com/danbri/londat/blob/main/docklands/test/audit/reveal-webgl2.jpg and
  https://github.com/danbri/londat/blob/main/docklands/test/audit/reveal-webgpu.jpg (11 frames each, left to right,
  top to bottom).
- **Page errors:** none.

Live deep link (tick Menu > Layers > Data overlays > Conservation areas):
https://danbri.github.io/londat/docklands/?ov=&view=area

### Faults

- **Open: hard to see at the area view.** From the whole-area view, a layer that covers the whole box gives a sheet as
  large as the view, so the fall is hard to see. A small part, or a closer view, shows the motion better. This is a
  matter of design, not a fault in the code.

## Faults fixed (files)

- https://github.com/danbri/londat/blob/main/docklands/layers/wildlife.js : the season is the species' share of all
  records of each month (recording effort taken out), not its raw records by month.
- https://github.com/danbri/londat/blob/main/docklands/layers/weather.js : `STATS.weather.error` gives the reason when
  there is no weather (for example, Open-Meteo HTTP 429).
- https://github.com/danbri/londat/blob/main/docklands/test/clock-check.mjs : the "no weather" warning gives the
  layer's reason, not "without Open-Meteo ticked".
- https://github.com/danbri/londat/blob/main/docklands/tide.js and
  https://github.com/danbri/londat/blob/main/docklands/layers/tide.js : the measured level and the surge (`nowcast`,
  `mergeReadings`, `extremesNear`, `SURGE`); readings from the hourly cache and the EA API; the tide note gives the source.
- https://github.com/danbri/londat/blob/main/docklands/layers/wind.js : true north to grid north (−1.55°).
- https://github.com/danbri/londat/blob/main/cwplans/tools/build-piers.mjs and
  https://github.com/danbri/londat/blob/main/cwplans/docklands/data/piers.json : Blackwall Pier is a fixed pier.
- https://github.com/danbri/londat/blob/main/docklands/layers/trees.js : `STATS.trees`; blossom before the leaves.
- https://github.com/danbri/londat/blob/main/docklands/tree-species.js : evergreens in the setting mixes (needs the
  species build).

## New tests

- https://github.com/danbri/londat/blob/main/docklands/test/history-check.mjs (tide, tide nowcast and wind, no browser)
- https://github.com/danbri/londat/blob/main/docklands/test/tide-source-check.mjs (the source of the page's tide level)
- https://github.com/danbri/londat/blob/main/docklands/test/roofs-compare.mjs
- https://github.com/danbri/londat/blob/main/docklands/test/piers-check.mjs
- https://github.com/danbri/londat/blob/main/docklands/test/wildlife-check.mjs
- https://github.com/danbri/londat/blob/main/docklands/test/trees-season.mjs
- https://github.com/danbri/londat/blob/main/docklands/test/reveal-frames.mjs

## Faults left open

1. Open-Meteo HTTP 429 from a shared address leaves the default wind and no weather. Wind and weather make two requests
   for each day; one request could serve both (needs `layers/wind.js`).
2. Model wind is 0.76 to 1.26 m/s below the EGLC anemometer, and its direction is +5° to +10° (mean) from the METARs.
   Not corrected: no standard correction applies (section 1). Grid north is fixed.
3. The tide has a surge only within about 8 h of EA readings, and the page reads them back 4 weeks. Older days show the
   prediction without surge (in winter high water up to 0.7 m above it). No surge forecast.
4. (Fixed: Blackwall Pier is a fixed pier.)
5. The wildlife reporting rate is computed in the page. The tool could write it into the file. Land birds still show
   a spring peak, from breeding-season surveys.
6. (Fixed: `STATS.trees`.) The 20,460 trees with an inferred species stay all deciduous until
   `cwplans/tools/build-tree-species.mjs` runs with the new mixes. Leaf calendars are typical dates, not this year's.
