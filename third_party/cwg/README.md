# Canary Wharf Group maps and guides: cwg

Printed maps and guides that Canary Wharf Group publishes on https://canarywharf.com/maps/ , for the Canary Wharf /
Docklands project (`cwplans/` in this repository; until 2026-10-07 magpie/cwplans in danbri/glitchcan-minigam).

## Status of use

- Rights holders: Canary Wharf Group; the store guide is designed by Paul Anthony, Ravenshaw Studios Limited
  ("© Copyright Ravenshaw Studios Limited and Paul & Linda Anthony 2026"). No open licence.
- Use in this project: **added at the request of the project owner, danbri, 2026-10-06**, for the scoping and
  prototyping phase only (the owner's crawl rule of 2026-10-03). Review before any use outside that phase.
- Files are added by the owner (downloaded by hand from canarywharf.com/maps/) and recorded in `manifest.json` with
  their size, SHA-256 and what they show. canarywharf.com answers scripts with a bot challenge, so there is no fetch tool.

## Files (`maps/`)

| file | date in file | pages | what it shows |
|---|---|---|---|
| `260720_store_guide_JULY_composite_v85_vec.pdf` | 20 July 2026 | 2 | p. 1 "Shopping Malls": a schematic plan of Cabot Place, Canada Place, Churchill Place, Crossrail Place and Jubilee Place by level, with unit outlines and an index of every shop, restaurant, café, bar and service with its grid square (rows 1-16, columns A-Q). p. 2 "Canary Wharf Estate": street retail and office tenants on a grid (rows 1-23, columns A-J), and the estate buildings by postal address. The text is outlines, not text: names must be read by eye or OCR. |
| `AccesibilityMap_MAY-2025_v2.pdf` | May 2025 | 1 | step-free access map: lifts, accessible toilets (street level and in the malls), ramps, baby changing, car parks, stations, river pier. Has a text layer. |
| `JUNE-2025-Childrens-Art-Trail_Map_Online_AW.pdf` | June 2025 | 3 | children's art trail: artworks on a map with short texts. |
| `Art-Brochure_Whale-cover.pdf` | April 2025 | 20 | art guide: over 100 permanent artworks by area (Montgomery and Wood Wharf first), with artists and texts. |

## The interactive map (`mallmap/`)

The data behind https://map.canarywharf.com/ (Living Map): app, API answers, every vector tile at every zoom, icons and
popup images, archived as served at the owner's request (2026-10-06). See `mallmap/README.md`.

## How they are used

Facts only (a shop's mall, level and grid square; where a lift or toilet is), joined to the registry in
`cwplans/`. No page or image is copied into `cwplans/`; `third_party/` stays out of the Pages site. Skill:
`cwplans-web-harvest`, "Mall plans".
