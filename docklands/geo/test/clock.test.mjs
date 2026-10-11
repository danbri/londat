// Tests of docklands/geo/clock.js (node --test). The old London-only function of sky3.js (before 2026-10-11) is copied
// here as the reference: fromWall(s, 'Europe/London') must give the same answer for every input (no change of behaviour).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fromWall, wallString, wallDate, wallDayOfYear, offsetMs, clockFor } from '../clock.js';
import { region } from '../region.js';
import docklands from '../regions/docklands.js';

const oldOffset = u => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(u)).reduce((o, x) => (o[x.type] = x.value, o), {});
  return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(u / 1000) * 1000; };
function oldFromLondon(s) {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?$/.exec(String(s).trim()); if (!m) return NaN;
  const u = Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0));
  const bst = u - 36e5; if (bst + oldOffset(bst) === u) return bst;
  return u - oldOffset(u - oldOffset(u));
}

test('Europe/London: same as the old sky3.js fromLondon (30 years, every DST change)', () => {
  let n = 0;
  for (let t = Date.UTC(2000, 0, 1); t < Date.UTC(2030, 0, 1); t += 6 * 36e5 + 7 * 6e4) { const s = new Date(t).toISOString().slice(0, 16); assert.equal(fromWall(s, 'Europe/London'), oldFromLondon(s), s); n++; }
  for (const y of [2024, 2025, 2026, 2027, 2030]) for (const mo of ['03', '10']) for (let d = 20; d <= 31; d++) for (let h = 0; h < 4; h++) for (const mm of ['00', '30', '59']) {
    const s = `${y}-${mo}-${d}T0${h}:${mm}`; assert.equal(fromWall(s, 'Europe/London'), oldFromLondon(s), s); n++;
  }
  for (const s of ['2026-10-11', '2026-10-11 07:15', '2026-10-11T07:15:30', 'nonsense', '']) { const a = fromWall(s, 'Europe/London'), b = oldFromLondon(s); assert.ok(Object.is(a, b), s); }
  assert.ok(n > 40000);
});

test('Europe/London: the DST edge cases of docklands/test/clock-check.mjs', () => {
  const DST = [['2026-03-29T00:30', '2026-03-29T00:30Z'], ['2026-03-29T01:30', '2026-03-29T01:30Z'], ['2026-03-29T03:00', '2026-03-29T02:00Z'],
    ['2026-10-24T12:00', '2026-10-24T11:00Z'], ['2026-10-25T01:30', '2026-10-25T00:30Z'], ['2026-10-25T02:00', '2026-10-25T02:00Z'], ['2026-10-26T12:00', '2026-10-26T12:00Z']];
  for (const [s, z] of DST) assert.equal(new Date(fromWall(s, 'Europe/London')).toISOString().slice(0, 17), z.slice(0, 16) + ':', s);
});

test('a region with timeZone Asia/Tokyo gives the Tokyo wall clock (UTC+9, no DST)', () => {
  const tokyo = region({ id: 'tokyo-test', name: 'Tokyo (test)', origin: { lon: 139.7671, lat: 35.6812, h: 40 }, bbox: [139.70, 35.64, 139.83, 35.72], timeZone: 'Asia/Tokyo', locale: 'ja-JP', heightDatum: 'ellipsoid', adapters: [] });
  const c = tokyo.clock;
  assert.equal(new Date(c.fromWall('2026-10-11T22:00')).toISOString(), '2026-10-11T13:00:00.000Z');
  assert.equal(new Date(c.fromWall('2026-01-01T00:00')).toISOString(), '2025-12-31T15:00:00.000Z');
  assert.equal(c.wallString(Date.UTC(2026, 9, 11, 13, 0)), '2026-10-11T22:00');
  assert.equal(c.wallDate(Date.UTC(2026, 9, 11, 16, 0)), '2026-10-12');   // after 15:00 UTC it is the next day in Tokyo
  assert.equal(c.offsetMs(Date.UTC(2026, 6, 1)), 9 * 36e5);
  assert.equal(c.offsetMs(Date.UTC(2026, 0, 1)), 9 * 36e5);
  // the same wall time in London is 9 hours (winter) or 8 hours (summer) later in UTC
  assert.equal(fromWall('2026-01-15T12:00', 'Europe/London') - fromWall('2026-01-15T12:00', 'Asia/Tokyo'), 9 * 36e5);
  assert.equal(fromWall('2026-07-15T12:00', 'Europe/London') - fromWall('2026-07-15T12:00', 'Asia/Tokyo'), 8 * 36e5);
});

test('other zones: a southern-hemisphere DST (Australia/Sydney), a half-hour zone (Asia/Kolkata), round trips', () => {
  assert.equal(new Date(fromWall('2026-01-15T12:00', 'Australia/Sydney')).toISOString(), '2026-01-15T01:00:00.000Z');   // AEDT +11
  assert.equal(new Date(fromWall('2026-07-15T12:00', 'Australia/Sydney')).toISOString(), '2026-07-15T02:00:00.000Z');   // AEST +10
  assert.equal(offsetMs(Date.UTC(2026, 3, 1), 'Asia/Kolkata'), 5.5 * 36e5);
  for (const tz of ['America/New_York', 'America/Sao_Paulo', 'Asia/Kolkata', 'Pacific/Auckland', 'Africa/Lagos', 'UTC'])
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 7 * 36e5 + 6e4 * 11) {
      const tm = Math.floor(t / 6e4) * 6e4, s = wallString(tm, tz), back = fromWall(s, tz);
      // a wall time in a repeated hour maps to its first instant; else exact
      assert.ok(back === tm || back === tm - 36e5, `${tz} ${s}`);
    }
});

test('day of the year and the Docklands default region', () => {
  assert.equal(wallDayOfYear(Date.UTC(2026, 11, 31, 23, 30), 'Europe/London'), 365);
  assert.equal(wallDayOfYear(Date.UTC(2026, 11, 31, 23, 30), 'Asia/Tokyo'), 1);
  assert.equal(wallDate(Date.UTC(2026, 5, 30, 23, 30), 'Europe/London'), '2026-07-01');
  assert.equal(docklands.timeZone, 'Europe/London');
  assert.equal(clockFor(docklands.timeZone).fromWall('2026-06-21T04:43'), Date.parse('2026-06-21T03:43Z'));
  assert.throws(() => clockFor('Mars/Olympus_Mons'), RangeError);
});
