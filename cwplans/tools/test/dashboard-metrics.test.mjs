// Unit tests of dashboard/metrics.js (the KR5.1 and KR5.2 numbers of https://danbri.github.io/londat/dashboard/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
const M = createRequire(import.meta.url)('../../../dashboard/metrics.js');
const T = s => Date.parse(s), MIN = 60e3;

test('runTime reads run file paths and commit messages', () => {
  assert.equal(M.runTime('2026-10-21/live-2026-10-21T0139Z.json.gz'), T('2026-10-21T01:39:00Z'));
  assert.equal(M.runTime('cache: live state 2026-10-21T01:39Z'), T('2026-10-21T01:39:00Z'));
  assert.ok(Number.isNaN(M.runTime('2026-10-21')));
});

test('runsPerDay counts per UTC day, today partial, and the days that reach the target', () => {
  const now = T('2026-10-21T02:30:00Z');
  const tree = [{ path: '2026-10-19', type: 'tree' }];
  for (let h = 0; h < 22; h++) tree.push({ path: `2026-10-20/live-2026-10-20T${String(h).padStart(2, '0')}17Z.json.gz`, type: 'blob' });
  for (let h = 0; h < 5; h++) tree.push({ path: `2026-10-19/live-2026-10-19T${String(h).padStart(2, '0')}17Z.json.gz`, type: 'blob' });
  tree.push({ path: '2026-10-21/live-2026-10-21T0117Z.json.gz', type: 'blob' }, { path: '2026-10-01/live-2026-10-01T0117Z.json.gz', type: 'blob' });
  const r = M.runsPerDay(M.runTimesFromTree(tree), { now, days: 14 });
  assert.equal(r.days.length, 14);
  assert.deepEqual(r.days.at(-1), { day: '2026-10-21', n: 1, partial: true, hours: 2.5 });
  assert.equal(r.days.at(-2).n, 22); assert.equal(r.days.at(-3).n, 5);
  assert.equal(r.days[0].day, '2026-10-08');   // 2026-10-01 is outside the 14 days
  assert.equal(r.full, 13); assert.equal(r.met, 1); assert.equal(r.min, 0);
});

test('runTimesFromCommits keeps only the hourly cache commits', () => {
  const t = M.runTimesFromCommits([{ msg: 'cache: live state 2026-10-20T10:17Z' }, { msg: 'Dashboard: KR5.1' }, { message: 'cache: live state 2026-10-20T11:17Z\n\nbody' }]);
  assert.deepEqual(t, [T('2026-10-20T10:17:00Z'), T('2026-10-20T11:17:00Z')]);
});

test('gaps: samples every 5 min have no gap; a 30 min hole and the open end count', () => {
  const to = T('2026-10-21T02:00:00Z'), from = to - 120 * MIN;
  const even = []; for (let t = from - 2 * MIN; t <= to; t += 5 * MIN) even.push(t);
  const g0 = M.gaps(even, { from, to });
  assert.equal(g0.gaps.length, 0); assert.equal(g0.pct, 0); assert.equal(g0.median, 5 * MIN);
  const holed = even.filter(t => t < from + 40 * MIN || t > from + 70 * MIN);   // about 35 min without a sample
  const g1 = M.gaps(holed, { from, to });
  assert.equal(g1.gaps.length, 1); assert.ok(g1.gaps[0].ms > 30 * MIN && g1.gaps[0].ms <= 35 * MIN); assert.ok(g1.pct > 25 && g1.pct < 30);
  const stale = even.filter(t => t < to - 50 * MIN);   // the job stopped 50 min ago: an open gap
  const g2 = M.gaps(stale, { from, to });
  assert.equal(g2.gaps.length, 1); assert.ok(g2.gaps[0].open);
  const none = M.gaps([], { from, to });
  assert.equal(none.pct, 100); assert.ok(none.gaps[0].open);
});

test('feedFile: age, window from keep_s, METAR source gaps', () => {
  const now = T('2026-10-21T02:31:00Z');
  const snaps = []; for (let k = 12; k >= 0; k--) snaps.push({ t: now - 60e3 - k * 5 * MIN });
  const a = M.feedFile('aircraft', { generated: new Date(now - 60e3).toISOString(), keep_s: 3600, snaps }, now);
  assert.equal(a.age, 60e3); assert.equal(a.window, 3600e3); assert.equal(a.pct, 0); assert.equal(a.samples, 12);
  const obs = []; for (let k = 47; k >= 0; k--) if (k !== 10 && k !== 11) obs.push({ t: (now - 11 * MIN - k * 30 * MIN) / 1000 });
  const m = M.feedFile('metar', { generated: new Date(now - 60e3).toISOString(), keep_s: 86400, obs }, now);
  assert.equal(m.sourceGaps.length, 1); assert.equal(m.sourceGaps[0].ms, 90 * MIN);
});

test('jobGaps: union of job run times, gaps between jobs and after the last', () => {
  const from = T('2026-10-14T00:00:00Z'), to = T('2026-10-15T00:00:00Z');
  const runs = [
    { started: '2026-10-13T22:00:00Z', updated: '2026-10-14T03:30:00Z', status: 'completed' },
    { started: '2026-10-14T03:40:00Z', updated: '2026-10-14T09:00:00Z', status: 'completed' },   // 10 min: no gap
    { started: '2026-10-14T05:00:00Z', updated: '2026-10-14T06:00:00Z', status: 'completed' },   // inside the one before
    { started: '2026-10-14T12:00:00Z', updated: '2026-10-14T17:00:00Z', status: 'completed' },   // 3 h gap before
    { started: '2026-10-14T20:00:00Z', status: 'in_progress' }];                                  // 3 h gap before; runs to now
  const r = M.jobGaps(runs, { from, to });
  assert.equal(r.gaps.length, 2); assert.equal(r.gapMs, 6 * 3600e3); assert.equal(r.pct, 25);
});
