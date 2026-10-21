#!/usr/bin/env node
// Load hints for the 3D page (docklands/index.html): `<link rel=modulepreload>` for every module that main.js imports
// statically (with the modules they import, through the page's import map), so the browser fetches the whole module
// graph at once, beside the 5.5 MB area.js, instead of one level of imports per round trip after area.js has run; at low
// priority the layer modules (main.js LAYER_IDS, read one after another by loadLayers), the globe and the page API; and,
// for a start in the model only (not ?view=globe, ?ll=, ?place=), the data main.js reads before the boot screen goes.
// area.js (the model, 5.5 MB) is preloaded at high priority for the loader at the end of index.html, which reads it with
// fetch and JSON.parse (40 to 70 ms in Chromium, against 280 to 470 ms to compile it as a script; 2026-10-20).
// Owner, 2026-10-20: "any GH based Range request optimisation, or other perf work, would still be worthwhile as a
// stopgap". Skill: docklands-3d-page, "Load speed on Pages: the service worker".
//   node cwplans/tools/build-preload-hints.mjs [--root .] [--check]
// Writes the block between the "load hints" markers of <root>/docklands/index.html; --check exits 1 when the block is not
// up to date (it changes nothing). The Pages workflow runs it on the staged site, so the live page always has the hints
// of the deployed main.js even when the committed block is behind.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, posix } from 'node:path';

const BEGIN = '<!-- load hints: begin (cwplans/tools/build-preload-hints.mjs; the Pages workflow writes this block again at each deploy) -->';
const END = '<!-- load hints: end -->';
// data read before the boot screen goes, for a start in the model (main.js: textures.json at the top, loadOptional, loadModels)
const MODEL_DATA = [['../cwplans/docklands/data/tex/textures.json', 'fetch'], ['../cwplans/docklands/data/towers.json', 'fetch'],
  ['../cwplans/docklands/data/roofs.json', 'fetch'], ['../cwplans/docklands/data/materials.json', 'fetch'], ['../cwplans/docklands/data/tex/facades.json', 'fetch'],
  ['../cwplans/docklands/data/tex/facades.jpg', 'image'], ['../cwplans/docklands/data/building-models.json', 'fetch'], ['../cwplans/docklands/data/sky/stars.json', 'fetch']];

const AREA = '../cwplans/docklands/data/area.js';   // read by the loader at the end of index.html (fetch + JSON.parse)
const STATIC = /(?:^|[\n;{}])\s*(?:import|export)\s+(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"\n]+)['"]/g;

export function moduleGraph(root, entries, imports) {   // static import closure; paths relative to root (site root)
  const seen = new Set(), order = [];
  const resolve = (spec, from) => {
    if (spec.startsWith('./') || spec.startsWith('../')) return posix.normalize(posix.join(posix.dirname(from), spec));
    let best = null; for (const k of Object.keys(imports)) if ((k === spec || (k.endsWith('/') && spec.startsWith(k))) && (!best || k.length > best.length)) best = k;
    if (!best) return null;
    return posix.normalize(posix.join('docklands', imports[best] + spec.slice(best.length)));
  };
  const visit = p => {
    if (!p || seen.has(p)) return; seen.add(p);
    const f = join(root, p); if (!existsSync(f)) return;
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(STATIC)) visit(resolve(m[1], p));
    order.push(p);
  };
  for (const e of entries) visit(e);
  return order;   // dependencies first
}

export function hints(root = '.') {
  const html = readFileSync(join(root, 'docklands/index.html'), 'utf8');
  const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]).imports;
  const main = readFileSync(join(root, 'docklands/main.js'), 'utf8');
  const ids = (/LAYER_IDS = \(qs\.get\('layers'\) \?\? '([^']+)'\)/.exec(main) || [, ''])[1].split(',').filter(Boolean);
  const first = moduleGraph(root, ['docklands/main.js'], map);
  const lowEntries = [...ids.map(id => `docklands/layers/${id}.js`), 'docklands/globe/globe.js', 'docklands/api.js'].filter(p => existsSync(join(root, p)));
  const low = moduleGraph(root, lowEntries, map).filter(p => !first.includes(p));
  const rel = p => posix.relative('docklands', p);
  const lines = [BEGIN,
    `<link rel="preload" href="${AREA}" as="fetch" crossorigin="anonymous" fetchpriority="high">`,
    ...first.map(p => `<link rel="modulepreload" href="${rel(p)}">`),
    '<script>',
    '// layer modules, the globe and the API at low priority; the model\'s first data only for a start in the model',
    '(function () {',
    `  var low = ${JSON.stringify(low.map(rel))};`,
    `  var data = ${JSON.stringify(MODEL_DATA)};`,
    '  var away = /[?&](ll|place)=|[?&]view=globe(&|#|$)/.test(location.search), h = document.head;',
    '  function add(href, rel, as, pri) { var l = document.createElement(\'link\'); l.rel = rel; l.href = href; if (as) { l.as = as; l.crossOrigin = \'anonymous\'; } if (pri) l.setAttribute(\'fetchpriority\', pri); h.appendChild(l); }',
    '  if (!away) data.forEach(function (d) { add(d[0], \'preload\', d[1]); });',
    '  low.forEach(function (p) { add(p, \'modulepreload\', null, \'low\'); });',
    '})();',
    '</script>',
    END];
  return { block: lines.join('\n'), first: first.length, low: low.length, layers: ids.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv, arg = (k, d) => { const i = a.indexOf(k); return i > 0 ? a[i + 1] : d; };
  const root = arg('--root', '.'), file = join(root, 'docklands/index.html'), html = readFileSync(file, 'utf8');
  const { block, first, low, layers } = hints(root);
  const i = html.indexOf(BEGIN), j = html.indexOf(END);
  let out;
  if (i >= 0 && j > i) out = html.slice(0, i) + block + html.slice(j + END.length);
  else { const k = html.indexOf('</script>', html.indexOf('<script type="importmap">')) + '</script>'.length; out = html.slice(0, k) + '\n' + block + html.slice(k); }   // after the import map
  if (a.includes('--check')) { const ok = out === html; console.log(ok ? 'load hints: up to date' : 'load hints: NOT up to date (run node cwplans/tools/build-preload-hints.mjs)'); process.exit(ok ? 0 : 1); }
  if (out !== html) writeFileSync(file, out);
  console.log(`load hints: ${first} modules at start, ${low} at low priority (${layers} layers), ${MODEL_DATA.length} data files for a model start -> ${file}`);
}
