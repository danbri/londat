# Objectives and key results: cwplans / londat, Q4 2026

Set on 2026-10-11 at the owner's request ("we didn't set okrs. Please review docs and transcripts to set some.").
Drawn from the owner's words in `CLAUDE.md`, the curation skill ("Ways of working (the owner's words)"), the activity log
(https://github.com/danbri/londat/blob/main/cwplans/skills/docklands-data-curation/ACTIVITY-LOG.md), the Three.js port
goal list (session "Docklands ThreeJS port", 2026-10-09) and the session of 2026-10-11. The owner can change any line.

- **Period:** 2026-10-11 to 2026-12-31.
- **Checkpoints:** 2026-10-25 (two weeks), 2026-11-22, and the end-of-quarter score.
- **Scores:** 0.0 to 1.0 for each key result. An objective's score is the mean of its key results. Aim for about 0.7:
  a 1.0 everywhere means the targets were too easy.
- **Rule for evidence:** every score points to a test output, a commit, a register count or the owner's own words. A
  key result that only the owner can judge says so.
- **Where it shows:** the review at each checkpoint goes into this file (the table at the end) and into the activity log.

## O1. The data comes alive in the 3D view

Owner: "We also need our data to be fully available through, and bring to life, the 3D view." and "the ui does no
justice to the amazing materials you collected" (2026-10-03); "Basically we want all the data we can" (2026-10-09).

| key result | baseline 2026-10-11 | target |
|---|---|---|
| KR1.1 Registered data files that a page shows (`shown_on` in `cwplans/data-register.json`) | 116 of 734 | 400, with a generic browser for the London Datastore and portal extracts in the 3D port |
| KR1.2 Data overlays that the owner does not call "boring": each default-on layer is scenery or answers a question at a glance | 2026-10-11: only cranes, moorings and ships are on by default | owner agrees with the default set on the phone |
| KR1.3 Each owner request answered with a deep link to the live page that shows the result | practice since 2026-10-05, not counted | 100 % of checkpoint reviews, counted in the activity log |

## O2. Realism that is measured, not guessed

Owner: "the buildings without custom models are painfully flat and samey ... ultimately to get more realism"; the
calibration photo of 2026-10-11 ("can be used to calibrate our lighting, nature, water, trees, and birds data"); "nudge
from low poly style towards a more realistic / impressionistically painterly ... style that will adapt gracefully as 3DGS
data becomes more broadly available".

| key result | baseline 2026-10-11 | target |
|---|---|---|
| KR2.1 Reference photos with a test of tones (`docklands/test/photo-tones.mjs` style), every region within 0.08 luma | 1 photo (clear day); sky top -0.007, shaded trees +0.21, near water +0.09 | 3 photos (clear day, overcast, night), all regions within 0.08 |
| KR2.2 Photo views with a solved camera, rms under 15 px | 6 (rotherhithe, greenland, pier, greenlandday, plane, greenlanddock) | 10, of which 2 outside Canary Wharf |
| KR2.3 Faults that show in a photo view closed by a rule (not a patch) | F54 open (water under the quays) | F54 closed in the port; tree height on the quays measured against LiDAR |
| KR2.4 Painted style accepted by the owner on the phone | "promising but too lossy" | owner accepts it, or names what is left |
| KR2.5 One splat or 3DGS source shown in the same scene and style | splat layer exists (24 to 39 s a frame in software) | one open 3DGS capture of a zone place loaded and styled |

## O3. Fast and stable on the owner's iPhone

Owner: "shipping immediately to live site is fine and urgent ... live site is my only way to see progress" (2026-10-03).
Phones failed with every layer on (about 2.8 M triangles); "no trees after a reload" on a device (2026-10-09).

| key result | baseline 2026-10-11 | target |
|---|---|---|
| KR3.1 Frame time measured on the owner's phone in 3 views (cw, greenlanddock, area) | never measured on a phone GPU | measured each checkpoint; median under 33 ms (30 frames a second) |
| KR3.2 Triangles a frame with the default layers | about 2.8 M (full page) | at most 1.5 M |
| KR3.3 Faults seen only on the phone | "no trees after reload": not diagnosed | found, fixed, a test for it |
| KR3.4 Time to the first frame on a phone on 4G | not measured | measured; under 8 s |

## O4. Fresh live data with recent history

Owner: "We want the webapp to always have fresh air and boat data plus recent history" (2026-10-09); "Couldn't we
crontab it for every 5 mins? And default to live for the rest?" (2026-10-09).

| key result | baseline 2026-10-11 | target |
|---|---|---|
| KR4.1 Hourly cache runs in each 24 hours (`cwplans/cache/`, GitHub skips scheduled runs) | 5 in the 28 hours to 08:53 UTC | at least 20 in every 24 hours for 4 weeks |
| KR4.2 Gaps in the 5-minute live-cache branch (aircraft, ships, METAR) | fresh on 2026-10-11 17:13 UTC; gap history not measured | gaps over 15 minutes under 5 % of the time, shown on the dashboard |
| KR4.3 Time scrubber against history (docklands/AUDIT.md item 1) | PARTIAL (accepted): 27 days without EA archive, wind 0.8 to 1.3 m/s low | PASS: wind bias corrected against the London City METARs, tide gaps filled or stated on the page |

## O5. Open, traced data, ready to leave the prototyping phase

Owner: "record ALL our data methods in skills or other concrete committed artifacts" (2026-10-03); "don't waste good
info by burying it in our chatlogs" (2026-10-06); the cwplans data exception holds "while in the scoping, planning and
prototyping phase" only; "Flag it somewhere for review as we scale" (AIS, 2026-10-04); the dataflow rule (2026-10-06).

| key result | baseline 2026-10-11 | target |
|---|---|---|
| KR5.1 `npm run check` passes on every push (every data file registered, OSM credit on every page) | passes: 734 files | passes on 100 % of pushes |
| KR5.2 Register items marked "review", each with a written decision path (keep, replace, drop when the phase ends) | 74 marked, no decision paths | 74 with a path; the owner decides the 5 largest (AIS, adsb.lol, crawls, OSM in the port, personal and address data) |
| KR5.3 Open faults in the register (curation skill) | 14 open, 2 partly | at most 8 open; each other one fixed by a rule |
| KR5.4 Every session ends with an activity-log entry and its lessons in a skill | done most days | 100 %, checked at each checkpoint |

## O6. A base that scales beyond the box

Owner: "Yes, do our whole area and be mindful of possible future expansion"; "eventually we will clean up and separate
data vs code so this current tool can be localised and extended" (2026-10-05); "assess amount of work to extend the map
to cover more or all of greater London ... a skeleton of global coverage ... a 3D globe?" (2026-10-09). Options and
numbers: https://github.com/danbri/londat/blob/main/docklands/SCALING-AND-OKRS.md .

| key result | baseline 2026-10-11 | target |
|---|---|---|
| KR6.1 Owner decisions on scaling recorded (option A, tile format, tile host, first ring, WebGL page) | none taken | all five recorded in the scaling file |
| KR6.2 The model origin and box in one config file only (option A) | 21 tools import the box; 13 files hold 537550 / 180300 | 0 outside the config; every data tool takes `--area` |
| KR6.3 Tiles outside the box built by the same pipeline and shown in the port | 0 | 1 BNG 1 km tile by the first checkpoint after the decisions; 25 km² by the end of the quarter |
| KR6.4 Generic rules versus hand work: share of model features made by rules that run anywhere | not measured | measured and listed in the scaling file |

## Reviews

| date | O1 | O2 | O3 | O4 | O5 | O6 | notes |
|---|---|---|---|---|---|---|---|
| 2026-10-11 (baseline, scored from the evidence before these OKRs) | 0.3 | 0.3 | 0.1 | 0.4 | 0.5 | 0.0 | first scores; see docklands/SCALING-AND-OKRS.md section 3 for the earlier goal scores |
