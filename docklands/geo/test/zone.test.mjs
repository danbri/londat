// Tests of the place-aware page clock (OKR KR1.2): docklands/geo/zone.js (the zone at a point, labels, ?tz=) and
// docklands/clockzone.js (the page's active zone: follows the view, keeps the instant, ?t= in the start view's zone).
// DST edges for Europe/London, Europe/Madrid and Europe/Sarajevo through geo/clock.js fromWall. node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromWall, wallString } from '../clock.js';
import { zoneAt, worldZones, solarZone, parseZone, offsetText, zoneAbbr, zoneLabel, zoneTime, regionExtent, regionByName } from '../zone.js';
import { REGIONS } from '../regions/index.js';
import { makeWorld } from '../../globe/world.js';
import { makeClockZone } from '../../clockzone.js';

const Z = s => Date.parse(s);
// [zone, wall clock, expected UTC, note]: the last Sundays of March and October 2026 (EU rule: 01:00 UTC both zones)
const EDGES = [
  ['Europe/London', '2026-03-29T00:59', '2026-03-29T00:59Z', 'GMT, last minute'],
  ['Europe/London', '2026-03-29T01:30', '2026-03-29T01:30Z', 'skipped hour: moves on by the gap (01:30 GMT = 02:30 BST)'],
  ['Europe/London', '2026-03-29T02:00', '2026-03-29T01:00Z', 'BST'],
  ['Europe/London', '2026-10-25T01:30', '2026-10-25T00:30Z', 'repeated hour: the first (BST)'],
  ['Europe/London', '2026-10-25T02:00', '2026-10-25T02:00Z', 'GMT'],
  ['Europe/Madrid', '2026-03-29T01:59', '2026-03-29T00:59Z', 'CET, last minute'],
  ['Europe/Madrid', '2026-03-29T02:30', '2026-03-29T01:30Z', 'skipped hour (02:00 to 03:00)'],
  ['Europe/Madrid', '2026-03-29T03:00', '2026-03-29T01:00Z', 'CEST'],
  ['Europe/Madrid', '2026-10-25T02:30', '2026-10-25T00:30Z', 'repeated hour: the first (CEST)'],
  ['Europe/Madrid', '2026-10-25T03:00', '2026-10-25T02:00Z', 'CET'],
  ['Europe/Madrid', '2026-07-01T12:00', '2026-07-01T10:00Z', 'summer'],
  ['Europe/Madrid', '2026-01-15T12:00', '2026-01-15T11:00Z', 'winter'],
  ['Europe/Sarajevo', '2026-03-29T01:59', '2026-03-29T00:59Z', 'CET, last minute'],
  ['Europe/Sarajevo', '2026-03-29T03:00', '2026-03-29T01:00Z', 'CEST'],
  ['Europe/Sarajevo', '2026-10-25T02:30', '2026-10-25T00:30Z', 'repeated hour: the first (CEST)'],
  ['Europe/Sarajevo', '2026-10-25T03:00', '2026-10-25T02:00Z', 'CET'],
];

test('DST edges: wall clock -> UTC for Europe/London, Europe/Madrid, Europe/Sarajevo', () => {
  for (const [tz, wall, utc, note] of EDGES) assert.equal(fromWall(wall, tz), Z(utc), `${tz} ${wall} (${note})`);
});

test('the same instant on three wall clocks, and back (round trip every 37 min over 2026)', () => {
  const t = Z('2026-10-21T12:00Z');
  assert.equal(wallString(t, 'Europe/London'), '2026-10-21T13:00');
  assert.equal(wallString(t, 'Europe/Madrid'), '2026-10-21T14:00');
  assert.equal(wallString(t, 'Europe/Sarajevo'), '2026-10-21T14:00');
  for (const tz of ['Europe/London', 'Europe/Madrid', 'Europe/Sarajevo'])
    for (let u = Z('2026-01-01T00:00Z'); u < Z('2027-01-01T00:00Z'); u += 37 * 6e4) {
      const w = wallString(u, tz), back = fromWall(w, tz), m = Math.floor(u / 6e4) * 6e4;
      // the repeated hour (clocks go back) gives the first instant: one hour earlier than the second pass
      assert.ok(back === m || back === m - 36e5, `${tz} ${new Date(u).toISOString()} -> ${w} -> ${new Date(back).toISOString()}`);
    }
});

test('labels: abbreviation and offset across the DST change', () => {
  const sum = Z('2026-10-24T12:00Z'), win = Z('2026-10-26T12:00Z');
  assert.equal(offsetText(sum, 'Europe/London'), 'UTC+1'); assert.equal(offsetText(win, 'Europe/London'), 'UTC');
  assert.equal(offsetText(sum, 'Europe/Madrid'), 'UTC+2'); assert.equal(offsetText(win, 'Europe/Madrid'), 'UTC+1');
  assert.equal(offsetText(sum, 'Europe/Sarajevo'), 'UTC+2'); assert.equal(offsetText(win, 'Asia/Kolkata'), 'UTC+5:30');
  assert.equal(zoneAbbr(sum, 'Europe/London', ['en-GB']), 'BST'); assert.equal(zoneAbbr(win, 'Europe/London', ['en-GB']), 'GMT');
  assert.equal(zoneLabel(sum, 'Europe/Madrid', ['es-ES']), 'CEST (UTC+2)'); assert.equal(zoneLabel(win, 'Europe/Madrid', ['es-ES']), 'CET (UTC+1)');
  assert.equal(zoneLabel(win, 'Europe/Sarajevo', ['bs']), 'CET (UTC+1)');
  assert.equal(zoneLabel(sum, 'Etc/GMT-1'), 'UTC+1');
  const zt = zoneTime(sum, 'Europe/Madrid', ['es-ES']);
  assert.deepEqual([zt.wall_clock, zt.abbreviation, zt.utc_offset, zt.offset_min], ['2026-10-24T14:00', 'CEST', 'UTC+2', 120]);
});

test('parseZone (?tz=) and the nautical zone', () => {
  assert.equal(parseZone('Europe/Madrid'), 'Europe/Madrid'); assert.equal(parseZone('UTC'), 'UTC'); assert.equal(parseZone('utc+2'), 'Etc/GMT-2');
  assert.equal(parseZone('+02:00'), 'Etc/GMT-2'); assert.equal(parseZone('-5'), 'Etc/GMT+5'); assert.equal(parseZone('UTC+0'), 'UTC');
  assert.equal(parseZone('Mars/Olympus'), null); assert.equal(parseZone(''), null); assert.equal(parseZone('+15'), null);
  assert.equal(solarZone(0), 'UTC'); assert.equal(solarZone(7.4), 'UTC'); assert.equal(solarZone(7.6), 'Etc/GMT-1'); assert.equal(solarZone(-74), 'Etc/GMT+5');
  assert.equal(solarZone(179.9), 'Etc/GMT-12'); assert.equal(solarZone(-179.9), 'Etc/GMT+12'); assert.equal(solarZone(375), 'Etc/GMT-1');
  assert.equal(offsetText(Z('2026-07-01T00:00Z'), solarZone(139.7)), 'UTC+9');
});

test('zoneAt: the region configs (places exact, the UK skeleton bbox approximate) and the fallback', () => {
  const at = (lon, lat, o = {}) => zoneAt(lon, lat, { regions: REGIONS, ...o });
  assert.deepEqual([at(-5.56654, 42.59732).timeZone, at(-5.56654, 42.59732).source, at(-5.56654, 42.59732).approximate], ['Europe/Madrid', 'region:leon', false]);
  assert.equal(at(-5.9, 42.4).timeZone, 'Europe/Madrid', 'in the 70 km surroundings of León');
  assert.deepEqual([at(18.43335, 43.85917).timeZone, at(18.43335, 43.85917).source], ['Europe/Sarajevo', 'region:sarajevo']);
  assert.deepEqual([at(-0.0195, 51.5049).timeZone, at(-0.0195, 51.5049).source, at(-0.0195, 51.5049).approximate], ['Europe/London', 'region:docklands', false]);
  assert.deepEqual([at(4.49, 52.16).timeZone, at(4.49, 52.16).approximate], ['Europe/Amsterdam', false]);
  assert.deepEqual([at(-3, 53).timeZone, at(-3, 53).source, at(-3, 53).approximate], ['Europe/London', 'region:uk', true]);
  assert.deepEqual([at(-30, 40).timeZone, at(-30, 40).source, at(-30, 40).approximate], ['Etc/GMT+2', 'solar', true]);
  const e = regionExtent(REGIONS.leon); assert.ok(e[0] < -5.9 && e[2] > -5.2 && e[1] < 42.3 && e[3] > 42.9, 'León: the 70 km square');
  assert.equal(regionByName(REGIONS, 'leon').id, 'leon'); assert.equal(regionByName(REGIONS, 'León').id, 'leon'); assert.equal(regionByName(REGIONS, 'Sarajevo').id, 'sarajevo'); assert.equal(regionByName(REGIONS, 'Tokyo'), null);
});

test('zoneAt with the world: the Natural Earth towns (IANA tz) and countries of the globe', async () => {
  const root = fileURLToPath(new URL('../../../cwplans/docklands/data/world/', import.meta.url));
  const W = makeWorld({ fetchJson: async u => JSON.parse(readFileSync(root + u.split('/').pop(), 'utf8')) });
  await W.addManifest('file:///world/layers.json', JSON.parse(readFileSync(root + 'layers.json', 'utf8')));
  await W.loadLayer('world:places'); await W.loadLayer('world:countries');
  const zw = worldZones(W.nearest.filter(it => it.f.properties.tz).map(it => ({ lon: it.lon, lat: it.lat, a3: it.f.properties.a3, tz: it.f.properties.tz })));
  assert.ok(zw.size > 5000);
  const lk = W.lookups.get('country'), a3 = (lon, lat) => lk.idx.find(lon, lat)?.properties.a3 ?? null;
  const at = (lon, lat) => zoneAt(lon, lat, { regions: REGIONS, world: zw, a3: a3(lon, lat) });
  assert.equal(at(139.69, 35.69).timeZone, 'Asia/Tokyo');
  assert.equal(at(1.08, 49.92).timeZone, 'Europe/Paris', 'Dieppe: inside the UK skeleton bbox, but France');
  assert.equal(at(-3.70, 40.42).timeZone, 'Europe/Madrid');
  assert.equal(at(-15.43, 28.12).timeZone, 'Atlantic/Canary', 'Las Palmas: Spain, another zone');
  assert.equal(at(-15.43, 28.12).approximate, false, 'the Canaries are far from the Madrid zone');
  assert.equal(at(-101.5, 38.0).approximate, true, 'western Kansas: Central and Mountain towns both near');
  assert.equal(at(-74.0, 40.71).timeZone, 'America/New_York');
  assert.equal(at(-118.24, 34.05).timeZone, 'America/Los_Angeles');
  assert.equal(at(2.35, 48.86).approximate, false, 'France (metropolitan towns) one zone');
  assert.equal(at(-30, 40).timeZone, 'Atlantic/Azores', 'the sea near the Azores: the nearest town within 300 km');
  assert.deepEqual([at(-45, 33).source, at(-45, 33).timeZone], ['solar', 'Etc/GMT+3'], 'mid-Atlantic: no town within 300 km');
  assert.equal(at(-5.56654, 42.59732).source, 'region:leon', 'a region config before the towns');
});

test('clockzone: the active zone follows the view and keeps the instant; ?t= in the start zone; ?tz=', () => {
  const ql = new URLSearchParams('place=leon&t=2026-10-25T02:30');
  const C = makeClockZone(ql);
  assert.equal(C.tz, 'Europe/Madrid'); assert.equal(C.parse(ql.get('t')), Z('2026-10-25T00:30Z'), '?t= read as León time');
  assert.equal(C.parse('2026-10-25T02:30Z'), Z('2026-10-25T02:30Z'), 'with Z as it is');
  const t = Z('2026-10-21T12:00Z'); let changes = 0; C.onChange(() => changes++);
  assert.equal(C.string(t), '2026-10-21T14:00'); assert.ok(C.away);
  C.follow({ mode: 'model' }); assert.equal(C.tz, 'Europe/London'); assert.equal(C.string(t), '2026-10-21T13:00'); assert.ok(!C.away); assert.equal(changes, 1);
  C.follow({ mode: 'globe', lon: 18.43, lat: 43.86 }); assert.equal(C.tz, 'Europe/Sarajevo'); assert.equal(C.info.region, 'sarajevo');
  assert.deepEqual(C.observer(), { lon: REGIONS.sarajevo.origin.lon, lat: REGIONS.sarajevo.origin.lat }, 'the sun of the place');
  C.setZone('UTC+3'); assert.equal(C.tz, 'Etc/GMT-3'); C.follow({ mode: 'model' }); assert.equal(C.tz, 'Etc/GMT-3', 'fixed by setZone');
  C.setZone('auto', { mode: 'model' }); assert.equal(C.tz, 'Europe/London');
  assert.throws(() => C.setZone('Nowhere/Land'));
  const D = C.describe(t); assert.deepEqual([D.time_zone, D.abbreviation, D.utc_offset, D.wall_clock, D.approximate], ['Europe/London', 'BST', 'UTC+1', '2026-10-21T13:00', false]);
  // the model start: London; ?tz= fixes it whatever the view
  assert.equal(makeClockZone(new URLSearchParams('t=2026-10-25T01:30')).parse('2026-10-25T01:30'), Z('2026-10-25T00:30Z'));
  const F = makeClockZone(new URLSearchParams('tz=Europe/Madrid')); assert.equal(F.tz, 'Europe/Madrid'); F.follow({ mode: 'model' }); assert.equal(F.tz, 'Europe/Madrid');
  assert.equal(makeClockZone(new URLSearchParams('ll=43.85917,18.43335,2000')).tz, 'Europe/Sarajevo', '?ll= in a place');
});
