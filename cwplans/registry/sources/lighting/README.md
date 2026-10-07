# Crown lighting: how the colours at the top of the Canary Wharf towers are chosen, and their history

Owner's questions (2026-10-04): "search for info on how the 1 Canada Square light colours at top are chosen … and
also whether historical colours are recorded." Researched 2026-10-04. Method and traps: the skill
[`cwplans-crown-lighting`](../../../skills/cwplans-crown-lighting/SKILL.md).

| file | what |
|---|---|
| `crown-lighting.json` | policy sources (15), campaigns (9), dated observations (14), pattern notes, gaps. Hand-written |
| `press-pages.json` | CWG press and news pages whose slug says a building was lit, with archive status. `tools/fetch-crown-lighting.mjs --press` |
| `commons-photos.json` | 217 Wikimedia Commons night photos of the area with capture date, licence and author. `tools/fetch-crown-lighting.mjs --commons` |

## How the colour is chosen

**One Canada Square** (cwb-0413) has two lighting systems at the top:

1. **Decorative lighting** of the pyramid and of the lit band at its foot. Canary Wharf Group (CWG) calls the band
   "the halo" (press release, 2 December 2024). The building was given a permanent, programmable system of about a
   thousand fluorescent tubes (Wikipedia, its reference 37; a 2016 blog says 4,000 lamps). Whether it is now LED and
   RGB was not found.
2. **The aviation obstacle light** at the apex: high-intensity **white flashing**, required by an aeronautical study for
   London City Airport during planning (1991; CAA CAP 168), not the usual steady red (Pager Power). Four LED WL-100
   units replaced the xenon lights in November 2012 (Delta Obstruction Lighting). It is not part of any colour campaign.

What the sources show about the decorative colour:

- CWG, the landlord and estate manager, lights the top **for a campaign with a partner**, and the colour is the
  **campaign's own colour**: blue for the NHS (Thursdays in January 2021, 18:00 to 21:00), purple for the opening of
  the Elizabeth line (one week from 24 May 2022), red for World AIDS Day with the charity Positive East (1 December
  2024; CWG said it was the first time in the building's 33 years), green for the NSPCC's Childhood Day (6 June 2025),
  orange with Tower Hamlets Council for the UN day against violence against women (25 November 2025).
- Festive and art lighting is separate: Christmas lights and lasers in 1991; a temporary green rig in 1996 (Simon
  Corder, 400 kW, Lee 122 Fern Green gels); Winter Lights and Connected by Light artworks, which lit Newfoundland in
  changing colours (2 December 2020 to 27 February 2021, dusk to 22:00).
- **No request form, policy, criteria or calendar was found** on CWG pages, in the press or by search. A charity that
  wants a colour would have to ask CWG's communications or community team (inference: every recorded case names a
  partner, none says how it asked).
- Other crowns: 25 Bank Street (cwb-0582) got a programmable RGB LED crown in 2004 (152 Solar M200B fixtures, ETC
  Unison control, green and blue sequences); 8 Canada Square (cwb-0417) has lit HSBC signs (white LED at night since
  2014), not a colour crown; Newfoundland's (cwb-0451) crown was warm white on 3 October 2026.

## Is a history of colours recorded?

**No complete history exists in public.** The pieces are:

- CWG press releases and community news (cwg.com, formerly group.canarywharf.com) and canarywharf.com news: only some
  campaigns get one. In the cwg.com sitemaps (597 press releases, 97 community news pages), the slug rule finds 6
  lighting pages; 5 more found by search are added by hand (`press-pages.json`).
- Partner and local news (Tower Hamlets Council, London Post, LondonWorld): one article per event at best.
- Social posts (Tower Hamlets Council on X, 25 November 2025): recorded as a link and a fact.
- Dated photos: Commons photos with EXIF dates. Most are CC BY-SA: we record only the URL, the date and the colour seen.

From these, `crown-lighting.json` holds:

| | count | dates | kinds |
|---|---|---|---|
| campaigns | 9 | 1991 to 2025 | CWG press or news 3, other press 1, council page 1, encyclopedia 1, designer's portfolio 1, trade press 1, local blog 1 |
| observations | 14 | 2010-11-27 to 2026-10-03 | photo with another licence (CC BY-SA, fact only) 9, owner photo 2, press 2, social post 1 |

What the photos show (judged by eye, colours measured from the brightest pixels; approximate):

- 2012-10-29, 2014-03-07 22:19, 2014-08-06 22:10 and 22:29, 2018-01-18 20:28: **pyramid faces lit cool white**.
- 2013-06-13 23:06 and 23:38: pyramid dim, a dark red tone, no white faces (low confidence); 2013-12-04 16:22 (dusk):
  not lit.
- **2026-10-03 23:56 BST** (the owner's photos; time solved from the moon): **pyramid faces dark, the halo band red**
  (measured #9d3f3c in the bollard photo; it reads pink-red), the top floors washed pink-red. **No campaign for that
  date was found.** In the open photos the white faces appear only before 23:00; this may be a late-night scene or a
  switch-off, but four nights are not a schedule.

## Method (2026-10-04)

1. Web searches for the policy, the lighting system, campaigns and contractors; each fact kept in our words with its
   URL and date (`policy_sources`). Where a page could not be read (CWG pages answer scripts with an Imperva
   challenge), the fact comes from a search-engine summary or a republished copy, and `read` says so.
2. `NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-crown-lighting.mjs`: cwg.com sitemaps (served to scripts;
   robots.txt allows them), slug filter, Internet Archive availability API and `id_` copies; Commons categories
   "One Canada Square at night" and "Canary Wharf at night" plus four searches, with capture date, licence and author,
   and 960 px thumbnails cached in `data/raw/registry/lighting/` (gitignored). Search hits must name the place
   (a first run matched Toronto's "Canada Square").
3. Thumbnails and the owner's photos judged by hand: what is lit, the colour, an approximate hex.

Crawl record: cwg.com sitemaps fetched directly 2026-10-04; Internet Archive availability API 2026-10-04;
web.archive.org copies attempted 2026-10-04 (every connection reset from this container); Commons API and
upload.wikimedia.org 2026-10-04 (429 after 31 thumbnails).

## Licences

- No text or image is copied. Facts only from all-rights-reserved pages and from Wikipedia (CC BY-SA).
- Commons photos: CC BY-SA ones are recorded as URL, date and colour seen (a fact); the image is not copied. CC BY and
  public-domain ones may be used with attribution, but none is committed here.
- The owner's photos are the owner's copyright, kept in `docklands/reference/night-2026-10-03/` with permission.

## Gaps

- The Internet Archive was unreachable: the CWG press pages and the canarywharf.com news sitemap were not read. Re-run
  `--press`.
- 186 Commons photos (27 under CC BY or public domain, among them "One Canada Square pyramid light.jpg", CC BY 3.0)
  not yet judged (429). Re-run `--thumbs`.
- Flickr (no keyless API), Geograph (API key), and CWG's own social accounts were not searched systematically.
- No reason found for the red halo of 3 October 2026; no schedule (switch-off time, default colour) found.

## How the 3D page could use this

Night mode could colour the halo band of One Canada Square by date from `crown-lighting.json`: a campaign whose
range covers the page clock's date, else an observation of that date, else a neutral default with the caption
"colour on this date not known". `?t=photo` (3 October 2026, 23:56 BST) would show the red halo and dark pyramid
faces; before 23:00 on an ordinary night, white faces. The apex keeps its white flash in every case.
