// Tests of the range-read archive prototype: cwplans/tools/pack-range-archive.mjs (packer), cwplans/tools/range-server.mjs
// (local server with Range), docklands/geo/range-archive.js (reader). Hosting study: docs/hosting-options.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packFolder, orderPaths, morton } from '../pack-range-archive.mjs';
import { startRangeServer, parseRange } from '../range-server.mjs';
import { openRangeArchive, archiveFetchJson } from '../../../docklands/geo/range-archive.js';
import { openSkeleton } from '../../../docklands/geo/skeleton.js';

test('parseRange: forms of the Range header', () => {
  assert.deepEqual(parseRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-500', 100), { start: 0, end: 99 });
  assert.equal(parseRange('bytes=200-300', 100), 'bad');
  assert.equal(parseRange('bytes=0-1,5-6', 100), null);   // multi-range: whole file
  assert.equal(parseRange(undefined, 100), null);
});

test('orderPaths: folders, then cells by Morton code, last entry at the end', () => {
  assert.equal(morton(1, 0), 1n); assert.equal(morton(0, 1), 2n); assert.equal(morton(3, 3), 15n);
  const o = orderPaths(['b/1-1.json', 'b/0-0.json', 'b/1-0.json', 'a/x.json', 'manifest.json', 'b/0-1.json', 'b/notes.md'], 'manifest.json');
  assert.deepEqual(o, ['a/x.json', 'b/0-0.json', 'b/1-0.json', 'b/0-1.json', 'b/1-1.json', 'b/notes.md', 'manifest.json']);
});

test('pack, serve with Range, read: bytes equal, requests batched, suffix fallback, deterministic', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rarch-')), src = join(dir, 'src');
  try {
    const files = {};
    for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) files[`layers/a/8/${x}-${y}.json`] = JSON.stringify({ x, y, pad: 'q'.repeat(200 + x * 37 + y) });
    files['manifest.json'] = JSON.stringify({ id: 't', n: 36 }); files['bin/r.bin'] = Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 7919) & 255));
    for (const [p, d] of Object.entries(files)) { mkdirSync(join(src, p, '..'), { recursive: true }); writeFileSync(join(src, p), d); }
    const A = packFolder(src, { last: 'manifest.json' }), B = packFolder(src, { last: 'manifest.json' });
    assert.equal(A.report.sha256, B.report.sha256, 'same input, same archive');
    assert.equal(A.report.files, 38);
    writeFileSync(join(dir, 'a.zip'), A.zip);
    const srv = await startRangeServer({ root: dir, port: 0 });
    try {
      const ar = await openRangeArchive(srv.url + '/a.zip', { tail: 512 });
      assert.equal(ar.stats.requests >= 1 && ar.stats.requests <= 2, true);
      const before = ar.stats.requests;
      const names = Object.keys(files).filter(n => n.startsWith('layers/'));
      const got = await Promise.all(names.map(n => ar.text(n)));
      names.forEach((n, i) => assert.equal(got[i], files[n], n));
      assert.equal(ar.stats.requests - before, 1, 'one tick of reads, one range request');
      assert.deepEqual(Buffer.from(await ar.bytes('bin/r.bin')), files['bin/r.bin']);
      // a host whose CORS preflight refuses suffix ranges: HEAD for the size, then an explicit range
      const noSuffix = (u, o = {}) => /bytes=-/.test(o.headers?.Range || '') ? Promise.reject(new TypeError('Failed to fetch')) : fetch(u, o);
      const ar2 = await openRangeArchive(srv.url + '/a.zip', { fetch: noSuffix });
      assert.equal(await ar2.text('layers/a/8/3-4.json'), files['layers/a/8/3-4.json']);
      // the manifest packed last comes with the opening tail: no extra request
      const n0 = ar2.stats.requests; assert.equal((await ar2.json('manifest.json')).n, 36); assert.equal(ar2.stats.requests, n0);
    } finally { await srv.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('UK skeleton read through the archive gives the same answers as the files', async () => {
  const base = new URL('../../docklands/data/uk/', import.meta.url);
  const dir = mkdtempSync(join(tmpdir(), 'rarch-uk-'));
  try {
    const { zip } = packFolder(base.pathname, { last: 'manifest.json', exclude: /^(log\.json|README\.md)$/ });
    writeFileSync(join(dir, 'uk.zip'), zip);
    const srv = await startRangeServer({ root: dir, port: 0 });
    try {
      const ar = await openRangeArchive(srv.url + '/uk.zip');
      const ROOT = 'https://example.invalid/uk/';
      const viaZip = await openSkeleton(ROOT, { fetchJson: archiveFetchJson(ar, ROOT, { fallback: u => { throw new Error('not in archive ' + u); } }) });
      const viaFiles = await openSkeleton(base.href, { fetchJson: async u => JSON.parse(readFileSync(new URL(u))) });
      const bbox = [-0.6, 51.2, 0.4, 51.8];
      for (const layer of ['roads', 'rivers', 'places']) {
        const a = await viaZip.features(layer, bbox, 8), b = await viaFiles.features(layer, bbox, 8);
        assert.equal(a.length, b.length, layer); assert.deepEqual(a.map(f => f.id), b.map(f => f.id));
      }
      const [hz] = await viaZip.search('Leeds', { limit: 1 }), [hf] = await viaFiles.search('Leeds', { limit: 1 });
      assert.equal(hz.name, hf.name); assert.equal(hz.lon, hf.lon);
    } finally { await srv.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
