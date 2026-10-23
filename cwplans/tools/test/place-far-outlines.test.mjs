// Tests of cwplans/tools/place-far-outlines.mjs (operation place-far-outlines, coordinator 2026-10-23: the Tempelhof terminal
// was one solid slab at the first city block level): glb read and repack keep every accessor and image; on the committed
// León set the level-13 boxes that fill less than 0.7 of their oriented box were replaced by their outlines (counted in
// provenance/far-outlines-counts.json and glb extras.blocks.far_outlines), and a second run changes nothing.
// Skill docklands-3d-page, "Far views".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, outlinesOf, replaceBoxes } from '../place-far-outlines.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docklands', 'data', 'places', 'leon');
test('readGlb and writeGlb: a round trip keeps the accessors, images and their bytes', () => {
  const f = readdirSync(join(DIR, 'tiles')).find(x => x.startsWith('14-')), b = readFileSync(join(DIR, 'tiles', f)), G = readGlb(b), b2 = writeGlb(readGlb(b)), G2 = readGlb(b2);
  assert.equal(G2.J.accessors.length, G.J.accessors.length);
  for (let i = 0; i < G.J.accessors.length; i++) assert.ok(G.views[G.J.accessors[i].bufferView].equals(G2.views[G2.J.accessors[i].bufferView]), 'accessor ' + i);
  assert.ok(Math.abs(b2.length - b.length) < 64, `${b.length} -> ${b2.length}`);
});
test('León: the far outlines are in the level-13 tiles, and a second run replaces nothing', { skip: !existsSync(join(DIR, 'provenance', 'far-outlines-counts.json')) }, () => {
  const C = JSON.parse(readFileSync(join(DIR, 'provenance', 'far-outlines-counts.json'), 'utf8'));
  let n = 0, one = null; for (const f of readdirSync(join(DIR, 'tiles')).filter(x => x.startsWith('13-'))) { const G = readGlb(readFileSync(join(DIR, 'tiles', f))), k = G.J.extras?.blocks?.far_outlines || 0; n += k; if (k && !one) one = f; }
  assert.equal(n, C.replaced_by_outlines); assert.ok(n > 0);
  const G = readGlb(readFileSync(join(DIR, 'tiles', one))), O = outlinesOf(G);
  assert.equal(O.length, G.J.extras.blocks.outlines.tri_end.length); assert.ok(O.every(o => o.area > 0));
  // nothing left to replace in that tile: its children give no low-fill box any more (with no children, nothing at all)
  assert.equal(replaceBoxes(readFileSync(join(DIR, 'tiles', one)), []).replaced, 0);
});
