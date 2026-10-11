// Tests of the locale-free geo core (docklands/geo/ellipsoid.js, region.js) and of the UK adapter's model frame
// (adapters/uk-os.js against the area.js fit). node --test (npm test). Prints the measured numbers with t.diagnostic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WGS84, geodeticToEcef, ecefToGeodetic, enuFrame, ellipsoidNormal, curvatureDrop, curvatureDropSphere, gaussianRadius, sectionRadius, surfaceDistance } from '../ellipsoid.js';
import { region } from '../region.js';
import docklands from '../regions/docklands.js';
import { fitModelFrame, modelFrame, geoXZ, geoLonLat, geoidN, exactToModel, exactFromModel } from '../adapters/uk-os.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const G = JSON.parse(/"geo":(\{[^{}]*\})/.exec(readFileSync(new URL('../../../cwplans/docklands/data/area.js', import.meta.url), 'utf8'))[1]);

test('WGS84 <-> ECEF: known points and round trips worldwide', () => {
  const [x, y, z] = geodeticToEcef(0, 0, 0); near(x, WGS84.a, 1e-6, 'equator x'); near(y, 0, 1e-6, 'y'); near(z, 0, 1e-6, 'z');
  near(geodeticToEcef(0, 90, 0)[2], 6356752.314245, 1e-5, 'pole z = b');
  let worst = 0, worstDeg = 0;
  for (let lat = -89.5; lat <= 89.5; lat += 7.3) for (let lon = -179; lon <= 180; lon += 13.7) for (const h of [-430, 0, 45.4, 8848, 400e3, 35786e3]) {
    const g = ecefToGeodetic(...geodeticToEcef(lon, lat, h));
    worst = Math.max(worst, Math.abs(g.h - h)); worstDeg = Math.max(worstDeg, Math.abs(g.lat - lat), Math.abs(((g.lon - lon + 540) % 360) - 180));
  }
  assert.ok(worst < 1e-6, `height round trip ${worst} m`); assert.ok(worstDeg < 1e-10, `angle round trip ${worstDeg} deg`);
  const p = ecefToGeodetic(0, 0, 6356752.314245 + 100); near(p.lat, 90, 1e-12, 'pole lat'); near(p.h, 100, 1e-6, 'pole h');
});

test('ENU at any origin: round trips, axes, normal', () => {
  for (const o of [{ lon: -0.0195, lat: 51.5049, h: 45.4 }, { lon: 139.7671, lat: 35.6812, h: 40 }, { lon: -43.1729, lat: -22.9068, h: 10 }, { lon: 179.9, lat: -85, h: 2800 }]) {
    const F = enuFrame(o); let worst = 0;
    for (const [e, n, u] of [[0, 0, 0], [1000, 0, 0], [0, -10000, 5], [40000, 30000, -120], [-250e3, 400e3, 1000]]) {
      const g = F.fromEnu(e, n, u), b = F.toEnu(g.lon, g.lat, g.h); worst = Math.max(worst, Math.hypot(b[0] - e, b[1] - n, b[2] - u));
    }
    assert.ok(worst < 1e-6, `ENU round trip ${worst} m at ${o.lat}`);
    const up = ellipsoidNormal(o.lon, o.lat); near(Math.hypot(...up), 1, 1e-15, 'unit normal');
    // a point straight up is u only; a point 1 km due east on the plane is e only
    const g = F.fromEnu(0, 0, 100), b = F.toEnu(g.lon, g.lat, g.h); near(b[2], 100, 1e-8, 'up'); near(g.h - o.h, 100, 1e-6, 'height grows along the normal');
    const m = F.matrix(); near(m[15], 1, 0, 'matrix'); near(m[12], F.ecef[0], 0, 'matrix translation');
  }
});

test('curvature drop at 1, 10 and 40 km (Docklands origin and the equator)', t => {
  const o = docklands.origin, R = gaussianRadius(o.lat);
  const rows = [];
  for (const d of [1000, 10000, 40000]) for (const az of [0, 90]) {
    const exact = curvatureDrop(d, o, az), sphere = curvatureDropSphere(d, sectionRadius(o.lat, az)), approx = d * d / (2 * R);
    rows.push(`${d / 1000} km az ${az}: ${exact.toFixed(4)} m (sphere of the section radius ${sphere.toFixed(4)}, d^2/2R ${approx.toFixed(4)})`);
    near(exact, sphere, Math.max(1e-4, exact * 2e-3), `drop ${d} ${az}`);
    near(exact, approx, exact * 4e-3, `drop vs d^2/2R ${d} ${az}`);
  }
  near(curvatureDrop(1000, o), 0.0785, 0.0005, '1 km'); near(curvatureDrop(10000, o), 7.85, 0.05, '10 km'); near(curvatureDrop(40000, o), 125.6, 0.6, '40 km');
  near(curvatureDrop(10000, { lon: 0, lat: 0 }, 0), 10000 ** 2 / (2 * 6335439), 0.05, 'equator meridian section');
  t.diagnostic(rows.join('\n'));
});

test('surface distance and region object', () => {
  near(surfaceDistance(0, 0, 1, 0), 111195, 400, 'one degree on the equator');
  const r = region(docklands);
  assert.equal(r.timeZone, 'Europe/London'); assert.equal(r.adapter('uk-os').id, 'uk-os');
  assert.ok(r.contains(-0.0195, 51.5049)); assert.ok(!r.contains(2.35, 48.85));
  const [e, n, u] = r.toLocal(r.origin.lon, r.origin.lat, r.origin.h); near(Math.hypot(e, n, u), 0, 1e-8, 'origin is 0');
  assert.throws(() => region({ ...docklands, timeZone: 'Nowhere/Here' }), RangeError);
  assert.throws(() => region({ ...docklands, bbox: [0, 1, 2] }), TypeError);
  const wrap = region({ ...docklands, id: 'fiji', bbox: [177, -19, -179, -16], timeZone: 'Pacific/Fiji', locale: 'en-FJ', origin: { lon: 178.44, lat: -18.14 } });
  assert.ok(wrap.contains(179.5, -17)); assert.ok(wrap.contains(-179.5, -17)); assert.ok(!wrap.contains(0, -17));
  assert.deepEqual(JSON.parse(JSON.stringify(docklands)), docklands);   // the config is plain data
});

test('UK adapter: the BNG model frame as a fixed transform of the region ENU; error over the box', t => {
  const fit = fitModelFrame(G, docklands.bbox), P = docklands.adapters[0].modelFrame;
  // the committed parameters are the fit of today's area.js
  for (const k of ['a', 'b', 'tx', 'tn']) near(P[k], fit.params[k], 1e-6, `param ${k}`);
  near(docklands.origin.lon, fit.origin.lon, 1e-8, 'origin lon'); near(docklands.origin.lat, fit.origin.lat, 1e-8, 'origin lat'); near(docklands.origin.h, geoidN(fit.origin.lon, fit.origin.lat), 1e-3, 'origin h');
  assert.ok(fit.horizontal.max < 0.10, `horizontal max ${fit.horizontal.max}`); assert.ok(fit.horizontal.rms < 0.035, `rms ${fit.horizontal.rms}`);
  near(fit.horizontal.max, P.error.horizontalMaxM, 0.002, 'stated max error'); near(fit.vertical.maxDrop, P.error.verticalMaxDropM, 0.01, 'stated drop');
  near(fit.scale, 0.99984, 2e-5, 'scale = BNG point scale factor'); near(fit.rotationDeg, 1.55, 0.02, 'rotation = grid convergence');
  // true north points west of grid north (sky3.js GRID_CONV about -1.5)
  const T = modelFrame(P), [nx, , nz] = T.fromEnu([0, 1000, 0]); assert.ok(nx < 0 && nz < 0);
  // round trip model <-> ENU and through the exact path
  const r = region(docklands);
  for (const [x, y, z] of [[0, 0, 0], [-5000, 20, 3500], [2300, 235, -1900], [800, 4, 600]]) {
    const back = T.fromEnu(T.toEnu([x, y, z])); near(Math.hypot(back[0] - x, back[1] - y, back[2] - z), 0, 1e-9, 'fixed round trip');
    const g = exactFromModel(G, x, y, z), m = exactToModel(G, g.lon, g.lat, g.h); near(Math.hypot(m[0] - x, m[1] - y, m[2] - z), 0, 1e-5, 'exact round trip');
    // the fixed transform and the exact one agree horizontally to the stated error; vertically up to the curvature drop
    const enu = r.toLocal(g.lon, g.lat, g.h), f = T.fromEnu(enu);
    // plus the lean of the flat model's verticals: a point y metres up at distance d leans d / R outwards (0.11 m for
    // 235 m at 3 km: the local vertical there is 0.027 degrees off the origin's)
    const lean = Math.abs(y) * Math.hypot(x, z) / gaussianRadius(r.origin.lat);
    assert.ok(Math.hypot(f[0] - x, f[2] - z) < 0.10 + lean, `horizontal at ${x},${z}: ${Math.hypot(f[0] - x, f[2] - z)}`);
    const drop = curvatureDrop(Math.hypot(enu[0], enu[1]), r.origin, Math.atan2(enu[0], enu[1]) * 180 / Math.PI);
    near(f[1] + drop, y, 0.12, `vertical = u + drop - geoid change at ${x},${z}`);
  }
  const [x0, z0] = geoXZ(G, ...geoLonLat(G, 123, -456)); near(x0, 123, 1e-6, 'inverse x'); near(z0, -456, 1e-6, 'inverse z');
  t.diagnostic(`ENU -> model: scale ${fit.scale.toFixed(7)}, rotation ${fit.rotationDeg.toFixed(4)} deg; horizontal error over the box (${fit.horizontal.points} points): max ${fit.horizontal.max.toFixed(3)} m at ${fit.horizontal.at}, rms ${fit.horizontal.rms.toFixed(3)} m; curvature drop left out by the flat model: up to ${fit.vertical.maxDrop.toFixed(2)} m`);
});
