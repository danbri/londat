// Locale-free geodesy core of the port and the tools (OKR O1 / O2, https://github.com/danbri/londat/issues/6 and /7).
// No place, projection, datum or time zone of any country is in this file: the WGS84 ellipsoid, geodetic <-> ECEF
// (earth-centred, earth-fixed) and local east-north-up (ENU) frames at any origin, the ellipsoid normal, radii of
// curvature and the curvature drop. Plain ES module, no dependencies: the browser (docklands/) and node (tools) import it.
// Angles in degrees at the API (lon, lat), metres for lengths; double precision throughout (float32 only on the GPU,
// after a floating origin: docs/planet-architecture.md).
// Design: https://github.com/danbri/londat/blob/main/docs/planet-architecture.md ; tests: docklands/geo/test/.

export const WGS84 = Object.freeze({ a: 6378137, f: 1 / 298.257223563 });
const { a: A, f: F } = WGS84;
const B = A * (1 - F), E2 = F * (2 - F), EP2 = E2 / (1 - E2);
export const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// prime vertical (N) and meridian (M) radii of curvature at latitude lat (degrees); Gaussian mean radius sqrt(M N);
// the radius of the normal section at azimuth az (Euler)
export const primeVerticalRadius = lat => { const s = Math.sin(lat * D2R); return A / Math.sqrt(1 - E2 * s * s); };
export const meridianRadius = lat => { const s = Math.sin(lat * D2R); return A * (1 - E2) / Math.pow(1 - E2 * s * s, 1.5); };
export const gaussianRadius = lat => Math.sqrt(primeVerticalRadius(lat) * meridianRadius(lat));
export const sectionRadius = (lat, az = 0) => { const c = Math.cos(az * D2R), s = Math.sin(az * D2R), M = meridianRadius(lat), N = primeVerticalRadius(lat); return 1 / (c * c / M + s * s / N); };

// geodetic (lon, lat degrees, h metres above the ellipsoid) -> ECEF [x, y, z] metres
export function geodeticToEcef(lon, lat, h = 0) {
  const l = lon * D2R, p = lat * D2R, sp = Math.sin(p), cp = Math.cos(p), N = A / Math.sqrt(1 - E2 * sp * sp);
  return [(N + h) * cp * Math.cos(l), (N + h) * cp * Math.sin(l), (N * (1 - E2) + h) * sp];
}

// ECEF -> geodetic { lon, lat, h }. Bowring's start, then Newton on the latitude (3 rounds: below 1e-11 degrees and
// 0.1 mm from the earth's centre region excepted to geostationary heights; tests in test/geo.test.mjs).
export function ecefToGeodetic(x, y, z) {
  const lon = Math.atan2(y, x), p = Math.hypot(x, y);
  if (p < 1e-9) return { lon: lon * R2D, lat: z >= 0 ? 90 : -90, h: Math.abs(z) - B };
  let th = Math.atan2(z * A, p * B), lat = Math.atan2(z + EP2 * B * Math.sin(th) ** 3, p - E2 * A * Math.cos(th) ** 3), h = 0;
  for (let i = 0; i < 3; i++) {
    const s = Math.sin(lat), c = Math.cos(lat), N = A / Math.sqrt(1 - E2 * s * s);
    h = Math.abs(c) > 1e-9 ? p / c - N : Math.abs(z) / Math.abs(s) - N * (1 - E2);
    lat = Math.atan2(z, p * (1 - E2 * N / (N + h)));
  }
  const s = Math.sin(lat), c = Math.cos(lat), N = A / Math.sqrt(1 - E2 * s * s);
  h = Math.abs(c) > 1e-6 ? p / c - N : Math.abs(z) / Math.abs(s) - N * (1 - E2);
  return { lon: lon * R2D, lat: lat * R2D, h };
}

// the outward ellipsoid normal (geodetic up) at lon, lat: a unit ECEF vector. East and north complete the ENU basis.
export function enuBasis(lon, lat) {
  const l = lon * D2R, p = lat * D2R, sl = Math.sin(l), cl = Math.cos(l), sp = Math.sin(p), cp = Math.cos(p);
  return { east: [-sl, cl, 0], north: [-sp * cl, -sp * sl, cp], up: [cp * cl, cp * sl, sp] };
}
export const ellipsoidNormal = (lon, lat) => enuBasis(lon, lat).up;

// A local east-north-up frame with its origin at { lon, lat, h }: a tangent plane frame, right-handed (x east, y north,
// z up). Exact (no small-angle terms): toEnu(fromEnu(p)) round-trips to below 1e-8 m within 1,000 km.
export function enuFrame(origin) {
  const { lon, lat, h = 0 } = origin, o = geodeticToEcef(lon, lat, h), { east: E, north: N, up: U } = enuBasis(lon, lat);
  const ecefToEnu = ([x, y, z]) => { const d = [x - o[0], y - o[1], z - o[2]]; return [dot(E, d), dot(N, d), dot(U, d)]; };
  const enuToEcef = ([e, n, u]) => [0, 1, 2].map(i => o[i] + E[i] * e + N[i] * n + U[i] * u);
  return Object.freeze({
    origin: Object.freeze({ lon, lat, h }), ecef: o, east: E, north: N, up: U,
    ecefToEnu, enuToEcef,
    toEnu: (lon2, lat2, h2 = 0) => ecefToEnu(geodeticToEcef(lon2, lat2, h2)),
    fromEnu: (e, n, u = 0) => { const [x, y, z] = enuToEcef([e, n, u]); return ecefToGeodetic(x, y, z); },
    // the 4x4 column-major matrix ENU -> ECEF (for a tile's transform in 3D Tiles, or a three.js Matrix4.fromArray)
    matrix: () => [E[0], E[1], E[2], 0, N[0], N[1], N[2], 0, U[0], U[1], U[2], 0, o[0], o[1], o[2], 1],
  });
}
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

// Curvature drop: how far the ellipsoid surface (h = 0 under the origin's height) lies below the tangent plane of the
// origin, at horizontal distance d (metres, measured in the plane) in direction az (degrees from north). Exact on the
// ellipsoid (a few rounds of a fixed-point solve). About d^2 / (2 R): 0.078 m at 1 km, 7.8 m at 10 km, 126 m at 40 km.
export function curvatureDrop(d, origin, az = 0) {
  const F0 = enuFrame({ ...origin, h: 0 }), e = d * Math.sin(az * D2R), n = d * Math.cos(az * D2R);
  let u = -d * d / (2 * sectionRadius(origin.lat, az));
  for (let i = 0; i < 6; i++) { const g = F0.fromEnu(e, n, u); u -= g.h * 1; const g2 = F0.fromEnu(e, n, u); if (Math.abs(g2.h) < 1e-9) break; }
  return -u;
}
// the same on a sphere of radius R, for a distance d in the tangent plane: R - sqrt(R^2 - d^2)
export const curvatureDropSphere = (d, R) => R - Math.sqrt(R * R - d * d);

// great-circle distance (m) on the Gaussian sphere at the mean latitude: for cell sizes and ranges, not for survey work
export function surfaceDistance(lon1, lat1, lon2, lat2) {
  const R = gaussianRadius((lat1 + lat2) / 2), p1 = lat1 * D2R, p2 = lat2 * D2R, dp = p2 - p1, dl = (lon2 - lon1) * D2R;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
