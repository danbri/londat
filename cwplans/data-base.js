// Where the pages of cwplans read their data. Since 2026-10-07 the pages and all the data are in danbri/londat and one
// GitHub Pages site serves them (https://danbri.github.io/londat/), so a path relative to cwplans/ is read from the same
// site, next to this file (or from a local server: python3 -m http.server in the repository root). One exception: cache/
// (cache/latest.json, written each hour by .github/workflows/cache-live.yml) is read from raw.githubusercontent.com,
// because the Pages site is deployed when code or data change, not after each hourly cache commit
// (.github/workflows/pages.yml). raw.githubusercontent.com sends Access-Control-Allow-Origin: * and caches about 5 minutes.
// Tools use tools/londat.mjs. History (the bulk files were in londat while the pages were in danbri/glitchcan-minigam,
// 2026-10-05 to 2026-10-07): skill docklands-data-curation, "Data hosted in danbri/londat".
//   CwData.url('feeds/london-datastore/index.json') -> the URL to fetch (a path relative to cwplans/)
//   await CwData.json(path) -> the parsed JSON (a name ending in .gz is gunzipped with DecompressionStream)
(function () {
  const PAGES = 'https://danbri.github.io/londat/cwplans/';
  const RAW = 'https://raw.githubusercontent.com/danbri/londat/main/cwplans/';
  // this page's own base (the cwplans folder)
  const here = (document.currentScript && document.currentScript.src) ? new URL('.', document.currentScript.src).href : PAGES;
  const DATA_BASE = here;
  const FRESH = /^cache\//;   // new each hour on raw.githubusercontent.com; the Pages copy is as old as the last deploy
  // The bulk extracts are not on the Pages site since 2026-10-20 (.github/workflows/pages.yml leaves out the dataset
  // folders of feeds/london-datastore/ and feeds/portals/: 180 MB in 392 files that no page reads at start; the atlas links them and
  // maps one on a tap): read them from raw.githubusercontent.com. The four Datastore layers that the 3D pages draw stay
  // on Pages; keep this list equal to the one in pages.yml (cwplans/tools/test/pages-site.test.mjs checks it).
  const REPO_ONLY = /^feeds\/(london-datastore|portals)\/[^/]+\//;
  const ON_PAGES = /^feeds\/london-datastore\/(conservation-areas|designated-open-space|safeguarded-wharves|cultural-infrastructure)\//;
  const hosted = path => FRESH.test(path) || (REPO_ONLY.test(path) && !ON_PAGES.test(path));   // true for a path read from raw.githubusercontent.com
  const url = path => (hosted(path) ? RAW : DATA_BASE) + path;
  async function json(path) {
    const u = url(path), r = await fetch(u);
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    if (!/\.gz$/.test(path)) return r.json();
    return JSON.parse(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text());
  }
  window.CwData = { base: DATA_BASE, pages: PAGES, raw: RAW, hosted, url, json };
})();
