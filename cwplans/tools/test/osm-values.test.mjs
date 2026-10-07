import { test } from 'node:test';
import assert from 'node:assert/strict';
import { osmList, unitLabel } from '../osm-values.mjs';

test('osmList splits ";" lists and trims', () => {
  assert.deepEqual(osmList('E14 9DT;E14 9FQ'), ['E14 9DT', 'E14 9FQ']);
  assert.deepEqual(osmList('E14 5AB'), ['E14 5AB']);
  assert.deepEqual(osmList(' 0 ; 1 '), ['0', '1']);
  assert.deepEqual(osmList('-3;-2'), ['-3', '-2']);
  assert.deepEqual(osmList('a;;b'), ['a', 'b']);
  assert.deepEqual(osmList(''), []);
  assert.deepEqual(osmList(undefined), []);
});

test('unitLabel adds "Unit" only to a bare designator', () => {
  assert.equal(unitLabel('14'), 'Unit 14');
  assert.equal(unitLabel('14a'), 'Unit 14a');
  assert.equal(unitLabel('R12'), 'Unit R12');
  assert.equal(unitLabel('LG06'), 'Unit LG06');
  assert.equal(unitLabel('5-6'), 'Unit 5-6');
  assert.equal(unitLabel('Unit 14'), 'Unit 14');
  assert.equal(unitLabel('unit  14'), 'unit 14');
  assert.equal(unitLabel('Units 5-6'), 'Units 5-6');
  assert.equal(unitLabel('Kiosk 3'), 'Kiosk 3');
  assert.equal(unitLabel('Lower Mall'), 'Lower Mall');
  assert.equal(unitLabel(''), null);
  assert.equal(unitLabel(null), null);
});

import { osmLevels, osmLevelsUnread } from '../osm-values.mjs';
test('osmLevels reads lists, ranges, fractions and comma lists', () => {
  assert.deepEqual(osmLevels('0'), [0]);
  assert.deepEqual(osmLevels('0;1'), [0, 1]);
  assert.deepEqual(osmLevels('-3;-2'), [-3, -2]);
  assert.deepEqual(osmLevels('-1,0'), [-1, 0]);
  assert.deepEqual(osmLevels('0,-1,-2,-3,-4'), [-4, -3, -2, -1, 0]);
  assert.deepEqual(osmLevels('0-2'), [0, 1, 2]);
  assert.deepEqual(osmLevels('-2--1'), [-2, -1]);
  assert.deepEqual(osmLevels('0.5'), [0.5]);
  assert.deepEqual(osmLevels('0;0.5'), [0, 0.5]);
  assert.deepEqual(osmLevels('G'), []);
  assert.deepEqual(osmLevels(undefined), []);
  assert.deepEqual(osmLevelsUnread('0;G;roof'), ['G', 'roof']);
  assert.deepEqual(osmLevelsUnread('0;1'), []);
});
