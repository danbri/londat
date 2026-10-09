// Tide of the Three.js port of the Docklands 3D page (docklands/): our own harmonic prediction of the Thames level from
// cwplans/docklands/data/sky/tide-harmonics.json (cwplans/tools/fit-tide-harmonics.mjs fits it to Environment Agency
// 15-minute readings, OGL v3.0), the level along the river (linear in chainage between the gauges, as sky.js tideAt),
// high and low waters, and the TSL node `tideOffset` that lifts the tidal water polygons to that level.
// The astronomy and the nodal corrections here are the ones the fit used (the tool imports this file: one copy).
// Pure functions first (Node imports them); the TSL part loads only in a browser. Skill: docklands-sky, "Tide prediction".

const D2R = Math.PI / 180;
const norm = a => ((a % 360) + 360) % 360;

// Doodson numbers [tau, s, h, p, N', p1] and a phase offset (degrees); nodal: the formula of f and u (Pugh 1987, table
// 4.3, after Schureman); a compound is a sum of others (its V, u) and a product (its f). The phases g that the fit gives
// are lags on these arguments (tau = 15 deg/h x UT + h - s), so they are self-consistent, not Admiralty phases.
export const CONSTITUENTS = {
  Sa: { d: [0, 0, 1, 0, 0, 0], o: 0, n: 1 }, Ssa: { d: [0, 0, 2, 0, 0, 0], o: 0, n: 1 },
  Mm: { d: [0, 1, 0, -1, 0, 0], o: 0, n: 'Mm' }, MSf: { d: [0, 2, -2, 0, 0, 0], o: 0, n: 'MSf' }, Mf: { d: [0, 2, 0, 0, 0, 0], o: 0, n: 'Mf' },
  Q1: { d: [1, -2, 0, 1, 0, 0], o: -90, n: 'O1' }, O1: { d: [1, -1, 0, 0, 0, 0], o: -90, n: 'O1' },
  P1: { d: [1, 1, -2, 0, 0, 0], o: -90, n: 1 }, K1: { d: [1, 1, 0, 0, 0, 0], o: 90, n: 'K1' },
  J1: { d: [1, 2, 0, -1, 0, 0], o: 90, n: 'J1' }, OO1: { d: [1, 3, 0, 0, 0, 0], o: 90, n: 'OO1' },
  '2N2': { d: [2, -2, 0, 2, 0, 0], o: 0, n: 'M2' }, MU2: { d: [2, -2, 2, 0, 0, 0], o: 0, n: 'M2' },
  N2: { d: [2, -1, 0, 1, 0, 0], o: 0, n: 'M2' }, NU2: { d: [2, -1, 2, -1, 0, 0], o: 0, n: 'M2' },
  M2: { d: [2, 0, 0, 0, 0, 0], o: 0, n: 'M2' }, L2: { d: [2, 1, 0, -1, 0, 0], o: 180, n: 'M2' },
  T2: { d: [2, 2, -3, 0, 0, 1], o: 0, n: 1 }, S2: { d: [2, 2, -2, 0, 0, 0], o: 0, n: 1 }, K2: { d: [2, 2, 0, 0, 0, 0], o: 0, n: 'K2' },
  M3: { d: [3, 0, 0, 0, 0, 0], o: 180, n: 'M3' },
  MO3: { c: { M2: 1, O1: 1 } }, MK3: { c: { M2: 1, K1: 1 } },
  MN4: { c: { M2: 1, N2: 1 } }, M4: { c: { M2: 2 } }, MS4: { c: { M2: 1, S2: 1 } }, MK4: { c: { M2: 1, K2: 1 } }, S4: { c: { S2: 2 } },
  '2MN6': { c: { M2: 2, N2: 1 } }, M6: { c: { M2: 3 } }, '2MS6': { c: { M2: 2, S2: 1 } }, '2SM6': { c: { S2: 2, M2: 1 } },
  M8: { c: { M2: 4 } }, '3MS8': { c: { M2: 3, S2: 1 } },
};

// mean longitudes (degrees) at t (ms UTC): Meeus, Astronomical Algorithms, ch. 47 and 25 (enough for tides)
export function astro(t) {
  const T = (t / 864e5 + 2440587.5 - 2451545.0) / 36525, ut = ((t % 864e5) + 864e5) % 864e5 / 36e5;
  const s = norm(218.3164477 + 481267.88123421 * T), h = norm(280.46646 + 36000.76983 * T), p = norm(83.3532465 + 4069.0137287 * T),
    N = norm(125.04452 - 1934.136261 * T), p1 = norm(282.93735 + 1.71946 * T);
  return { tau: norm(15 * ut + h - s), s, h, p, N, p1 };
}
// node factor f and phase u (degrees) by formula; N the longitude of the Moon's ascending node
function nodal(k, N) {
  const n = N * D2R, c = Math.cos, s = Math.sin;
  switch (k) {
    case 'M2': return [1.0004 - 0.0373 * c(n) + 0.0002 * c(2 * n), -2.14 * s(n)];
    case 'K2': return [1.0241 + 0.2863 * c(n) + 0.0083 * c(2 * n) - 0.0015 * c(3 * n), -17.74 * s(n) + 0.68 * s(2 * n) - 0.04 * s(3 * n)];
    case 'K1': return [1.0060 + 0.1150 * c(n) - 0.0088 * c(2 * n) + 0.0006 * c(3 * n), -8.86 * s(n) + 0.68 * s(2 * n) - 0.07 * s(3 * n)];
    case 'O1': return [1.0089 + 0.1871 * c(n) - 0.0147 * c(2 * n) + 0.0014 * c(3 * n), 10.80 * s(n) - 1.34 * s(2 * n) + 0.19 * s(3 * n)];
    case 'J1': return [1.0129 + 0.1676 * c(n) - 0.0170 * c(2 * n) + 0.0016 * c(3 * n), -12.94 * s(n) + 1.34 * s(2 * n) - 0.19 * s(3 * n)];
    case 'OO1': return [1.1027 + 0.6504 * c(n) + 0.0317 * c(2 * n) - 0.0014 * c(3 * n), -36.68 * s(n) + 4.02 * s(2 * n) - 0.57 * s(3 * n)];
    case 'Mm': return [1.0000 - 0.1300 * c(n) + 0.0013 * c(2 * n), 0];
    case 'Mf': return [1.0429 + 0.4135 * c(n) - 0.0040 * c(2 * n), -23.74 * s(n) + 2.68 * s(2 * n) - 0.38 * s(3 * n)];
    case 'MSf': { const [f, u] = nodal('M2', N); return [f, -u]; }
    case 'M3': { const [f, u] = nodal('M2', N); return [f ** 1.5, 1.5 * u]; }
    default: return [1, 0];
  }
}
// { V + u (degrees), f } of every constituent at t
export function argsAt(t, names = Object.keys(CONSTITUENTS)) {
  const a = astro(t), base = {}, out = {};
  const one = k => {
    if (base[k]) return base[k]; const C = CONSTITUENTS[k];
    if (C.c) { let V = 0, f = 1; for (const [m, n] of Object.entries(C.c)) { const b = one(m); V += n * b.V; f *= b.f ** n; } return (base[k] = { V: norm(V), f }); }
    const d = C.d, V = d[0] * a.tau + d[1] * a.s + d[2] * a.h + d[3] * a.p + d[4] * -a.N + d[5] * a.p1 + C.o;
    const [f, u] = C.n === 1 ? [1, 0] : nodal(C.n, a.N);
    return (base[k] = { V: norm(V + u), f });
  };
  for (const k of names) out[k] = one(k);
  return out;
}
// the level (m OD) of one station's harmonics { z0, h: { name: [amplitude m, phase lag deg] } } at t
export function predict(S, t) {
  const A = argsAt(t, Object.keys(S.h)); let v = S.z0;
  for (const [k, [amp, g]] of Object.entries(S.h)) v += A[k].f * amp * Math.cos((A[k].V - g) * D2R);
  return v;
}
// high and low waters between t0 and t1 (ms): 6-minute steps, then a parabola through three points
export function extremes(S, t0, t1, step = 6 * 60e3) {
  const out = []; let a = predict(S, t0 - step), b = predict(S, t0);
  for (let t = t0; t <= t1; t += step) {
    const c = predict(S, t + step);
    if ((b > a && b >= c) || (b < a && b <= c)) { const den = a - 2 * b + c, dx = den ? 0.5 * (a - c) / den : 0; out.push({ t: t + dx * step, v: b - 0.25 * (a - c) * dx, hw: b > a }); }
    a = b; b = c;
  }
  return out;
}
// the tide along the river: chainage (m) along a centreline [[x, z], ...] (sky.js chainage: the nearest vertex; beyond
// the ends, minus or plus the distance) and the stations' positions in the same frame
export function chainage(P) {
  const s = [0]; for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const at = (x, z) => { let b = 0, bd = 1e18; for (let i = 0; i < P.length; i++) { const d = (P[i][0] - x) ** 2 + (P[i][1] - z) ** 2; if (d < bd) { bd = d; b = i; } } return s[b] + (b === P.length - 1 || b === 0 ? Math.sqrt(bd) * (b === 0 ? -1 : 1) : 0); };
  return { at, len: s[s.length - 1] };
}
export class TideModel {
  // J: tide-harmonics.json; geo(lon, lat) -> [x, z]; P: the Thames centreline (river.json thames)
  constructor(J, geo, P) {
    this.J = J; this.C = chainage(P);
    this.st = Object.entries(J.stations).map(([id, s]) => { const [x, z] = geo(s.lon, s.lat); return { id, name: s.name, x, z, ch: this.C.at(x, z), H: s }; }).sort((a, b) => a.ch - b.ch);
  }
  // the station levels at t and the level at chainage ch (linear between stations, flat beyond the ends)
  levels(t) { return this.st.map(s => predict(s.H, t)); }
  along(L, ch) { const S = this.st; if (ch <= S[0].ch) return L[0]; for (let i = 1; i < S.length; i++) if (ch <= S[i].ch) { const f = (ch - S[i - 1].ch) / (S[i].ch - S[i - 1].ch); return L[i - 1] + (L[i] - L[i - 1]) * f; } return L[L.length - 1]; }
  // position along the stations in "station units" (0 at the first, 1 at the second, ...): the vertex attribute of the GPU path
  unit(ch) { const S = this.st; if (ch <= S[0].ch) return 0; for (let i = 1; i < S.length; i++) if (ch <= S[i].ch) return i - 1 + (ch - S[i - 1].ch) / (S[i].ch - S[i - 1].ch); return S.length - 1; }
  levelAt(t, x, z) { return this.along(this.levels(t), this.C.at(x, z)); }
  // a virtual station at (x, z): harmonics interpolated (amplitudes and phases separately), for extremes there
  at(x, z) {
    const ch = this.C.at(x, z), S = this.st; let i = 1; while (i < S.length - 1 && ch > S[i].ch) i++;
    const f = Math.max(0, Math.min(1, (ch - S[i - 1].ch) / (S[i].ch - S[i - 1].ch))), a = S[i - 1].H, b = S[i].H, h = {};
    for (const k of Object.keys(a.h)) if (b.h[k]) { let dg = b.h[k][1] - a.h[k][1]; dg -= 360 * Math.round(dg / 360); h[k] = [a.h[k][0] + (b.h[k][0] - a.h[k][0]) * f, a.h[k][1] + dg * f]; }
    return { z0: a.z0 + (b.z0 - a.z0) * f, h };
  }
}

// ---------- GPU: the tidal water follows the level (browser only)
// tideU.l: the station levels now (m OD, up to 4 stations, in chainage order); tideU.on: 0 until the tide layer has set them.
// Vertex attributes of build.js waterGeometry: 'tidal' (1 tidal polygon, 0 other water), 'tbase' (the height the vertex
// was built at, m OD), 'tunit' (position along the stations, TideModel.unit). Offset = on x (level at tunit - tbase).
// waterMaterial: m.positionNode = positionLocal.add(vec3(0, attribute('tidal', 'float').mul(tideOffset), 0))
const TSL = globalThis.window ? await import('three/tsl') : null;
export const tideU = TSL ? { l: [0, 1, 2, 3].map(() => TSL.uniform(2.8)), on: TSL.uniform(0) } : null;
export const tideOffset = TSL ? (() => {
  const { attribute, mix, clamp } = TSL, u = attribute('tunit', 'float'), L = tideU.l;
  const lev = mix(mix(mix(L[0], L[1], clamp(u, 0, 1)), L[2], clamp(u.sub(1), 0, 1)), L[3], clamp(u.sub(2), 0, 1));
  return lev.sub(attribute('tbase', 'float')).add(0.05).mul(tideU.on);
})() : null;
