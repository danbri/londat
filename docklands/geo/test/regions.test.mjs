// Tests of the region configs (docklands/geo/regions/): the Docklands and the three KR1.2 places the owner chose on
// 2026-10-11 (Sarajevo, León, Leiden): valid regions, ENU round trips at each origin, the wall clock in each zone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { region } from '../region.js';
import REGIONS from '../regions/index.js';
import { surfaceDistance } from '../ellipsoid.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

test('every region config is valid, plain data, and holds its origin', () => {
  for (const [id, cfg] of Object.entries(REGIONS)) {
    const r = region(cfg); assert.equal(r.id, id);
    assert.ok(r.contains(r.origin.lon, r.origin.lat), `${id} origin in bbox`);
    assert.deepEqual(JSON.parse(JSON.stringify(cfg)), cfg, `${id} is plain data`);
    for (const a of cfg.adapters) for (const k of ['id', 'area', 'licence', 'licenceClass', 'fallback']) assert.ok(a[k], `${id} adapter ${a.id} has ${k}`);
  }
});

test('the KR1.2 places: origins as checked with Nominatim (OSM) on 2026-10-11', () => {
  const want = { sarajevo: [18.43335, 43.85917, 'Europe/Sarajevo'], leon: [-5.56654, 42.59732, 'Europe/Madrid'], leiden: [4.49123, 52.15948, 'Europe/Amsterdam'] };
  for (const [id, [lon, lat, tz]] of Object.entries(want)) { const r = region(REGIONS[id]); assert.equal(r.origin.lon, lon); assert.equal(r.origin.lat, lat); assert.equal(r.timeZone, tz); }
  // distances from the Docklands origin (great circle; sanity of signs: León is west, the others east)
  const d = id => surfaceDistance(REGIONS.docklands.origin.lon, REGIONS.docklands.origin.lat, REGIONS[id].origin.lon, REGIONS[id].origin.lat) / 1000;
  near(d('leiden'), 318, 15, 'London-Leiden km'); near(d('leon'), 1077, 10, 'London-León km'); near(d('sarajevo'), 1618, 10, 'London-Sarajevo km');
});

test('ENU round trips at each origin (1 m to 50 km, up to 3 km up)', () => {
  for (const cfg of Object.values(REGIONS)) {
    const r = region(cfg); let worst = 0;
    for (const [e, n, u] of [[0, 0, 0], [1, 1, 1], [500, -300, 20], [-2000, 1500, -30], [10000, 10000, 300], [-50000, 20000, 3000]]) {
      const g = r.fromLocal(e, n, u), b = r.toLocal(g.lon, g.lat, g.h); worst = Math.max(worst, Math.hypot(b[0] - e, b[1] - n, b[2] - u));
    }
    assert.ok(worst < 1e-6, `${cfg.id}: ${worst} m`);
    // 1 km north of the origin on the plane is about 1/111.1 km of latitude
    const g = r.fromLocal(0, 1000, 0); near(g.lat - r.origin.lat, 1000 / 111150, 1e-4, `${cfg.id} 1 km north`); near(g.lon, r.origin.lon, 1e-12, `${cfg.id} same meridian`);
  }
});

test('wall clock in each place (CET / CEST; DST changes 29 March and 25 October 2026)', () => {
  for (const id of ['sarajevo', 'leon', 'leiden']) {
    const c = region(REGIONS[id]).clock;
    assert.equal(new Date(c.fromWall('2026-01-15T12:00')).toISOString(), '2026-01-15T11:00:00.000Z', `${id} winter`);
    assert.equal(new Date(c.fromWall('2026-07-15T12:00')).toISOString(), '2026-07-15T10:00:00.000Z', `${id} summer`);
    assert.equal(new Date(c.fromWall('2026-03-29T02:30')).toISOString(), '2026-03-29T01:30:00.000Z', `${id} skipped hour moves on`);
    assert.equal(new Date(c.fromWall('2026-10-25T02:30')).toISOString(), '2026-10-25T00:30:00.000Z', `${id} repeated hour: the first (CEST)`);
    assert.equal(c.wallString(Date.UTC(2026, 9, 11, 21, 30)), '2026-10-11T23:30', `${id} wall string`);
    assert.equal(c.wallDate(Date.UTC(2026, 9, 11, 22, 30)), '2026-10-12', `${id} next day before UTC`);
  }
  // the same instant: London one hour behind the three places
  assert.equal(region(REGIONS.docklands).clock.wallHM(Date.UTC(2026, 9, 11, 12)), '13:00');
  assert.equal(region(REGIONS.leiden).clock.wallHM(Date.UTC(2026, 9, 11, 12)), '14:00');
});

test('locales: Serbian in Cyrillic gives a non-Latin script (KR1.3)', () => {
  const t = Date.UTC(2026, 9, 11, 12);
  const sr = new Intl.DateTimeFormat('sr-Cyrl', { timeZone: 'Europe/Sarajevo', month: 'long' }).format(t);
  assert.match(sr, /\p{Script=Cyrillic}/u, sr);
  assert.equal(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', month: 'long' }).format(t), 'octubre');
  assert.equal(new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', month: 'long' }).format(t), 'oktober');
  assert.deepEqual(REGIONS.sarajevo.locales, ['bs', 'hr', 'sr-Latn', 'sr-Cyrl']);
});
