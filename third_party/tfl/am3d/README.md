# TfL axonometric (3D) station diagrams: am3d

Transport for London's axonometric diagrams of London Underground stations, released after Freedom of Information
requests (first set published July 2015, 124 stations A to W, many parts redacted). They are drawings, not to scale.

## Status of use

- Rights holder: Transport for London. Re-use is under the Re-use of Public Sector Information Regulations (TfL's
  FOI responses). This is not an open licence.
- Use in this project: **approved by the project owner, danbri, 2026-10-05**, for the Canary Wharf / Docklands
  scoping and prototyping work (magpie/cwplans in danbri/glitchcan-minigam). Review before any use outside that phase.

## Sources

- FOI requests on WhatDoTheyKnow: https://www.whatdotheyknow.com/request/axonometric_diagrams_london_unde ,
  https://www.whatdotheyknow.com/request/axonometric_drawings_of_every_st ,
  https://www.whatdotheyknow.com/request/updated_axonometric_drawings_of
- Ian Visits articles that republish the set (C to G includes Canada Water and Canary Wharf):
  https://www.ianvisits.co.uk/articles/3d-maps-of-every-underground-station-cdefg-14651/

## How files get here

Not by script from the sources above:
- ianvisits.co.uk robots.txt disallows Anthropic agents (`User-agent: anthropic-ai`, `Claude-Web`: `Disallow: /`).
- whatdotheyknow.com answers scripts with a Cloudflare challenge.
Files are added by the owner (downloaded by hand) and recorded in `manifest.json` with the source URL and date.

## Stations in the zone (London Underground only; DLR, Overground and Elizabeth line are not in the 2015 set)

1. Canada Water (Jubilee): `stations/canada-water/` (pending)
2. Canary Wharf (Jubilee): `stations/canary-wharf/` (pending)
3. Next: North Greenwich, Bermondsey, London Bridge, Tower Hill, Aldgate East, Whitechapel, Bow Road, Mile End,
   West Ham, Canning Town (Jubilee)
