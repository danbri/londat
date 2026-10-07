---
name: cwplans-crown-lighting
description: >-
  The coloured lighting at the tops of the Canary Wharf towers in magpie/cwplans — One Canada Square's pyramid and
  its lit band (the "halo"), and the crowns of 25 Bank Street, 8 Canada Square and Newfoundland: how a colour is
  chosen (Canary Wharf Group campaigns with charities, the council and events; no public request form or schedule
  found), why the white flashing aviation light at the apex is a separate system, where a history of colours exists
  (nowhere complete: CWG press pages, partner news, social posts, dated photos), and how to build a dated
  observation list from press pages and open photos without copying text or images (tools/fetch-crown-lighting.mjs,
  registry/sources/lighting/). Reach for it before you add a crown colour to the 3D page's Night mode, record a new
  lighting campaign or photo observation, judge a crown colour from a photo, or answer "why is the top of One Canada
  Square pink tonight?".
---

# Crown lighting (magpie/cwplans)

Policy, the fault register and the activity log are in the hub skill `docklands-data-curation`. Crawls and the
Internet Archive: `cwplans-web-harvest`. Night mode on the page: `docklands-3d-page`. Append to `ACTIVITY-LOG.md`.
Data: `registry/sources/lighting/` (README.md, crown-lighting.json, press-pages.json, commons-photos.json).
First written 2026-10-04 from the owner's questions: "how the 1 Canada Square light colours at top are chosen … and
also whether historical colours are recorded."

## What is lit, and what is not decoration

- **One Canada Square** (cwb-0413). Two systems: (1) the decorative lighting of the pyramid and of the band at its
  foot, which CWG's own press release of 2 December 2024 calls "the halo"; (2) the aviation obstacle light at the
  apex: high-intensity **white flashing**, required by an aeronautical study for London City Airport (CAP 168), not
  the steady red of Air Navigation Order article 222. Delta Obstruction Lighting replaced the xenon units with four
  WL-100 LED lights in November 2012. Never treat the apex flash as a campaign colour.
- In the owner's photos of 3 October 2026 (23:56 BST) **the pyramid itself is dark**; only the band at its foot is
  lit (red, measured hue 0 to 2°) and the top floors of the shaft show a pink-red wash. So on the page, colour the
  halo band (and optionally a facade wash), not the pyramid faces, unless a source says the pyramid was lit.
- Older system: about 4,000 lamps / "a thousand electronically controlled fluorescent tubes" that can be
  sequence-programmed (English Wikipedia, One Canada Square, its reference 37; a 2016 blog repeats 4,000 bulbs). The 1996 Christmas
  green (Simon Corder: 400 kW of PAR-64 lamps with Lee 122 Fern Green gels) was a temporary rig. Whether the halo
  is now LED and RGB: not found (gap).
- **25 Bank Street** (Lehman Brothers' HQ2, now JP Morgan): RGB LED crown from November 2004 (152 Solar M200B
  fixtures, ETC Unison control, green and blue colour-mixing sequences; LightMatters design, A.C. Lighting supply).
- **8 Canada Square**: a lit HSBC sign (LED, white at night since 2014) and logo, not a colour crown.
- **Newfoundland** (cwb-0451): lit by the artists Hawthorn ("Newfoundland Reflections") for Connected by Light,
  2 December 2020 to 27 February 2021, dusk to 22:00. No permanent colour crown found.

## How a colour is chosen (what the sources show)

- CWG (the landlord and estate manager) lights the halo for **campaigns with a partner**: a charity (Positive East,
  World AIDS Day red, 1 December 2024, "the first time" in the building's history; NSPCC Childhood Day green,
  June 2025), the council (Tower Hamlets, UN 16 Days orange, 25 November 2025), transport (Elizabeth line purple,
  one week from 24 May 2022), public thanks (NHS blue, Thursdays 6 to 9 pm, January 2021).
- The colour is **the campaign's own colour** (red ribbon, UN UNiTE orange, Elizabeth line purple, NSPCC green,
  "Light it blue"), not CWG's choice of palette.
- **No public request form, policy or schedule was found** (searched 2026-10-04). Unlike the CN Tower or Empire
  State Building, CWG publishes no lighting calendar. The route a charity can use is CWG's communications or
  community team; say so as an inference, not a found fact.

## Is a history recorded?

No complete history exists in public. The pieces:
1. CWG press releases (cwg.com, formerly group.canarywharf.com) and community news; canarywharf.com news. Found by
   slug in the sitemaps (`press-pages.json`); most campaigns get no press release.
2. Partner news (council pages, London Post, LondonWorld): one article per event at best.
3. Social posts (Tower Hamlets on X, 25 November 2025): facts and links only, no text copied.
4. Dated photos: Commons and Flickr with EXIF capture dates. The colour is a fact, judged by eye; the image is not
   copied unless CC0, PD or CC BY.
So the observation list is a **sample**, not a schedule. Never fill gaps between observations with a guess.

## Method

1. `NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-crown-lighting.mjs` (`--press`, `--commons`, `--no-fetch`).
   - press: cwg.com sitemaps (served to scripts; robots.txt allows them) and the canarywharf.com news sitemap (Internet
     Archive); slugs filtered by a rule (lit, illuminated, halo, pyramid, turns <colour>, lights up <colour>) plus a
     hand list of pages found by search; each page read as an Internet Archive `id_` copy (availability API first;
     group.canarywharf.com and cwg.com both tried). Colour words in sentences that name the crown are recorded;
     sentences stay in the local cache.
   - commons: `Category:One Canada Square at night`, `Category:Canary Wharf at night` and four searches; capture date,
     licence, author; 960 px thumbnails cached locally to judge by eye.
   - Politeness: one request at a time, 1.5 to 3 s per host, backoff on 429/5xx (Retry-After, up to 600 s).
2. Judge each photo by hand: find the building (One Canada Square's pyramid is unmistakable), say what is lit
   (pyramid faces, halo band, facade wash, nothing), name the colour, and measure an approximate hex from the
   brightest 20% of pixels in the lit band when the photo is ours or open (red channel sort; report hue). Record the
   capture date and time from EXIF; a date from the title alone is marked so.
3. Write the observation into `crown-lighting.json` with its evidence kind (press, photo CC BY / PD, photo other
   licence: fact only, social post, owner photo) and licence. Campaigns (date ranges from press) go to `campaigns`.

## Traps

- **Camera colour is not lamp colour.** Phone night modes and white balance shift red towards pink or orange; a
  sodium-lit sky adds orange. Give the colour name and the hex as approximate, with the photo.
- **EXIF dates can be wrong** (camera clock unset, time zone). Cross-check with events (Winter Lights is January;
  Christmas trees; the moon in frame) when it matters.
- **"Lit up" can mean the facade or a projection**, not the crown (Connected by Light, Winter Lights).
- **Not every lit night is a campaign.** The 3 October 2026 red has no source found yet: record it as an observation
  with reason unknown, never infer a campaign from a colour.
- **The Internet Archive resets connections from this container at times** (2026-10-04: every web.archive.org
  request reset while archive.org's availability API answered). Commons rate-limits the API (429). Record failures in
  `press-pages.json` status and retry later; do not swap in a guess.

## Using the data on the page (not done; for the 3D page owner)

Night mode can read `crown-lighting.json`: for the page clock's date, take a campaign whose range covers the date,
else an observation on that date, else the default "unknown" (draw the halo in a neutral warm white or leave it
dark, and say so in the caption). `?t=photo` (3 October 2026, 23:56 BST) should show the red halo.
