// Tests of what the Pages site leaves out (.github/workflows/pages.yml, 2026-10-20): the dataset folders of the bulk
// extracts (cwplans/feeds/london-datastore/, cwplans/feeds/portals/) are not published, cwplans/data-base.js sends their
// URLs to raw.githubusercontent.com, and the Datastore layers that pages draw stay on Pages. Skill: docklands-3d-page,
// "Load speed on Pages: the service worker" (Pages size).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const R = p => new URL('../../../' + p, import.meta.url);
const yml = readFileSync(R('.github/workflows/pages.yml'), 'utf8');
const loop = /\( cd "\$RUNNER_TEMP\/site\/cwplans\/feeds" && for d in [\s\S]*?done \)/.exec(yml)[0];
const keptInYml = [...loop.matchAll(/london-datastore\/([a-z0-9-]+)\//g)].map(m => m[1]).sort();

function cwData() {   // run data-base.js as the pages do
  const window = {}, ctx = { window, document: { currentScript: { src: 'https://danbri.github.io/londat/cwplans/data-base.js' } }, URL, fetch: null };
  vm.runInNewContext(readFileSync(R('cwplans/data-base.js'), 'utf8'), ctx);
  return window.CwData;
}

test('the kept Datastore layers are the same in pages.yml and data-base.js', () => {
  const C = cwData();
  assert.deepEqual(keptInYml, ['conservation-areas', 'cultural-infrastructure', 'designated-open-space', 'safeguarded-wharves']);
  for (const k of keptInYml) assert.equal(C.url(`feeds/london-datastore/${k}/${k}.geojson`), `https://danbri.github.io/londat/cwplans/feeds/london-datastore/${k}/${k}.geojson`);
  assert.equal(C.url('feeds/london-datastore/index.json'), 'https://danbri.github.io/londat/cwplans/feeds/london-datastore/index.json');
  assert.equal(C.url('feeds/london-datastore/air-quality/x.geojson'), 'https://raw.githubusercontent.com/danbri/londat/main/cwplans/feeds/london-datastore/air-quality/x.geojson');
  assert.equal(C.url('feeds/portals/dgu/a/a.geojson'), 'https://raw.githubusercontent.com/danbri/londat/main/cwplans/feeds/portals/dgu/a/a.geojson');
  assert.equal(C.url('feeds/portals/index.json'), 'https://danbri.github.io/londat/cwplans/feeds/portals/index.json');
  assert.equal(C.url('cache/latest.json'), 'https://raw.githubusercontent.com/danbri/londat/main/cwplans/cache/latest.json');
  assert.equal(C.url('docklands/data/area.js'), 'https://danbri.github.io/londat/cwplans/docklands/data/area.js');
});

test('the staging loop of pages.yml removes the dataset folders and keeps the rest', () => {
  const root = mkdtempSync(join(tmpdir(), 'pages-')), feeds = join(root, 'site/cwplans/feeds');
  try {
    for (const p of ['london-datastore/index.json', 'london-datastore/lds-building.js', 'london-datastore/air-quality/a.json', 'london-datastore/conservation-areas/conservation-areas.geojson',
      'london-datastore/cultural-infrastructure/x.json', 'portals/index.json', 'portals/dgu/d/d.geojson', 'river/ais.json']) { mkdirSync(join(feeds, p, '..'), { recursive: true }); writeFileSync(join(feeds, p), '1'); }
    execFileSync('bash', ['-c', loop], { env: { ...process.env, RUNNER_TEMP: root } });
    for (const p of ['london-datastore/index.json', 'london-datastore/lds-building.js', 'london-datastore/conservation-areas/conservation-areas.geojson', 'london-datastore/cultural-infrastructure/x.json', 'portals/index.json', 'river/ais.json'])
      assert.ok(existsSync(join(feeds, p)), 'kept ' + p);
    for (const p of ['london-datastore/air-quality', 'portals/dgu']) assert.ok(!existsSync(join(feeds, p)), 'left out ' + p);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('page code names no left-out folder directly (only through CwData.url, which reads it from raw.githubusercontent.com)', () => {
  const files = execFileSync('git', ['ls-files', '*.html', '*.js'], { cwd: R('.'), encoding: 'utf8' }).split('\n')
    .filter(f => f && !/^(cwplans\/tools|tools|third_party|kgx)\/|\/test\/|\/node_modules\//.test(f));
  const bad = [];
  for (const f of files) {
    const src = readFileSync(R(f), 'utf8');
    for (const m of src.matchAll(/['"`](?:[^'"`\s]*\/)?(?:feeds\/)?(london-datastore|portals)\/([a-z0-9-]+)\/[^'"`\s]*['"`]/g)) {
      if (m[1] === 'london-datastore' && keptInYml.includes(m[2])) continue;
      if (/github\.com\/danbri\/londat\/(blob|tree)\//.test(m[0])) continue;   // links to the repository
      bad.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, []);
});
