# CLAUDE.md: londat (the Canary Wharf / Docklands project, cwplans)

This repository is the home of the cwplans project: the Docklands 3D page, the atlas, the knowledge-graph search page,
the feeds and what's-on pages, the data tools, the skills, and the open-data extracts. It moved here from
danbri/glitchcan-minigam (folder `magpie/cwplans/`) on 2026-10-07; history before the move:
https://github.com/danbri/glitchcan-minigam/commits/7be94dc/magpie/cwplans . The owner created this repository on
2026-10-04 for the bulk extracts ("Created londat repo"); first commit 2026-10-05.

Only report to the owner in ASD-STE100 Simplified Technical English (owner's rule for all their repositories).

## Always give the full URL
When you name a page, give the whole clickable address, never a repo path. The site is
`https://danbri.github.io/londat/` + the file path, e.g. `https://danbri.github.io/londat/cwplans/docklands/`.
Owner instruction, August 2026: "Full url please, always." For a file in the repository, give the GitHub URL
(`https://github.com/danbri/londat/blob/main/` + path).
The site is published by `.github/workflows/pages.yml` (Settings > Pages > Source: "GitHub Actions"). Until the owner has
switched it on, https://danbri.github.io/londat/ answers 404 and the old pages at
https://danbri.github.io/glitchcan-minigam/magpie/cwplans/ are the live ones. Check first:
`curl -sI https://danbri.github.io/londat/README.md` answers 200 when the site is on.

## Model: no Haiku without the owner's agreement
Owner instruction, September 2026: "do not switch to haiku without my agreement in future." The assistant does not
choose its model; `/model` or a runtime fallback does. Before substantial work, check which model serves the turn (the
system prompt names it; the `get_session` tool gives `session_context.model` and `external_metadata.last_served_model`).
If it is Haiku, or any model the owner did not choose, say so first and wait for the owner before changing code.
Details: the `docklands-data-curation` skill, "The model".

## Trust the user
The user (danbri) is the project owner. Trust their instructions, corrections and domain knowledge.

## Working with the owner
Owner instructions, October 2026; the exact words and dates are in the `docklands-data-curation` skill, "Ways of
working (the owner's words)".
- Answer with the detail a GIS professional needs. Assume the owner has forgotten details, and link into the
  repositories (2026-10-05).
- Give a long answer that the owner will copy as one block: the iOS app breaks the layout (2026-10-05).
- Show results through deep links to the live pages (`?view=`, a share hash, `id=osm:`) (2026-10-05).
- Say when a release is pushed, with its live URL (2026-10-03).
- Use subagents for large tasks (2026-10-07).
- Say when the context is too full and a new session is cheaper. Write what the next session needs into the skills and
  the activity log (`cwplans/skills/docklands-data-curation/ACTIVITY-LOG.md`), not only into the chat (2026-10-07).
- Ship at once (2026-10-03: "shipping immediately to live site is fine and urgent. Don't batch things up, as live site
  is my only way to see progress."): push each working change to `main` when its checks pass; the Pages workflow
  deploys it in a few minutes. Then confirm that the live file matches the commit.

## Data policy (the cwplans exception)
The owner's normal data-ethics rules are in danbri/glitchcan-minigam `CLAUDE.md` ("Data ethics"). This project has an
exception, for the scoping, planning and prototyping phase only. Owner instruction, October 2026: "This is a special
project and we will be suspending our normal restrictions on personal org and address data while in the scoping,
planning and prototyping phase."
- The exception applied to `magpie/cwplans/` in the main repository; since the move it applies to this repository,
  which holds only this project (`cwplans/`, `docklands/`, `kgx/`, `data/`, `third_party/`, `tools/`). Company addresses, occupant
  and owner records, and postcode-level business and home data may be fetched, joined and committed here.
- The licence limit stays: never fetch or commit proprietary, restricted-licence (e.g. the VOA rating list) or virally
  licensed (copyleft / share-alike) data. Check the licence of each source before it is committed. Material with no open
  licence that the owner approved or supplied (TfL axonometric sheets, approved 2026-10-05; Canary Wharf Group printed
  maps, supplied 2026-10-06) is in `third_party/` with its README, and the Pages workflow does not publish `third_party/`
  (owner, 2026-10-07: "Repo only for now").
- OpenStreetMap (ODbL, share-alike) is allowed for now (owner, 2026-10-03: "ODbL is ok for now, and will be thoroughly
  reviewed as part of the planning and prototyping activities later. Keep track of our use of this data carefully.").
  No other share-alike source without the owner's agreement.
- Website crawls are allowed for scoping (owner, 2026-10-03: "Website crawls - direct and via IA or CommonCrawl etc are
  fair use for our scoping purposes."). This covers pages fetched directly, from the Internet Archive or from Common
  Crawl, and data extracted from them. Record each crawl in the data register with its method and date. Re-check these
  before anything leaves the prototyping phase.
- AIS from AISHub and aisstream.io (via Open Waters AIS) is accepted for scoping (owner, 2026-10-04: "Accept AISHub (and
  perhaps aisstream) events for scoping. Sounds fine. Flag it somewhere for review as we scale. Add to live by default
  now."). Review before scaling or any commercial use. Small private craft stay as counts only. The data register marks
  these sources "review".
- Every committed data file in `cwplans/` has an entry in `cwplans/data-register.json` (sources, licence, how it uses
  OSM, the OSM extract and its date). Add the entry in the same commit as the file, then run
  `node cwplans/tools/check-data-register.mjs --write`; it fails on an unregistered file and on a page that shows OSM
  data without the "© OpenStreetMap contributors" link. Readable view:
  https://github.com/danbri/londat/blob/main/cwplans/DATA-REGISTER.md
- Pipeline work is dataflow (owner, 2026-10-06: "any cleanup, data pipeline and normalization work you do or did MUST be
  expressed and logged in terms of FP-friendly operations on named graphs that (a) are the operations of tools/tasks from
  skills, upon static unchanging input named graphs"). Each step is a named operation of a skill's tool over inputs fixed
  by content hash, giving new graph versions, logged as an activity. How: the `cwplans-dataflow` skill.
- Contributed photos: do not describe or tag people; report recognisable faces and readable number plates to the owner
  (the `docklands-data-curation` skill, "Contributed photos").
- The exception ends when the project leaves the prototyping phase; the owner says when.

## RDF work: Factoidal first
Owner instruction, October 2026: "Please always try to use NPM Module Factoidal/core for RDF work, before falling back on
other software if needed." For parsing, SPARQL, ShEx/SHACL, canonicalisation and serialisation use `@factoidal/core`
(a devDependency here: `npm install`). Use rdflib, N3.js, shex.js or others only when Factoidal lacks the feature, and
say so in the tool header and the skill. Known faults and workarounds: the `cwplans-web-harvest` skill, "Factoidal
notes". After an upgrade run `node cwplans/tools/check-factoidal.mjs` (prints STILL or FIXED for each).

## Skills
Skills live next to the code they describe, at `<area>/skills/<name>/`, and are symlinked into `.claude/skills/` so the
runtime offers them. Edit the file at its home, never through the symlink. Lessons go in skills, not in code comments
(owner, August 2026: "Don't store your lessons in code, use agentskills with frontmatter."). A skill's `description`
must be 1,024 characters or fewer; the skill list cuts a longer one. `tools/check-skills.mjs` does not measure a folded
(`>-`) description (the `m` flag on its regex makes `$` match at the first line end) and has no length check: measure
with a YAML parser. On 2026-10-07 all 18 descriptions here were 1,024 characters or fewer.

    npm run skills:check                 # every SKILL.md discoverable? malformed? dangling?
    node tools/check-skills.mjs --fix    # create the missing symlinks

| skill | home | reach for it when |
|---|---|---|
| `docklands-data-curation` | `cwplans/skills/` | policy, catalogue first, the fault register, joins, rebuild order, methods, provenance, the data register, contributed photos, the activity log (start with its newest review entry: the owner's open items) |
| `docklands-3d-page` | `cwplans/docklands/skills/` | editing `cwplans/docklands/index.html` and its scripts, styles, Night mode, overlays, building keys, the headless test recipe |
| `docklands-sky` | `cwplans/docklands/skills/` | the page clock (`?t=`), sky, weather, tide, the photo-time solution |
| `photo-view-reconstruction` | `cwplans/docklands/skills/` | the owner sends a photo: landmarks, the camera solve, a `?view=` entry; the `docklands-view` MCP server (`tools/view-mcp/`) |
| `blender-station-models` | `cwplans/docklands/skills/` | station boxes in Blender through blender-mcp; models in `third_party/tfl/am3d/models/` |
| `cwplans-kgx` | `cwplans/skills/` | the knowledge graph in `kgx/`, the Shardborough store, the search page `cwplans/kg/` |
| `cwplans-dataflow` | `cwplans/skills/` | any cleanup or pipeline step: operations on immutable named graphs (`cwplans/tools/kgx-ops.mjs`) |
| `cwplans-web-harvest` | `cwplans/skills/` | crawls, headless render, store finders, JSON-LD repair, Factoidal notes, sameAs groups, opening hours, reports |
| `cwplans-public-registers` | `cwplans/skills/` | GIAS, CQC, ODS, charities, Ofsted, gambling, Active Places, FSA: licences, joins, traps |
| `cwplans-london-datastore` | `cwplans/skills/` | the London Datastore walk, triage, harvest and joins |
| `cwplans-open-portals` | `cwplans/skills/` | data.gov.uk, planning.data.gov.uk, borough portals, Nomis / ONS, national APIs |
| `cwplans-permits-and-works` | `cwplans/skills/` | permits, works, closures and what's on |
| `cwplans-construction` | `cwplans/skills/` | the index of works in progress |
| `cwplans-live-state` | `cwplans/skills/` | live state in the zone and what cannot be known |
| `cwplans-londat-cache` | `cwplans/skills/` | the hourly cache (`cwplans/cache/`, `.github/workflows/cache-live.yml`), `latest.json`, the GeoPackages |
| `cwplans-river-and-water` | `cwplans/skills/` | river, docks, locks, water quality, boats, AIS |
| `cwplans-feed-discovery` | `cwplans/skills/` | London RSS, Atom and iCal feeds at scale |
| `cwplans-crown-lighting` | `cwplans/skills/` | the coloured lighting at the tops of the towers |

Skills for other work (FINK, Lucid, splats, `container-improver` for installing tools in a cloud container) are in
danbri/glitchcan-minigam: https://github.com/danbri/glitchcan-minigam/tree/master/.claude/skills

## Layout
- `cwplans/`: the project (the old `magpie/cwplans/`, same relative paths): pages (`docklands/`, `atlas/`, `kg/`,
  `feeds/`, `registry/`, `postcodes/`, `reports/`, `index.html`, `schematic.html`), tools (`cwplans/tools/`), skills,
  the register, `pipeline.json` and the data, including the bulk extracts (`feeds/london-datastore/`, `feeds/portals/`,
  `feeds/kml/`, `coverage/`) and the hourly cache (`cache/`).
- `kgx/`: the knowledge graph (graph versions, logs, the Shardborough store). Its IDs are
  `https://kgx.foaf.tv/id/<lowercase alphanumeric>` (owner, 2026-10-07: "Use https://kgx.foaf.tv/id/ prefix for IDs. i own
  the domain; nothing is hosted there yet. iDs should be alphanumeric"); its vocabulary terms are under the same domain
  (owner, 2026-10-07: "move them to kgx.foaf.tv? Yes pls. No dereferencing needed yet"): `cwk:`
  `https://kgx.foaf.tv/vocab#`, `cwp:` `https://kgx.foaf.tv/pipeline#`, `i:` `https://kgx.foaf.tv/idioms#`; scheme and
  codes: the `cwplans-kgx` skill. `data/images/contrib/`: the owner's CC0
  photos. `third_party/`: TfL and Canary Wharf Group material and the crawl data (`cwplans-structured-data/`).
- `docklands/`: the Three.js port of the 3D page (experimental, three.js r186 in `third_party/three/`, WebGPU or WebGL 2),
  https://danbri.github.io/londat/docklands/ ; it reads the data of `cwplans/docklands/`. Skill: `docklands-3d-page`,
  "Three.js port".
- `dashboard/`: one status page for the owner, https://danbri.github.io/londat/dashboard/ (owner, 2026-10-07: "Make a
  unified dashboard url for me"): hourly cache runs, deploys, data age, knowledge graph, register, quality, the old-site
  redirect, activity. It reads the GitHub API in the browser (60 requests an hour without sign-in).
- `tools/view-mcp/`: the `docklands-view` MCP server (`.mcp.json`). `tools/check-skills.mjs`: the skills index check.
- Pages read data through `cwplans/data-base.js` (same site; only `cache/` comes from raw.githubusercontent.com, which is
  new each hour). Tools find paths through `cwplans/tools/londat.mjs`.

## Development
- `npm install` (the tools' libraries; `npm ci --omit=dev` gives only the three that the hourly fetch tools need).
- Commands run from the repository root: `node cwplans/tools/<tool>.mjs`. Rebuild order and every method:
  https://github.com/danbri/londat/blob/main/cwplans/METHODS.md
- Checks before a push: `npm run check` (the data register), `npm test` (tool tests), a headless load of each changed
  page with no page errors (the `docklands-3d-page` skill has the recipe).
- Local server: `python3 -m http.server 8080` in the repository root, then http://127.0.0.1:8080/cwplans/docklands/ .
- Headless Chromium in the cloud container: Playwright 1.56.1 (pinned to the browser in `/opt/pw-browsers/`):
  `chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })`. WebGL runs in
  software at about 2 frames per second on heavy scenes.
- Sizes: no file over 100 MB; push in batches well under 500 MB; the Pages site must stay under 1 GB (the workflow
  stops at 950 MB).
