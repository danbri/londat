// Tests of docklands/geo/services.js (issue #12, KR1.5): which live services apply to the view. Tests may name places.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteAt, pickStation, metarIds, SITE_RANGE_M } from '../services.js';
import { REGIONS } from '../regions/index.js';

const model = REGIONS.docklands, opt = { regions: REGIONS, model };
const G = (lat, lon, range = 2000) => siteAt({ mode: 'globe', lon, lat, range }, opt);
// station positions as the NOAA AWC answer gives them (2026-10-22)
const ST = [{ id: 'EGLC', lat: 51.505, lon: 0.055 }, { id: 'EIDW', lat: 53.422, lon: -6.298 }, { id: 'EDDB', lat: 52.3807, lon: 13.5306 }, { id: 'EDDR', lat: 49.213, lon: 7.108 },
  { id: 'ELLX', lat: 49.626, lon: 6.204 }, { id: 'LELN', lat: 42.588, lon: -5.651 }, { id: 'EGNM', lat: 53.862, lon: -1.665 }, { id: 'EGXE', lat: 54.297, lon: -1.533 }, { id: 'EGCC', lat: 53.354, lon: -2.275 }];

test('the model: its own station, point, water; home', () => {
  const s = siteAt({ mode: 'model' }, opt);
  assert.equal(s.region, 'docklands'); assert.equal(s.metar, 'EGLC'); assert.equal(s.home, true); assert.equal(s.water.name, 'Thames');
});
test('the globe over the model box is the model', () => { const s = G(51.505, -0.02); assert.equal(s.region, 'docklands'); assert.equal(s.home, true); assert.ok(s.water); });
test('Greater London on the globe: London City METAR, home files, no water service', () => {
  const s = G(51.5074, -0.1278); assert.equal(s.region, 'london'); assert.equal(s.metar, 'EGLC'); assert.equal(s.home, true); assert.equal(s.water, null);
});
for (const [id, lat, lon, st] of [['dublin', 53.34725, -6.25916, 'EIDW'], ['berlin', 52.517, 13.394, 'EDDB'], ['stuttgart', 48.7784, 9.1797, 'EDDS'], ['dagstuhl', 49.5307, 6.8986, 'EDDR'],
  ['leon', 42.59732, -5.56654, 'LELN'], ['sarajevo', 43.85917, 18.43335, 'LQSA']]) {
  test(`${id}: its own station, not home, no water`, () => {
    const s = G(lat, lon); assert.equal(s.region, id); assert.equal(s.metar, st); assert.equal(s.home, false); assert.equal(s.water, null);
    assert.notEqual(s.point.lat.toFixed(1), model.services.weatherPoint.lat.toFixed(1));
  });
}
test('York (no place of its own): the view point and the nearest station within 50 km', () => {
  const s = G(53.96, -1.081); assert.equal(s.region, null); assert.equal(s.metar, null); assert.equal(s.home, false); assert.equal(s.water, null);
  const p = pickStation(s, ST); assert.equal(p.id, 'EGNM'); assert.ok(p.dist_km <= 50);
});
test('no station within 50 km: none (never a far one)', () => { const s = G(45, -30); assert.equal(pickStation(s, ST), null); });
test('the place\'s own station is used even when another is nearer to the point', () => { const s = G(49.5307, 6.8986); assert.equal(pickStation(s, ST).id, 'EDDR'); });
test('the globe from far away: no site', () => { assert.equal(G(51.5, -0.12, SITE_RANGE_M + 1), null); assert.equal(G(53.35, -6.26, 5e6), null); });
test('metarIds: the region configs\' stations, the model\'s among them, all ICAO-shaped', () => {
  const ids = metarIds(REGIONS); for (const id of ['EGLC', 'EIDW', 'EDDB', 'EDDS', 'EDDR', 'LELN', 'LQSA', 'EGNM']) assert.ok(ids.includes(id), id);
  assert.ok(ids.every(x => /^[A-Z0-9]{4}$/.test(x))); assert.ok(ids.length < 100, 'one AWC request each 5 minutes stays small');
});
