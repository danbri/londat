// Tests of the load-speed tools of the 3D page: cwplans/tools/build-sw-manifest.mjs (the hash manifest of
// docklands/sw.js) and cwplans/tools/build-preload-hints.mjs (the modulepreload block of docklands/index.html). The
// service worker itself is checked headless by docklands/test/sw-check.mjs. Skill: docklands-3d-page, "Load speed on
// Pages: the service worker".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildManifest } from '../build-sw-manifest.mjs';
import { moduleGraph } from '../build-preload-hints.mjs';

const put = (root, p, d) => { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), d); };

test('sw manifest: the app, three.js and the data, by SHA-256; no tests, notes or the worker itself', () => {
  const root = mkdtempSync(join(tmpdir(), 'swm-'));
  try {
    put(root, 'docklands/main.js', 'x'); put(root, 'docklands/test/t.mjs', 't'); put(root, 'docklands/test/a.js', 'a'); put(root, 'docklands/README.md', '#');
    put(root, 'docklands/sw.js', 's'); put(root, 'docklands/sw-manifest.json', '{}'); put(root, 'third_party/three/build/three.core.js', 'c');
    put(root, 'cwplans/docklands/data/area.js', 'A'); put(root, 'cwplans/docklands/data/uk/layers/roads/3/1-2.json', '[]');
    put(root, 'cwplans/feeds/london-datastore/big/big.json', 'B'); put(root, 'cwplans/feeds/london-datastore/conservation-areas/conservation-areas.geojson', 'G');
    const m = buildManifest(root, { version: 'v9' });
    assert.equal(m.version, 'v9');
    assert.deepEqual(Object.keys(m.files).sort(), ['cwplans/docklands/data/area.js', 'cwplans/docklands/data/uk/layers/roads/3/1-2.json',
      'cwplans/feeds/london-datastore/conservation-areas/conservation-areas.geojson', 'docklands/main.js', 'third_party/three/build/three.core.js']);
    assert.equal(m.files['docklands/main.js'], createHash('sha256').update('x').digest('hex').slice(0, 16));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('load hints: the static import closure through the import map, dependencies first', () => {
  const root = mkdtempSync(join(tmpdir(), 'hints-'));
  try {
    put(root, 'docklands/main.js', "import * as T from 'three/webgpu';\nimport { a } from './a.js';\nconst later = () => import('./lazy.js');\n");
    put(root, 'docklands/a.js', "export { b } from './geo/b.js';\nimport {\n  OrbitControls\n} from 'three/addons/controls/OrbitControls.js';\nexport const a = 1;");
    put(root, 'docklands/geo/b.js', 'export const b = 2;'); put(root, 'docklands/lazy.js', '');
    put(root, 'third_party/three/build/three.webgpu.js', "import { X } from './three.core.js';"); put(root, 'third_party/three/build/three.core.js', '');
    put(root, 'third_party/three/examples/jsm/controls/OrbitControls.js', "import { Controls } from 'three';");
    const map = { three: '../third_party/three/build/three.webgpu.js', 'three/webgpu': '../third_party/three/build/three.webgpu.js', 'three/addons/': '../third_party/three/examples/jsm/' };
    assert.deepEqual(moduleGraph(root, ['docklands/main.js'], map), ['third_party/three/build/three.core.js', 'third_party/three/build/three.webgpu.js',
      'docklands/geo/b.js', 'third_party/three/examples/jsm/controls/OrbitControls.js', 'docklands/a.js', 'docklands/main.js']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('load hints in docklands/index.html: every file named exists (a stale hint would cost a 404)', () => {
  const html = readFileSync(new URL('../../../docklands/index.html', import.meta.url), 'utf8');
  const block = /<!-- load hints: begin[\s\S]*?<!-- load hints: end -->/.exec(html);
  assert.ok(block, 'the load hints block is in index.html');
  const hrefs = [...block[0].matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  const listed = [...block[0].matchAll(/var (?:low|data) = (\[.*\]);/g)].flatMap(m => JSON.parse(m[1]).map(x => Array.isArray(x) ? x[0] : x));
  assert.ok(hrefs.length > 10 && listed.length > 10);
  for (const h of [...hrefs, ...listed]) assert.ok(existsSync(new URL('../../../docklands/' + h, import.meta.url)), h);
});
