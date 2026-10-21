// Checks of the committed landmark set of Sarajevo (cwplans/tools/build-place-landmarks.mjs; skill docklands-3d-page,
// "Landmarks: minarets, domes and towers (2026-10-22)"): mapped and estimated minarets kept apart and counted, every
// estimated row names its rule, the tiles named in the tileset exist and carry both primitives' rows, the core parts to
// hide exist in the core's features.json, Gazi Husrev-beg's minaret is mapped (47 m, OSM height).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const D = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docklands', 'data', 'places');
const J = JSON.parse(readFileSync(join(D, 'sarajevo', 'landmarks', 'landmarks.json'), 'utf8'));
const rows = J.rows.map(r => Object.fromEntries(J.rows_fields.map((f, i) => [f, r[i]])));

test('mapped and estimated minarets are distinct and counted', () => {
  const mn = rows.filter(r => r.type === 'minaret'), m = mn.filter(r => r.source === 'mapped'), e = mn.filter(r => r.source === 'estimated');
  assert.equal(m.length + e.length, mn.length);
  assert.equal(m.length, J.counts.minarets_drawn.mapped); assert.equal(e.length, J.counts.minarets_drawn.estimated);
  for (const r of e) { assert.match(r.position, /^rule: /); assert.match(r.height_source, /^rule \(size class [SML]/); assert.ok(!/^[nwr]\d+$/.test(r.id), 'an estimated minaret has no OSM id of its own'); }
  for (const r of m) assert.match(r.id, /^[nwr]\d+$/);
});

test('Gazi Husrev-beg Mosque: its minaret is mapped, 47 m from OSM, with its domes', () => {
  const g = rows.find(r => r.type === 'minaret' && r.name === 'Gazi Husrev-begova džamija');
  assert.ok(g); assert.equal(g.source, 'mapped'); assert.equal(g.height_m, 47); assert.equal(g.height_source, 'OSM height');
  assert.ok(rows.filter(r => r.type === 'dome' && r.of === g.of).length >= 5);
});

test('tiles of the tileset exist; hide_core ids are core buildings', () => {
  const ts = JSON.parse(readFileSync(join(D, 'sarajevo', 'landmarks', 'tileset.json'), 'utf8'));
  for (const c of ts.root.children) assert.ok(existsSync(join(D, 'sarajevo', 'landmarks', c.content.uri)), c.content.uri);
  const fj = JSON.parse(readFileSync(join(D, 'sarajevo', 'features.json'), 'utf8')), ix = fj.buildings_fields.indexOf('osm_id'), ids = new Set(fj.buildings.filter(Boolean).map(b => b[ix]));
  for (const id of J.hide_core) assert.ok(ids.has(id), id);
});

test('heights: every drawn landmark stands on the ground with its top above it', () => {
  for (const r of rows.filter(r => r.type !== 'worship')) { assert.ok(r.ground_h > 400 && r.ground_h < 1200, `${r.id} ground ${r.ground_h}`); assert.ok(r.top_h > r.ground_h + 5, `${r.id} top ${r.top_h}`); }
});
