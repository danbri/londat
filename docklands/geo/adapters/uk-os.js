// UK adapter "uk-os": the British National Grid (EPSG:27700, OSTN15), Ordnance Datum Newlyn heights (OSGM15) and the
// Docklands model frame of today, as seen from the locale-free core (docklands/geo/ellipsoid.js, region.js). This file
// and docklands/geo/regions/ are where UK constants belong (tools/check-locale.mjs does not count them).
//
// The model frame of the Docklands page and port (cwplans/docklands/data/area.js meta.origin):
//   x = E - 537550, z = -(N - 180300) (BNG metres; north is -z), y = metres above ODN. The tools make it with OSTN15
//   (cwplans/tools/lib.mjs bngProjector); the page holds a quadratic fit lon/lat -> x, z (area.js meta.geo, 0.03 m).
// Here it is expressed as a FIXED transform of the region's ENU frame (origin: the model origin, h = the OSGM15 geoid
// height there, so that model y = 0 is ODN 0 at the origin):
//   x = a e - b n + tx,  -z = b e + a n + tn,  y = u + ty        (a = s cos t, b = s sin t: scale s, rotation t)
// The parameters are in regions/docklands.js (adapters[uk-os].modelFrame); fitModelFrame() recomputes them from the
// area.js fit, and the test docklands/geo/test/geo.test.mjs measures the error over the box.
// Horizontal: a similarity is enough (the measured error is in the region config). Vertical: the flat model has no
// curvature, so for a point at horizontal distance d from the origin, y = u + drop(d) - (N(p) - N(origin)): the fixed
// transform leaves out the drop (0.08 m at 1 km, 3.1 m at the far corner of the box, 6.3 km) and the change of the geoid
// over the box (about +-0.07 m). Use exactToModel / exactFromModel when that matters (globe tiles, KR2.1).
import { enuFrame, curvatureDrop } from '../ellipsoid.js';

// OSGM15 geoid height (ellipsoid minus ODN, m): quadratic fit to PROJ uk_os_OSGM15_GB.tif on a 14 x 14 grid,
// 51.09-51.92 N, 0.68 W-0.64 E; max error 0.10 m (copied from docklands/planes-live.js geoidN, 2026-10-09).
const NG = [45.4482, -1.0131, 1.1362, -0.6868, 0.3213, 0.6729];
export const geoidN = (lon, lat) => { const a = lon + 0.02, b = lat - 51.505; return NG[0] + NG[1] * a + NG[2] * b + NG[3] * a * b + NG[4] * a * a + NG[5] * b * b; };
export const odnFromEllipsoid = (lon, lat, h) => h - geoidN(lon, lat);
export const ellipsoidFromOdn = (lon, lat, H) => H + geoidN(lon, lat);

// the area.js meta.geo fit: lon, lat -> model x, z, and its inverse (Newton, to 1e-6 m)
export function geoXZ(G, lon, lat) {
  const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b];
  return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)];
}
export function geoLonLat(G, x, z) {
  let lon = G.lon0 + 0.07, lat = G.lat0 + 0.03;
  for (let i = 0; i < 20; i++) {
    const [x0, z0] = geoXZ(G, lon, lat), [x1, z1] = geoXZ(G, lon + 1e-6, lat), [x2, z2] = geoXZ(G, lon, lat + 1e-6);
    const j = [[(x1 - x0) / 1e-6, (x2 - x0) / 1e-6], [(z1 - z0) / 1e-6, (z2 - z0) / 1e-6]], det = j[0][0] * j[1][1] - j[0][1] * j[1][0];
    const dx = x - x0, dz = z - z0, dl = (j[1][1] * dx - j[0][1] * dz) / det, dp = (-j[1][0] * dx + j[0][0] * dz) / det;
    lon += dl; lat += dp; if (Math.abs(dx) + Math.abs(dz) < 1e-6) break;
  }
  return [lon, lat];
}

// the fixed transform ENU <-> model frame, from its parameters { a, b, tx, tn, ty }
export function modelFrame(P) {
  const s2 = P.a * P.a + P.b * P.b;
  return Object.freeze({
    fromEnu: ([e, n, u = 0]) => [P.a * e - P.b * n + P.tx, u + P.ty, -(P.b * e + P.a * n + P.tn)],
    toEnu: ([x, y, z]) => { const X = x - P.tx, N = -z - P.tn; return [(P.a * X + P.b * N) / s2, (-P.b * X + P.a * N) / s2, y - P.ty]; },
    scale: Math.sqrt(s2), rotationDeg: Math.atan2(P.b, P.a) * 180 / Math.PI,
  });
}

// Fit the fixed transform to the area.js fit over a lon/lat box (k x k grid, points at the origin's height) and measure
// it on a finer grid (m x m). Returns { origin, params, horizontal: { max, rms }, vertical: { maxDrop } } in metres.
export function fitModelFrame(G, bbox, { k = 21, m = 61 } = {}) {
  const [lon, lat] = geoLonLat(G, 0, 0), origin = { lon, lat, h: geoidN(lon, lat) }, F = enuFrame(origin);
  const grid = q => { const out = []; for (let i = 0; i < q; i++) for (let j = 0; j < q; j++) out.push([bbox[0] + (bbox[2] - bbox[0]) * i / (q - 1), bbox[1] + (bbox[3] - bbox[1]) * j / (q - 1)]); return out; };
  // least squares for (a, b, tx, tn): rows [e, -n, 1, 0] -> x and [n, e, 0, 1] -> -z
  const M = Array.from({ length: 4 }, () => new Array(5).fill(0));
  for (const [lo, la] of grid(k)) {
    const [e, n] = F.toEnu(lo, la, origin.h), [x, z] = geoXZ(G, lo, la);
    for (const [r, y] of [[[e, -n, 1, 0], x], [[n, e, 0, 1], -z]]) for (let p = 0; p < 4; p++) { for (let q = 0; q < 4; q++) M[p][q] += r[p] * r[q]; M[p][4] += r[p] * y; }
  }
  for (let c = 0; c < 4; c++) { let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let q = c; q <= 4; q++) M[r][q] -= f * M[c][q]; } }
  const [a, b, tx, tn] = M.map((r, i) => r[4] / r[i]), params = { a, b, tx, tn, ty: 0 }, T = modelFrame(params);
  let max = 0, ss = 0, cnt = 0, maxDrop = 0, at = null;
  for (const [lo, la] of grid(m)) {
    const enu = F.toEnu(lo, la, origin.h), [x, , z] = T.fromEnu(enu), [xr, zr] = geoXZ(G, lo, la), d = Math.hypot(x - xr, z - zr);
    if (d > max) { max = d; at = [lo, la]; } ss += d * d; cnt++;
    maxDrop = Math.max(maxDrop, curvatureDrop(Math.hypot(enu[0], enu[1]), origin, Math.atan2(enu[0], enu[1]) * 180 / Math.PI));
  }
  return { origin, params, scale: T.scale, rotationDeg: T.rotationDeg, horizontal: { max, rms: Math.sqrt(ss / cnt), at, points: cnt }, vertical: { maxDrop } };
}

// Exact conversions through geodetic coordinates (the area.js fit for x, z; OSGM15 for y): no flat-earth terms.
export function exactToModel(G, lon, lat, h) { const [x, z] = geoXZ(G, lon, lat); return [x, odnFromEllipsoid(lon, lat, h), z]; }
export function exactFromModel(G, x, y, z) { const [lon, lat] = geoLonLat(G, x, z); return { lon, lat, h: ellipsoidFromOdn(lon, lat, y) }; }
