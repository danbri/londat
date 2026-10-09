import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { predict, extremes, argsAt, CONSTITUENTS } from '../../../docklands/tide.js';

// docklands/data/sky/tide-harmonics.json (tools/fit-tide-harmonics.mjs) against the page's prediction code (docklands/tide.js)
const CW = new URL('../../', import.meta.url).pathname;
const J = JSON.parse(readFileSync(CW + 'docklands/data/sky/tide-harmonics.json', 'utf8'));
const REQUIRED = ['M2', 'S2', 'N2', 'K2', 'K1', 'O1', 'P1', 'M4', 'MS4', 'MN4', 'M6'];

test('three gauges, the required constituents, a licence and attribution', () => {
  assert.deepEqual(Object.keys(J.stations).sort(), ['0001', '0003', '0007']);
  assert.equal(J.licence, 'OGL v3.0'); assert.match(J.attribution, /Environment Agency/);
  for (const [id, S] of Object.entries(J.stations)) {
    for (const k of REQUIRED) assert.ok(S.h[k], `${id} has ${k}`);
    for (const k of Object.keys(S.h)) assert.ok(CONSTITUENTS[k], `${id}: ${k} is known to the page`);
    assert.ok(S.h.M2[0] > 2 && S.h.M2[0] < 3, `${id}: M2 amplitude ${S.h.M2[0]} m (London Thames: about 2.5 m)`);
  }
});

test('the page code gives the check values of the fit tool', () => {
  for (const row of J.check) J.check_columns.slice(1).forEach((id, i) => assert.ok(Math.abs(predict(J.stations[id], Date.parse(row[0])) - row[i + 1]) < 1e-3, `${id} ${row[0]}`));
});

test('fit quality: rms under 0.35 m in the fit and on the held-out days', () => {
  for (const [id, S] of Object.entries(J.stations)) {
    assert.ok(S.fit.rms < 0.35, `${id} fit rms ${S.fit.rms}`);
    for (const v of S.validation) assert.ok(v.rms < 0.35, `${id} held out ${v.from}: rms ${v.rms}`);
  }
});

test('two high and two low waters a day, spring range 5.5 to 7.5 m at Charlton', () => {
  const S = J.stations['0003'], X = extremes(S, Date.parse('2026-10-11T00:00Z'), Date.parse('2026-10-12T00:00Z'));
  assert.ok(X.filter(e => e.hw).length >= 1 && X.filter(e => e.hw).length <= 2 && X.filter(e => !e.hw).length >= 1 && X.filter(e => !e.hw).length <= 2, JSON.stringify(X));
  const hw = Math.max(...X.map(e => e.v)), lw = Math.min(...X.map(e => e.v));
  assert.ok(hw - lw > 5.5 && hw - lw < 7.5, `range ${hw - lw}`);
});

test('nodal factors stay near 1 and S2 has none', () => {
  const A = argsAt(Date.parse('2026-10-09T00:00Z'));
  assert.equal(A.S2.f, 1); assert.ok(Math.abs(A.M2.f - 1) < 0.05); assert.ok(A.K1.f > 0.85 && A.K1.f < 1.15); assert.ok(A.O1.f > 0.75 && A.O1.f < 1.25);
});
