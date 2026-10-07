import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cwgFields, cwgLevelNum, nameKeys } from '../../registry/sources/brands/tools/cwg-fields.mjs';

test('cwgFields: level lines only', () => {
  assert.equal(cwgFields(['Mall Level -1', 'Cabot Place', 'Canary Wharf', 'London', 'E14 4QS']).level, 'Mall Level -1');
  assert.equal(cwgFields(['Lower Mall -2', 'Jubilee Place', 'E14 5NY']).level, 'Lower Mall -2');
  assert.equal(cwgFields(['Mezzanine', 'Jubilee Place']).level, 'Mezzanine');
  assert.equal(cwgFields(['- 1 Level', 'Canada Place']).level, '- 1 Level');
  // the first parser read these as levels
  assert.equal(cwgFields(['55 Upper Bank Street', 'Canary Wharf', 'London', 'E14 5GR']).level, null);
  assert.equal(cwgFields(['55 Harbord Square', 'London', 'United Kingdom', 'E14 9QH']).level, null);
});

test('cwgFields: mall is never a name inside a longer name', () => {
  assert.equal(cwgFields(['55 Upper Bank Street', 'Canary Wharf', 'E14 5GR']).mall, 'Upper Bank Street');
  assert.equal(cwgFields(['40 Bank Street', 'Canary Wharf']).mall, 'Bank Street');
  assert.equal(cwgFields(['Mall level -1', 'One Canada Square', 'Canary Wharf']).mall, 'One Canada Square');
  assert.equal(cwgFields(['Level –2', 'Cabot Place Mall', 'Canary Wharf']).mall, 'Cabot Place');
  assert.equal(cwgFields(['30 S Colonnade', 'London', 'United Kingdom', 'E14 5HX']).mall, 'South Colonnade');
  assert.equal(cwgFields(['Level –2', '10 George Street', 'Wood Wharf']).mall, 'Wood Wharf');
});

test('cwgFields: postcodes in any district, street lines, flags', () => {
  assert.equal(cwgFields(['Union Square', 'Canary Wharf', 'E22 3AA']).postcode, 'E22 3AA');
  assert.equal(cwgFields(['Mall Level -1', 'Cabot Place', 'E14']).postcode, null);
  assert.equal(cwgFields(['Mall Level -1', 'Cabot Place', 'E14']).district, 'E14');
  assert.equal(cwgFields(['Mall Level -1', '16-19 Canada Square', 'E14 5EQ']).street, '16-19 Canada Square');
  assert.equal(cwgFields(['One Cabot Square', 'Canary Wharf', 'E14 4QJ']).street, 'One Cabot Square');
  assert.equal(cwgFields(['Mall Level -1', 'Cabot Place']).street, null);
  assert.deepEqual(cwgFields(['field_692d85e5bb6ad', 'Cabot Place', 'E14 4QS']).flags, ['template field in address']);
  assert.deepEqual(cwgFields(['Throughout the Estate', 'Canary Wharf']).flags, ['estate-wide']);
  assert.deepEqual(cwgFields(['Car Park', 'Cabot Place', 'E14 4AP']).flags, ['car park']);
});

test('cwgLevelNum', () => {
  assert.equal(cwgLevelNum('Mall Level -1'), -1);
  assert.equal(cwgLevelNum('Level –2'), -2);
  assert.equal(cwgLevelNum('- 1 Level'), -1);
  assert.equal(cwgLevelNum('Upper Level 2'), 2);
  assert.equal(cwgLevelNum('Street Level 0'), 0);
  assert.equal(cwgLevelNum('Mezzanine'), null);
});

test('nameKeys: punctuation, accents, "&", and branch suffixes that name a place', () => {
  assert.ok(nameKeys("Café Brera – Cabot Place").includes('cafe brera'));
  assert.ok(nameKeys('Badiani Gelato At Cabot Place').includes('badiani gelato'));
  assert.ok(nameKeys('Hawksmoor Wood Wharf').includes('hawksmoor'));
  assert.ok(nameKeys('Ultimate Performance, Wood Wharf').includes('ultimate performance'));
  assert.ok(nameKeys("Ted's Grooming Room – Churchill Place").includes('teds grooming room'));
  assert.ok(nameKeys('Flowers & Plants Co.').includes('flowers and plants co'));
  assert.ok(nameKeys('The White Company').includes('white company'));
  // a suffix that is not a place stays
  assert.deepEqual(nameKeys('Humble Grape – Wine Bar'), ['humble grape wine bar']);
  // "London" is part of brand names ("Wax London"): not stripped
  assert.deepEqual(nameKeys('Wax London'), ['wax london']);
  assert.deepEqual(nameKeys(''), []);
});
