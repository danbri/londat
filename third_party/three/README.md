# three.js (vendored)

npm package `three` 0.186.1 (r186, published 2026-09-24), from `npm pack three@0.186.1` on 2026-10-08. MIT licence
(`LICENSE`). Copied unchanged: `build/three.core.js`, `three.webgpu.js`, `three.tsl.js`, `three.module.js`, all of
`examples/jsm/`, `package.json`. Not copied: `three.cjs`, `three.webgpu.nodes.js`, `src/`, the examples' HTML and assets.

Used by the Three.js port of the Docklands 3D page, `cwplans/docklands/3js/`
(https://danbri.github.io/londat/cwplans/docklands/3js/). Unlike the rest of `third_party/`, this folder is published
by the Pages workflow (`.github/workflows/pages.yml`).

To upgrade: `npm pack three@<version>`, replace the same files, and run `node cwplans/docklands/3js/test/load.mjs`
(and with `--webgpu`). Skill: docklands-3d-page, "Three.js port".
