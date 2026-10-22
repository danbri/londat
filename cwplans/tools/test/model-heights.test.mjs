import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'vm';
import { heightFromStoreys, useOf, skipped, storeysOf, fitStoreyRule, PRIOR } from '../storey-heights.mjs';

// tools/storey-heights.mjs (the rule) and area.js as tools/model-heights.mjs left it (F52)
const CW = new URL('../../', import.meta.url).pathname;
const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(CW + 'docklands/data/area.js', 'utf8'), ctx); const A = ctx.DOCKLANDS_AREA;
const keys = JSON.parse(readFileSync(CW + 'docklands/data/building-keys.json', 'utf8')), ids = keys.ids.split(',');
const byOsm = id => ids.indexOf(id);

test('storey rule: uses, kinds left alone, storeys, plant storeys', () => {
  assert.equal(useOf('apartments'), 'residential'); assert.equal(useOf('part:office'), 'office'); assert.equal(useOf('yes'), 'mixed'); assert.equal(useOf('yes;retail'), 'retail');
  assert.ok(skipped('construction') && skipped('part:elevator') && !skipped('office'));
  assert.equal(storeysOf('6'), 6); assert.equal(storeysOf('5;6'), 5); assert.equal(storeysOf('0'), null); assert.equal(storeysOf('x'), null);
  const u = { residential: { base: 4, typical: 3, plant_every: 30 } };
  assert.equal(heightFromStoreys(1, 'residential', u), 4); assert.equal(heightFromStoreys(30, 'residential', u), 4 + 3 * 30);
});

test('storey fit: recovers base and typical from exact samples; too few keeps the prior', () => {
  const S = []; for (let n = 1; n <= 40; n++) S.push({ use: 'office', n, h: 5 + 4 * (n - 1 + Math.floor(n / 20)) });
  const { uses, fitted } = fitStoreyRule(S);
  assert.equal(uses.office.base, 5); assert.equal(uses.office.typical, 4); assert.equal(fitted.office.mean_abs_m, 0);
  const few = fitStoreyRule(S.slice(0, 5)); assert.deepEqual(few.uses.office, PRIOR.office);
});

test('area.js: the rule ran, its record, the named buildings', () => {
  const H = A.meta.heightRule; assert.ok(H, 'meta.heightRule');
  assert.equal(A.meta.buildingHeightSources.join(), 'lidar,levels,tag,guess,newer,storeys');
  const tdp = A.buildings[byOsm('w1428008978')], ds = A.buildings[byOsm('w1427207669')], cp = A.buildings[byOsm('w988728458')];
  assert.ok(tdp.h >= 24 && tdp.h <= 29 && tdp.s === 5, `Three Deal Porters ${tdp.h} m (photo: 25 to 28 m)`);
  assert.ok(ds.h > 19 && ds.s === 1, `Dock Shed ${ds.h} m`);
  assert.ok(cp.b > 0 && cp.b + cp.h > 190 && cp.b + cp.h < 240, `Consort Place tower top ${cp.b + cp.h} m OD (photo: 216 +- 15)`);
  for (const [i, [b, h, s]] of Object.entries(H.before)) { const x = A.buildings[+i]; assert.ok(x.h !== h || x.b !== b || x.s !== s, `building ${i} listed as changed`); }
  for (const i of H.flagged.i) assert.ok([0, 3].includes(A.buildings[i].s), `flagged building ${i} keeps its old class`);
});
