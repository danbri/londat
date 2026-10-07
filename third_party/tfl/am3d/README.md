# TfL axonometric (3D) station diagrams: am3d

Transport for London's axonometric diagrams of London Underground stations, released after Freedom of Information
requests (first set published July 2015, 124 stations A to W, many parts redacted). They are drawings, not to scale.

## Status of use

- Rights holder: Transport for London. Re-use is under the Re-use of Public Sector Information Regulations (TfL's
  FOI responses). This is not an open licence.
- Use in this project: **approved by the project owner, danbri, 2026-10-05**, for the Canary Wharf / Docklands
  scoping and prototyping work (magpie/cwplans in danbri/glitchcan-minigam; since 2026-10-07 `cwplans/` in this
  repository). Review before any use outside that phase.

## Sources

- FOI requests on WhatDoTheyKnow: https://www.whatdotheyknow.com/request/axonometric_diagrams_london_unde ,
  https://www.whatdotheyknow.com/request/axonometric_drawings_of_every_st ,
  https://www.whatdotheyknow.com/request/updated_axonometric_drawings_of
- Ian Visits articles that republish the set (C to G includes Canada Water and Canary Wharf):
  https://www.ianvisits.co.uk/articles/3d-maps-of-every-underground-station-cdefg-14651/
- What other people built from or alongside these diagrams (54 projects, licences, best baselines for Canada Water and
  Canary Wharf): https://danbri.github.io/londat/cwplans/feeds/underground/AXONOMETRIC-USES.md
  (records: https://danbri.github.io/londat/cwplans/feeds/underground/axonometric-uses.json ; 2026-10-05)

## How files get here

Not by script from the sources above:
- ianvisits.co.uk robots.txt disallows Anthropic agents (`User-agent: anthropic-ai`, `Claude-Web`: `Disallow: /`).
- whatdotheyknow.com answers scripts with a Cloudflare challenge.
Files are added by the owner (downloaded by hand) and recorded in `manifest.json` with the source URL and date.

## Stations in the zone (London Underground only; DLR, Overground and Elizabeth line are not in the 2015 set)

1. Canada Water (Jubilee, East London line): `stations/canada-water/canada-water-axonometric.jpg` (imported 2026-10-05)
2. Canary Wharf (Jubilee): `stations/canary-wharf/canary-wharf-axonometric.jpg` (imported 2026-10-05)
3. Next: North Greenwich, Bermondsey, London Bridge, Tower Hill, Aldgate East, Whitechapel, Bow Road, Mile End,
   West Ham, Canning Town (Jubilee)

## Facts read from the drawings (for the 3D model)

| station | item | value | note |
|---|---|---|---|
| Canada Water | Jubilee line platforms, approx. depth below street | 15.0 m | the model uses -16.6 m OD (22 m below ground, Wikipedia): they disagree |
| Canada Water | East London line platforms, approx. depth below street | 8.0 m | the model uses -5.6 m OD (11 m below ground, Wikipedia): they disagree |
| Canary Wharf | Jubilee line platforms, approx. depth below street | 23.0 m | |
| Canada Water | drawing reference | J009-06 | a TfL CAD sheet number |

The sheets say "approximate" and "use as a location guide". Depths below street level depend on which street level is
meant; record both values with their sources and do not overwrite one with the other.

## Formats

The 2015 release is raster drawings only. No open 3D format (DWG, IFC, glTF) of these stations is known to be published.
TfL holds the CAD sources (drawing numbers appear on the sheets). An FOI request could ask for the CAD or a 3D export;
expect redaction on security grounds (TfL refused tunnel alignments in FOI 1700-1213).
