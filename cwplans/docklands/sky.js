// Docklands 3D: the page clock, the sky (sun, moon, planets, Jupiter's moons, stars, constellation lines, Milky Way,
// satellites, cloud and haze), the weather and the Thames level for the time shown, and the Sky panel (Menu > Sky).
// Loaded by index.html before the main script. The main script calls DocklandsSky.draw(ctx) for the sky behind the
// scene and DocklandsSky.after(ctx) at the end of each frame (azimuth lines on the map).
// Libraries: vendor/astronomy.browser.min.js (astronomy-engine 2.1.19, Don Cross, MIT) and vendor/satellite.min.js
// (satellite.js 7.1.0 subset, MIT). Data: data/sky/*.json, each registered in ../data-register.json; made by
// ../tools/fetch-sky.mjs. Method, sources and lessons: README.md "Sky, time, weather and tide".
(() => {
'use strict';
const AE = globalThis.Astronomy, SJ = globalThis.satellite, AREA = globalThis.DOCKLANDS_AREA;
const D2R = Math.PI / 180, R2D = 180 / Math.PI, $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// committed snapshots for the owner's photo evening (3 October 2026), London time 3 Oct 00:00 to 5 Oct 00:00
const SNAP = { date: '2026-10-03', t0: Date.parse('2026-10-02T23:00Z'), t1: Date.parse('2026-10-04T23:00Z') };
// the photo time solved from the moon in the owner's photos (reference/night-2026-10-03/README.md)
const PHOTO = { iso: '2026-10-03T23:56', note: 'photo time: 3 October 2026, 23:56 BST (± 4 min), solved from the moon in the owner\'s photos' };

// ---------- London time
const LDN = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const parts = t => { const o = {}; for (const p of LDN.formatToParts(new Date(t))) o[p.type] = p.value; return o; };
const offset = t => { const p = parts(t); return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000; };
function fromLondon(s) {   // '2026-10-03T22:30' (London wall clock) -> ms UTC
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?$/.exec(String(s).trim()); if (!m) return NaN;
  const u = Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0)); return u - offset(u - offset(u));
}
const isoL = t => { const p = parts(t); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
const hm = t => { if (t == null || !isFinite(t)) return '—'; const p = parts(t); return `${p.hour}:${p.minute}`; };
const tz = t => offset(t) > 0 ? 'BST' : 'GMT';
const dayL = t => new Date(t).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const atOf = r => r ? r.date.getTime() : null;

// ---------- model metres <-> WGS84 (the page's quadratic fit to OSTN15, area.js meta.geo) and the local frame
const G = AREA.meta.geo;
const geo = (lon, lat) => { const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; };
function lonLat(x, z) {   // Newton on the fit
  let lon = -0.02, lat = 51.5;
  for (let k = 0; k < 12; k++) { const e = 1e-5, [x0, z0] = geo(lon, lat), [x1, z1] = geo(lon + e, lat), [x2, z2] = geo(lon, lat + e), a = (x1 - x0) / e, b = (x2 - x0) / e, c = (z1 - z0) / e, d = (z2 - z0) / e, det = a * d - b * c, dx = x - x0, dz = z - z0; lon += (d * dx - b * dz) / det; lat += (-c * dx + a * dz) / det; }
  return [lon, lat];
}
const nrm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); }, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// viewpoints: the owner's photos were taken at Greenland Pier and a few metres west on the Thames path
const VPS = {
  greenland: { name: 'Greenland Pier', x: -830, z: 1158, y: 5.0 },
  cwpier: { name: 'Canary Wharf Pier', x: -639, z: -16, y: 4.5 },
  masthouse: { name: 'Masthouse Terrace Pier', x: -134, z: 1940, y: 4.4 },
  ocs: { name: 'One Canada Square', x: 0, z: 0, y: 240 },
  camera: { name: 'the camera' },
};

const S = {
  t: Date.now(), live: true, drive: false, dark: false, lines: true, mw: true, fetch: false, tideOn: true, azl: true, names: true, lcy: false, vp: 'greenland',
  obs: null, F: null, A: null, at: 0, ready: false, gl: null, P: {}, stars: null, lines_: null, wx: null, tide: null, sats: null, satPts: [], satAt: 0,
};

function setObserver() {
  const v = VPS[S.vp], cam = S.vp === 'camera' && S.cam, x = cam ? S.cam.eye[0] : v.x, z = cam ? S.cam.eye[2] : v.z, y = cam ? S.cam.eye[1] / (S.vz || 1) : v.y;
  const [lon, lat] = lonLat(x, z);
  // true north and east in model axes (x east, y up, -z north, grid north): from the fit's derivatives
  const [x0, z0] = geo(lon, lat), [xn, zn] = geo(lon, lat + 1e-4), N = nrm([xn - x0, 0, zn - z0]), E = nrm(cross(N, [0, 1, 0]));
  S.here = { x, z, y, lon, lat }; S.F = { N, E, U: [0, 1, 0] }; S.obs = new AE.Observer(lat, lon, Math.max(0, y)); S.obsGd = { latitude: lat * D2R, longitude: lon * D2R, height: Math.max(0, y) / 1000 };
}
// horizontal (altitude, true azimuth, degrees) -> model direction
const dirOf = (alt, az) => { const c = Math.cos(alt * D2R), n = c * Math.cos(az * D2R), e = c * Math.sin(az * D2R), u = Math.sin(alt * D2R), F = S.F; return [0, 1, 2].map(i => n * F.N[i] + e * F.E[i] + u * F.U[i]); };
const horToModel = h => { const F = S.F; return [0, 1, 2].map(i => h.x * F.N[i] - h.y * F.E[i] + h.z * F.U[i]); };   // astronomy-engine HOR: x north, y west, z up
const azOf = d => { const F = S.F; let a = Math.atan2(dot(d, F.E), dot(d, F.N)) * R2D; return (a + 360) % 360; };

// ---------- astronomy for the time shown
const PLANETS = [['Mercury', .9], ['Venus', .8], ['Mars', 1.4], ['Jupiter', .85], ['Saturn', 1.0]];
function compute() {
  const t = S.t, time = AE.MakeTime(new Date(t)), o = S.obs, out = { t };
  const body = name => { const eq = AE.Equator(name, time, o, true, true), h = AE.Horizon(time, o, eq.ra, eq.dec, 'normal'); return { name, alt: h.altitude, az: h.azimuth, dist: eq.dist, dir: dirOf(h.altitude, h.azimuth) }; };
  out.sun = body('Sun'); out.moon = body('Moon');
  const il = AE.Illumination('Moon', time); Object.assign(out.moon, { frac: il.phase_fraction, phase: il.phase_angle, mag: il.mag, elong: AE.MoonPhase(time), diam: 2 * Math.atan(1737.4 / (out.moon.dist * 149597870.7)) * R2D });
  // bright limb: the direction across the disc towards the sun, as an angle from the top of the disc (the zenith side), clockwise
  const m = out.moon.dir, sx = nrm(out.sun.dir.map((v, i) => v - m[i] * dot(out.sun.dir, m))), up = nrm([0, 1, 0].map((v, i) => v - m[i] * m[1])), rt = nrm(cross(m, [0, 1, 0]));
  out.moon.sx = sx; out.moon.limb = (Math.atan2(dot(sx, rt), dot(sx, up)) * R2D + 360) % 360;
  out.planets = PLANETS.map(([n, bv]) => Object.assign(body(n), { mag: AE.Illumination(n, time).mag, bv }));
  // EQJ (J2000 equator) -> model rotation, column-major for GLSL, from astronomy-engine's EQJ -> HOR rotation
  const R = AE.Rotation_EQJ_HOR(time, o), col = v => horToModel(AE.RotateVector(R, new AE.Vector(v[0], v[1], v[2], time)));
  const c0 = col([1, 0, 0]), c1 = col([0, 1, 0]), c2 = col([0, 0, 1]); out.M = new Float32Array([...c0, ...c1, ...c2]);
  const toEqj = d => [dot(d, c0), dot(d, c1), dot(d, c2)];   // inverse (orthonormal)
  // model -> galactic (for the Milky Way band): rows are the galactic axes expressed in model space
  const RG = AE.Rotation_EQJ_GAL(), gal = v => { const g = AE.RotateVector(RG, new AE.Vector(v[0], v[1], v[2], time)); return [g.x, g.y, g.z]; };
  const gm = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(e => gal(toEqj(e))); out.GM = new Float32Array([...gm[0], ...gm[1], ...gm[2]]);
  // Jupiter's Galilean moons: offsets from Jupiter (EQJ, AU) added to its geocentric vector, then placed round its refracted direction
  const jup = out.planets[3], jv = AE.GeoVector('Jupiter', time, true), jm = AE.JupiterMoons(time), J = [jv.x, jv.y, jv.z], uj = nrm(J), Mj = M3(out.M, uj);
  out.jmoons = [['Io', jm.io, 5.0], ['Europa', jm.europa, 5.3], ['Ganymede', jm.ganymede, 4.6], ['Callisto', jm.callisto, 5.7]].map(([n, s, mag]) => {
    const d = M3(out.M, nrm([J[0] + s.x, J[1] + s.y, J[2] + s.z])); return { name: n, mag, dir: nrm(jup.dir.map((v, i) => v + d[i] - Mj[i])), sep: Math.acos(Math.min(1, dot(d, Mj))) * R2D * 60 };
  });
  // the galactic centre (Sgr A*, J2000 RA 266.417, Dec -29.008)
  const gc = M3(out.M, eqjVec(266.417, -29.008)); out.gc = { alt: Math.asin(gc[1]) * R2D, az: azOf(gc) };
  S.A = out; S.at = t; return out;
}
const M3 = (M, v) => [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]];
const eqjVec = (ra, de) => [Math.cos(de * D2R) * Math.cos(ra * D2R), Math.cos(de * D2R) * Math.sin(ra * D2R), Math.sin(de * D2R)];

// rise, set, twilight, golden and blue hours for the London day of the time shown (computed on demand for the panel)
function dayTimes() {
  const d0 = fromLondon(isoL(S.t).slice(0, 10) + 'T00:00'), D = new Date(d0), o = S.obs;
  const alt = (dir, a) => atOf(AE.SearchAltitude('Sun', o, dir, D, 1, a)), rs = (b, dir) => atOf(AE.SearchRiseSet(b, o, dir, D, 1));
  const r = { d0, sunrise: rs('Sun', +1), sunset: rs('Sun', -1), moonrise: rs('Moon', +1), moonset: rs('Moon', -1),
    dawn: [alt(+1, -18), alt(+1, -12), alt(+1, -6)], dusk: [alt(-1, -6), alt(-1, -12), alt(-1, -18)],
    goldenAm: [alt(+1, -4), alt(+1, 6)], goldenPm: [alt(-1, 6), alt(-1, -4)], blueAm: [alt(+1, -6), alt(+1, -4)], bluePm: [alt(-1, -4), alt(-1, -6)] };
  // the galactic centre: highest point between dusk and the next dawn, in astronomical darkness
  let best = null; const R0 = AE.Rotation_EQJ_HOR; const v = eqjVec(266.417, -29.008);
  for (let k = 0; k <= 144; k++) { const t = d0 + 12 * 3600e3 + k * 600e3, time = AE.MakeTime(new Date(t)), sa = sunAltAt(t); if (sa > -18) continue;
    const h = AE.RotateVector(R0(time, o), new AE.Vector(v[0], v[1], v[2], time)), a = Math.asin(h.z) * R2D; if (!best || a > best.alt) best = { t, alt: a }; }
  r.gcBest = best; return r;
}
const sunAltAt = t => { const time = AE.MakeTime(new Date(t)), eq = AE.Equator('Sun', time, S.obs, true, true); return AE.Horizon(time, S.obs, eq.ra, eq.dec, null).altitude; };
const phaseName = e => e < 6 || e > 354 ? 'new moon' : e < 84 ? 'waxing crescent' : e < 96 ? 'first quarter' : e < 174 ? 'waxing gibbous' : e < 186 ? 'full moon' : e < 264 ? 'waning gibbous' : e < 276 ? 'last quarter' : 'waning crescent';
const compass = a => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(((a % 360) + 360) % 360 / 22.5) % 16];
const clockWord = a => ['top', 'upper right', 'right', 'lower right', 'bottom', 'lower left', 'left', 'upper left'][Math.round(a / 45) % 8];

// ---------- data: stars, constellation lines, snapshots, live fetches (only when the visitor ticks "Fetch")
const getJSON = async (u, ms = 20000) => { const c = new AbortController(), k = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); } finally { clearTimeout(k); } };
const once = {}; const load = (k, u) => once[k] || (once[k] = getJSON(u).catch(e => { delete once[k]; throw e; }));
const inSnap = t => t >= SNAP.t0 && t < SNAP.t1;

// weather: hourly values for the time shown (linear between hours)
const WX = { days: {} };
async function weatherDay(day) {
  if (WX.days[day]) return WX.days[day];
  const snap = day === SNAP.date || day === '2026-10-04';
  if (snap) { const d = await load('wx', `data/sky/weather-${SNAP.date}.json`); return (WX.days[day] = { src: 'snapshot', d }); }
  if (!S.fetch) return null;
  const H = 'temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m,wind_direction_10m';
  const ageDays = (Date.now() - Date.parse(day + 'T12:00Z')) / 864e5, nx = new Date(Date.parse(day + 'T12:00Z') + 864e5).toISOString().slice(0, 10);
  if (ageDays < -15) return (WX.days[day] = { src: 'none', why: 'Open-Meteo forecasts reach 16 days ahead' });
  const u = ageDays > 85 ? `https://archive-api.open-meteo.com/v1/archive?latitude=51.505&longitude=-0.02&start_date=${day}&end_date=${nx}&hourly=${H.replace(',visibility', '')}&timezone=Europe%2FLondon`
    : `https://api.open-meteo.com/v1/forecast?latitude=51.505&longitude=-0.02&start_date=${day}&end_date=${nx}&hourly=${H}&timezone=Europe%2FLondon`;
  const d = await getJSON(u); return (WX.days[day] = { src: ageDays > 85 ? 'archive (ERA5, no visibility)' : ageDays > 0 ? 'past hours of the forecast models' : 'forecast', d: { hourly: d.hourly, url: u } });
}
function wxAt(rec, t) {
  if (!rec || !rec.d) return null; const H = rec.d.hourly, key = isoL(t), hr = key.slice(0, 13) + ':00', i = H.time.indexOf(hr); if (i < 0) return null;
  const f = +key.slice(14, 16) / 60, j = Math.min(H.time.length - 1, i + 1), o = { src: rec.src, url: rec.d.url };
  for (const k of Object.keys(H)) if (k !== 'time') o[k] = H[k][i] == null ? null : H[k][j] == null || k === 'weather_code' || k === 'wind_direction_10m' ? H[k][i] : H[k][i] + (H[k][j] - H[k][i]) * f;
  return o;
}

// tide: EA gauges Tower Pier (upstream) and Charlton (downstream), interpolated by distance along the Thames centreline
const TIDE = { days: {}, chain: null };
async function chainage() {
  if (TIDE.chain) return TIDE.chain; const r = await load('river', 'data/river.json'), P = r.thames, s = [0];
  for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const at = (x, z) => { let b = 0, bd = 1e18; for (let i = 0; i < P.length; i++) { const d = (P[i][0] - x) ** 2 + (P[i][1] - z) ** 2; if (d < bd) { bd = d; b = i; } } return s[b] + (b === P.length - 1 || b === 0 ? Math.sqrt(bd) * (b === 0 ? -1 : 1) : 0); };
  return (TIDE.chain = { at, len: s[s.length - 1] });
}
async function tideDay(day) {
  if (TIDE.days[day]) return TIDE.days[day];
  if (day === SNAP.date || day === '2026-10-04') { const d = await load('tide', `data/sky/tide-${SNAP.date}.json`); return (TIDE.days[day] = { src: 'snapshot', st: d.stations }); }
  if (!S.fetch) return null;
  const t0 = Date.parse(day + 'T00:00Z'); if (t0 > Date.now()) return (TIDE.days[day] = { src: 'none', why: 'the EA publishes readings, not predictions' });
  const nx = d => new Date(Date.parse(d + 'T12:00Z') + 864e5).toISOString().slice(0, 10), st = {};
  for (const [id, name] of [['0007', 'Tower Pier'], ['0003', 'Charlton'], ['0001', 'Silvertown']]) {
    const s = (await getJSON(`https://environment.data.gov.uk/flood-monitoring/id/stations/${id}`)).items;
    const u = `https://environment.data.gov.uk/flood-monitoring/id/measures/${id}-level-tidal_level-i-15_min-mAOD/readings?startdate=${day}&enddate=${nx(nx(day))}&_sorted&_limit=1000`;
    st[id] = { name, lat: s.lat, lon: s.long, url: u, readings: (await getJSON(u)).items.map(x => [x.dateTime, x.value]).sort((a, b) => a[0] < b[0] ? -1 : 1) };
  }
  return (TIDE.days[day] = { src: 'EA API', st });
}
function levelAt(R, t) {   // linear between readings no more than 30 min apart; trend in m per hour
  let lo = null, hi = null; for (const r of R) { const tt = Date.parse(r[0]); if (tt <= t) lo = [tt, r[1]]; else { hi = [tt, r[1]]; break; } }
  if (!lo || !hi || hi[0] - lo[0] > 1800e3) return null; const v = lo[1] + (hi[1] - lo[1]) * (t - lo[0]) / (hi[0] - lo[0]); return { v, trend: (hi[1] - lo[1]) / ((hi[0] - lo[0]) / 3600e3) };
}
// gauge faults: a reading is dropped when its difference from the nearest other gauge departs by more than 0.45 m from
// the median of that difference over the 2 hours either side (the difference between neighbouring gauges changes
// slowly; a dry or faulty gauge jumps). Example: Tower Pier, 4 Oct 2026 00:00 to 01:15 UTC, five readings 0.4 to 0.9 m
// off (README "Sky, time, weather and tide", fault F21).
function cleanGauges(st) {
  const ids = Object.keys(st), out = {}; if (ids.length < 2) return st;
  const D = (a, b) => (st[a].lat - st[b].lat) ** 2 + ((st[a].lon - st[b].lon) * .62) ** 2;
  for (const id of ids) {
    const ref = ids.filter(k => k !== id).sort((a, b) => D(id, a) - D(id, b))[0], R = new Map(st[ref].readings), d = st[id].readings.map(([t, v]) => [Date.parse(t), R.has(t) ? v - R.get(t) : null]);
    const keep = st[id].readings.filter((r, i) => { if (d[i][1] == null) return true; const w = d.filter(q => q[1] != null && Math.abs(q[0] - d[i][0]) <= 2 * 3600e3).map(q => q[1]).sort((a, b) => a - b); return Math.abs(d[i][1] - w[w.length >> 1]) <= .45; });
    out[id] = { ...st[id], readings: keep, dropped: st[id].readings.length - keep.length };
  }
  return out;
}
// the level along the river: linear in chainage between the gauges (Tower Pier, Charlton, Silvertown; the EA has no tidal
// gauge between Tower Pier and Charlton), held flat beyond the end gauges. field(x, z) gives the level anywhere in the model.
async function tideAt(t) {
  const rec = await tideDay(isoL(t).slice(0, 10)); if (!rec) return null; if (!rec.st) return { why: rec.why };
  if (!rec.clean) { rec.clean = cleanGauges(rec.st); }
  const C = await chainage(), here = C.at(S.here.x, S.here.z), pts = [];
  for (const [id, s] of Object.entries(rec.clean)) { const [x, z] = geo(s.lon, s.lat), L = levelAt(s.readings, t); if (L) pts.push({ id, name: s.name, ch: C.at(x, z), dropped: s.dropped, ...L }); }
  if (!pts.length) return { why: 'no gauge reading at that time' };
  pts.sort((a, b) => a.ch - b.ch);
  const along = (ch, k) => { if (ch <= pts[0].ch) return pts[0][k]; for (let i = 1; i < pts.length; i++) if (ch <= pts[i].ch) { const a = pts[i - 1], b = pts[i], f = (ch - a.ch) / (b.ch - a.ch); return a[k] + (b[k] - a[k]) * f; } return pts[pts.length - 1][k]; };
  const field = (x, z) => along(C.at(x, z), 'v');
  return { v: along(here, 'v'), trend: along(here, 'trend'), here, pts, field, ends: [along(0, 'v'), along(C.len, 'v')], src: rec.src };
}

// satellites: CelesTrak GP data (OMM) propagated with SGP4 (satellite.js); a point when above the horizon, in sunlight
// and the sky is dark (the sun 6 degrees or more below the horizon)
async function satRecs() {
  const age = Math.abs(S.t - Date.parse('2026-10-04T06:00Z')) / 864e5;
  if (age < 7) { if (!S.satSnap) { const d = await load('sats', `data/sky/sats-${SNAP.date}.json`); S.satSnap = { src: 'snapshot ' + d.fetched.slice(0, 10), recs: d.sats.map(rec).filter(Boolean) }; } return S.satSnap; }
  if (!S.fetch) return null;
  if (!S.satLive) {
    let d = null; try { const c = JSON.parse(localStorage.getItem('dl-celestrak') || 'null'); if (c && Date.now() - c.at < 2 * 3600e3) d = c.d; } catch { /* storage blocked */ }
    if (!d) { d = []; for (const u of ['https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json', 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json']) d.push(...await getJSON(u)); try { localStorage.setItem('dl-celestrak', JSON.stringify({ at: Date.now(), d })); } catch { /* storage blocked */ } }
    const seen = new Set(); S.satLive = { src: 'CelesTrak live', recs: d.filter(o => !seen.has(o.NORAD_CAT_ID) && seen.add(o.NORAD_CAT_ID)).map(rec).filter(Boolean) };
  }
  return Math.abs(S.t - Date.now()) / 864e5 < 10 ? S.satLive : null;
}
function rec(o) { try { const r = SJ.json2satrec(o); return { r, name: o.OBJECT_NAME, id: o.NORAD_CAT_ID, std: o.NORAD_CAT_ID === 25544 ? -1.3 : o.NORAD_CAT_ID === 48274 ? 0 : 4.0 }; } catch { return null; } }
function sunEci(t) { const v = AE.GeoVector('Sun', AE.MakeTime(new Date(t)), true); return [v.x * 149597870.7, v.y * 149597870.7, v.z * 149597870.7]; }
function satLook(s, t, sun) {
  const pv = SJ.propagate(s.r, new Date(t)); if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
  const p = pv.position, la = SJ.ecfToLookAngles(S.obsGd, SJ.eciToEcf(p, SJ.gstime(new Date(t)))), el = la.elevation * R2D;
  const su = nrm(sun), pr = p.x * su[0] + p.y * su[1] + p.z * su[2], perp = Math.hypot(p.x - pr * su[0], p.y - pr * su[1], p.z - pr * su[2]);
  return { el, az: la.azimuth * R2D, range: la.rangeSat, lit: pr > 0 || perp > 6371 };
}
function satPoints() {
  const out = []; if (!S.satSet || !S.A || S.A.sun.alt > -6) return out; const sun = sunEci(S.t);
  for (const s of S.satSet.recs) { const L = satLook(s, S.t, sun); if (!L || L.el < 0 || !L.lit) continue; out.push({ name: s.name, id: s.id, alt: L.el, az: L.az, mag: s.std + 5 * Math.log10(L.range / 1000), dir: dirOf(L.el, L.az) }); }
  return out;
}
function nextIss(from) {   // first ISS pass after `from` that is above 10 degrees, sunlit and in a dark sky (sun < -6), within 3 days
  const s = S.satSet && S.satSet.recs.find(r => r.id === 25544); if (!s) return null;
  const sa = []; for (let k = 0; k <= 72 * 6; k++) sa.push(sunAltAt(from + k * 600e3));
  let pass = null;
  for (let t = from; t < from + 72 * 3600e3; t += 20e3) {
    const L = satLook(s, t, sunEci(t)), dark = sa[Math.round((t - from) / 600e3)] < -6, ok = L && L.el > 10 && L.lit && dark;
    if (ok) { if (!pass) pass = { t0: t, az0: L.az, max: L.el, tmax: t, azmax: L.az }; else if (L.el > pass.max) Object.assign(pass, { max: L.el, tmax: t, azmax: L.az }); pass.t1 = t; pass.az1 = L.az; }
    else if (pass) return pass;
  }
  return pass;
}

// cloud mask: EUMETSAT Meteosat Cloud Mask (CLM) through EUMETView (CC BY 4.0, Core data), a box 50.5-52.5 N, 1.6 W-1.6 E.
// The committed image is the 15-minute slot nearest the photo time; other times are fetched only with "Fetch" ticked.
// The mask places the cloud: each layer's cover (Open-Meteo) is raised where the satellite sees cloud and lowered where it
// sees clear sky, keeping the layer's mean; the pattern moves with the wind for up to 90 minutes from the image time.
const CLM = { box: [50.5, -1.6, 52.5, 1.6], snap: { t: Date.parse('2026-10-03T23:00Z'), url: 'data/sky/clm-20261003T2300Z.png' }, cache: {} };
const clmUrl = t => `https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=msg_fes:clm&styles=&crs=EPSG:4326&bbox=${CLM.box.join(',')}&width=256&height=256&format=image/png&time=${new Date(t).toISOString()}`;
function clmFor(t) {   // { t, url, src } of the image to use for time t, or null
  if (Math.abs(t - CLM.snap.t) <= 90 * 60e3) return { ...CLM.snap, src: 'snapshot' };
  if (!S.fetch || t < Date.parse('2020-09-01T00:00Z')) return null;
  const slot = Math.floor(Math.min(t, Date.now() - 30 * 60e3) / 900e3) * 900e3; if (t - slot > 90 * 60e3) return null;   // the mask appears about 25 minutes after the slot
  return { t: slot, url: clmUrl(slot), src: 'EUMETView live' };
}
function clmLoad(gl, c) {   // decode the colours (white = cloud) to a luminance texture; the mean cloud within 60 km
  if (CLM.cache[c.url]) return CLM.cache[c.url]; const rec = CLM.cache[c.url] = { ...c, ready: false };
  const im = new Image(); im.crossOrigin = 'anonymous';
  im.onload = () => { try { const k = document.createElement('canvas'); k.width = 256; k.height = 256; const g = k.getContext('2d'); g.drawImage(im, 0, 0, 256, 256); const px = g.getImageData(0, 0, 256, 256).data, a = new Uint8Array(256 * 256); let n = 0, m = 0;
      for (let i = 0; i < a.length; i++) { const r = px[4 * i], gg = px[4 * i + 1], b = px[4 * i + 2]; a[i] = r > 200 && gg > 200 && b > 200 ? 255 : 0; const x = i % 256 - 128, y = (i >> 8) - 128; if (x * x + y * y < 70 * 70) { n++; m += a[i] / 255; } }
      rec.tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, rec.tex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 256, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, a);
      for (const [k2, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k2, v);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); rec.mean = m / n; rec.ready = true; redraw(); panel(); } catch (e) { rec.err = e.message; } };
  im.onerror = () => { rec.err = 'did not load'; panel(); }; im.src = c.url; return rec;
}

// ---------- WebGL: a full-screen sky (background pass; moon and cloud pass) and points/lines for stars and the rest
const PRE = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
const NOISE = 'float hs(vec2 p){p=mod(p,289.);vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}' +
  'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1.,0.)),f.x),mix(hs(i+vec2(0.,1.)),hs(i+1.),f.x),f.y);}' +
  'float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+vec2(17.1,9.2);a*=.5;}return s/.97;}';
const SKY_FS = PRE + 'varying vec2 n;uniform vec3 cr;uniform vec3 cu;uniform vec3 cf;uniform vec2 tn;uniform vec3 sd;uniform vec3 md;uniform vec3 mx;uniform vec4 mp;uniform vec4 sk;uniform vec3 cv;uniform vec4 ck;uniform vec4 wd;uniform mat3 gm;uniform float mw;uniform float ps;uniform float px;uniform sampler2D cm;uniform vec4 cmb;uniform vec4 cmk;' + NOISE +
  // one cloud layer at height H km (eye at ck.xy km), feature scale sc km; far away the cover tends to its mean
  'float sat(vec2 q){vec2 u=(q-cmk.zw-cmb.xy)/cmb.zw;if(u.x<0.||u.y<0.||u.x>1.||u.y>1.)return cmk.y;return texture2D(cm,u).r;}' +
  'float layer(vec3 d,float H,float sc,float cov,vec2 dr){float t=(H-ck.z)/max(d.y,.004);if(cmk.x>.5)cov=clamp(cov+.9*(sat(ck.xy+d.xz*t)-cmk.y),0.,1.);if(cov<.01||ck.z>H)return 0.;vec2 p=(ck.xy+d.xz*t+dr)/sc;float f=fbm(p),th=1.-cov;float a=smoothstep(th-.13,th+.13,f*1.08-.04);return mix(a,cov,smoothstep(.12,.015,d.y));}' +
  'void main(){vec3 d=normalize(cf+n.x*tn.x*cr+n.y*tn.y*cu);float e=d.y,ee=max(e,0.),h=sk.x,cs=dot(d,sd),dk=sk.z;' +
  'if(ps<.5){' +
  // night: the city's sky glow, measured from the owner's photos (README Night)
  'vec3 ni=mix(vec3(.22,.20,.17),vec3(.10,.095,.09),smoothstep(-.02,.05,e));ni=mix(ni,vec3(.045,.044,.043),smoothstep(.04,.3,e));ni*=1.-.55*mw*smoothstep(.0,.3,e);' +
  'vec3 dy=mix(vec3(.64,.75,.88),vec3(.20,.40,.76),pow(ee,.45))+vec3(1.,.9,.7)*pow(max(cs,0.),8.)*.22;' +
  'float tw=smoothstep(-13.,-3.,h)*(1.-smoothstep(3.,14.,h));vec2 hd=normalize(d.xz+1e-5),hs2=normalize(sd.xz+1e-5);float az=dot(hd,hs2);' +
  'vec3 twc=mix(vec3(.10,.10,.24),vec3(1.,.46,.16),.5+.5*az)*exp(-ee*5.)*(.2+.8*smoothstep(-8.,0.,h))*tw*(.35+.65*az*az);' +
  'vec3 c=mix(ni,dy,dk)+twc*(1.-.6*sk.y);' +
  'c=mix(c,mix(ni*1.15,vec3(.78,.80,.82),dk),sk.w*exp(-ee*7.));' +   // haze from the visibility
  'c=mix(c,mix(vec3(.09,.08,.07),vec3(.50,.55,.60),dk),smoothstep(0.,-.12,e)*.7);' +   // below the horizon (beyond the model's edge): distant ground in haze
  // the Milky Way band from galactic coordinates (no outline catalogue: README Sky)
  'if(mw>0.&&e>0.){vec3 g=gm*d;float b=asin(clamp(g.z,-1.,1.)),l=atan(g.y,g.x);float bd=exp(-b*b/.03)*(.3+.7*exp(-l*l/1.4))+.9*exp(-(l*l+b*b*4.)/.045);' +
  'bd*=1.-.6*exp(-b*b/.0011)*smoothstep(1.7,.6,abs(l));bd*=.6+.8*fbm(vec2(l*7.,b*9.)+3.);c+=vec3(.55,.6,.72)*bd*mw*.075*smoothstep(0.,.12,e);}' +
  'float a=acos(clamp(cs,-1.,1.)),rs=max(.00465,px*3.);c+=(1.-sk.y)*(vec3(1.,.96,.88)*smoothstep(rs*1.12,rs*.9,a)*step(-.01,e)*2.+vec3(1.,.8,.55)*exp(-a*a/.0007)*.35*smoothstep(-3.,3.,h));' +
  'gl_FragColor=vec4(c,1.);return;}' +
  // pass 1: the moon (phase and bright limb from the sun direction), then cloud layers over it, premultiplied alpha
  'vec4 o=vec4(0.);float ca=dot(d,md);if(mp.w>.5&&ca>.99){vec3 q=d-md;float a=length(q),R=mp.y;vec3 ya=normalize(cross(md,mx));' +
  'o.rgb+=vec3(.35,.33,.30)*mp.z*exp(-a*a/(R*R*10.))*.35;' +   // a faint halo
  'if(a<R*1.15){float u=dot(q,mx)/R,v=dot(q,ya)/R,s=sqrt(max(0.,1.-v*v)),lit=smoothstep(-.05,.05,u+mp.x*s),al=smoothstep(1.07,.93,a/R);' +
  'float ma=.82+.22*fbm(vec2(u,v)*2.2+5.)-.18*smoothstep(.55,.75,fbm(vec2(u,v)*1.3+11.));vec3 lc=vec3(1.,.95,.84)*ma*mix(vec3(1.,.72,.45),vec3(1.),smoothstep(.0,.25,md.y));' +
  'o=vec4(lc*lit*al+vec3(.012,.013,.016)*al,al*lit);}}' +
  'if(e>.004){float lo=layer(d,1.0,1.7,cv.x,wd.xy),mi=layer(d,3.5,4.5,cv.y,wd.xy*1.6),hi=layer(d,8.,10.,cv.z,wd.xy*2.4)*.55;' +
  'float day=dk,mo=mp.w*mp.z*smoothstep(-.02,.1,md.y);vec3 mg=vec3(.7,.75,.85)*mo*(.05+.45*exp(-(1.-ca)*60.));' +
  'vec3 sunl=vec3(1.,.97,.92)*(.55+.45*max(cs,0.));vec3 tws=mix(vec3(1.,.5,.25),vec3(1.),smoothstep(2.,15.,h));' +
  'float fall=exp(-max(0.,(1.0-ck.z)/max(e,.004))/60.);' +   // city light under the cloud fades with distance (60 km)
  'vec3 cl=mix(vec3(.20,.155,.10)*wd.w*fall,vec3(.72,.73,.76)*sunl*tws,day)+mg;vec3 cm=mix(vec3(.085,.07,.055)*wd.w*fall,vec3(.80,.80,.82)*sunl*tws,day)+mg*.8;vec3 ch=mix(vec3(.04,.037,.033),vec3(.92,.93,.95)*tws,day)+mg*.6;' +
  'o=vec4(ch*hi,hi)+o*(1.-hi);o=vec4(cm*mi,mi)+o*(1.-mi);o=vec4(cl*lo,lo)+o*(1.-lo);' +
  'o.rgb=mix(o.rgb,o.a*mix(vec3(.2,.19,.17),vec3(.78,.8,.82),day),sk.w*exp(-ee*7.)*.6);}' +
  'gl_FragColor=o;}';
const PT_VS = 'attribute vec3 p;attribute vec2 k;uniform mat3 R;uniform mat3 V;uniform vec2 P;uniform vec4 L;uniform float ln;uniform vec3 lc;varying vec4 c;' +
  'void main(){vec3 m=normalize(R*p);float h=asin(clamp(m.y,-1.,1.))*57.29578;' +
  'if(L.w>.5&&h>-1.5){float r=1.02/tan((h+10.3/(h+5.11))*.0174533)/60.;vec2 hz=normalize(m.xz+1e-6);h+=r;m=vec3(hz.x*cos(h*.0174533),sin(h*.0174533),hz.y*cos(h*.0174533));}' +   // refraction, as astronomy-engine's "normal"
  'vec3 v=V*m;gl_Position=vec4(P.x*v.x,P.y*v.y,-v.z*.99999,-v.z);' +
  'if(ln>.5){c=vec4(lc*step(0.,h),1.);gl_PointSize=1.;return;}' +
  'float s=max(sin(h*.0174533),0.),X=1./(s+.025*exp(-11.*s)),mg=k.x+L.y*(X-1.),vis=smoothstep(L.x+.3,L.x-1.,mg)*step(-.6,h);' +
  'float b=k.y;vec3 col=b<.4?mix(vec3(.72,.82,1.),vec3(1.,.98,.95),smoothstep(-.2,.4,b)):mix(vec3(1.,.98,.95),vec3(1.,.72,.48),smoothstep(.4,1.7,b));' +
  'float I=clamp(.45+.55*pow(10.,-.4*(mg-1.)),0.,2.)*vis;c=vec4(col*I,1.);gl_PointSize=vis>0.?clamp(2.7-.42*mg,1.25,6.)*L.z:0.;}';
const PT_FS = PRE + 'varying vec4 c;uniform float ln;void main(){if(ln>.5){gl_FragColor=c;return;}vec2 q=gl_PointCoord*2.-1.;float r=dot(q,q);gl_FragColor=vec4(c.rgb*exp(-r*2.6)*step(r,1.),1.);}';

function prog(gl, vs, fs, attrs) {
  const p = gl.createProgram(), mk = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error('sky shader: ' + gl.getShaderInfoLog(o)); return o; };
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); attrs.forEach(([loc, n]) => gl.bindAttribLocation(p, loc, n)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('sky link: ' + gl.getProgramInfoLog(p));
  const U = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), k = a.name.replace(/\[0\]$/, ''); U[k] = gl.getUniformLocation(p, k); }
  return { p, U };
}
function initGL(ctx) {
  const gl = ctx.gl; S.gl = gl;
  S.P.sky = prog(gl, 'attribute vec2 q;varying vec2 n;void main(){n=q;gl_Position=vec4(q,.9999,1.);}', SKY_FS, [[ctx.aP, 'q']]);
  S.P.pt = prog(gl, PT_VS, PT_FS, [[ctx.aP, 'p'], [ctx.aC, 'k']]);
  S.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, S.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  S.dyn = gl.createBuffer();
  load('stars', 'data/sky/stars.json').then(d => { const a = new Float32Array(d.stars.length * 5); d.stars.forEach((s, i) => { const v = eqjVec(s[1], s[2]); a.set([v[0], v[1], v[2], s[3], s[4]], i * 5); });
    S.starBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, S.starBuf); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW); S.nStars = d.stars.length; S.starMeta = d; redraw(); }).catch(e => console.warn('stars', e));
  load('lines', 'data/sky/constellation-lines.json').then(d => { const a = []; for (const [, ls] of d.lines) for (const L of ls) for (let i = 0; i + 3 < L.length; i += 2) a.push(...eqjVec(L[i], L[i + 1]), 0, 0, ...eqjVec(L[i + 2], L[i + 3]), 0, 0);
    S.lineBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, S.lineBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STATIC_DRAW); S.nLine = a.length / 5; redraw(); }).catch(e => console.warn('lines', e));
  S.ready = true;
}

// how faint a star the sky shows: city (Bortle 8-9) or a dark site; twilight, moonlight and haze take magnitudes off
function nelm() {   // Night style shows the night sky whatever the hour
  const A = S.A, h = S.ctx && S.ctx.nm ? Math.min(A.sun.alt, -18) : A.sun.alt, base = S.dark ? 6.3 : 4.2; let n = base;
  if (h > -18) n = h < -6 ? Math.min(base, 2.2 + (base - 2.2) * (-6 - h) / 12) : h < 0 ? 2.2 - 3.4 * (h + 6) / 6 : -4.5;
  n -= (S.dark ? 1.2 : .35) * A.moon.frac * Math.max(0, Math.min(1, (A.moon.alt + 2) / 12));
  const w = S.wxNow; if (w && w.visibility != null) n -= Math.max(0, Math.min(1.2, (12000 - w.visibility) / 8000));
  return n;
}
const dayK = h => Math.max(0, Math.min(1, (h + 8) / 12)) ** 1.5;

function draw(ctx) {
  if (!AE || !AREA) return false; S.ctx = ctx; S.cam = ctx.CAM; S.vz = ctx.VZ;
  if (!S.ready) try { initGL(ctx); } catch (e) { console.warn(e); S.ready = false; return false; }
  if (S.live && Math.abs(Date.now() - S.t) > 15000) { S.t = Date.now(); }
  if (!S.A || S.A.t !== S.t) { compute(); refreshAsync(); }
  const gl = ctx.gl, A = S.A, V = ctx.VIEW, CAM = ctx.CAM, r = [V[0], V[4], V[8]], u = [V[1], V[5], V[9]], f = [-V[2], -V[6], -V[10]], tf = Math.tan(CAM.fovY / 2), nm = ctx.nm;
  const h = A.sun.alt, dk = nm ? 0 : dayK(h), w = S.wxNow, cov = w ? [w.cloud_cover_low, w.cloud_cover_mid, w.cloud_cover_high].map(v => (v || 0) / 100) : [0, 0, 0];
  const vis = w && w.visibility != null ? w.visibility : 20000, haze = Math.max(.12, Math.min(.85, 1 - vis / 30000 + (w && w.relative_humidity_2m > 85 ? .15 : 0)));
  const pxr = 2 * tf / CAM.h, dpr = CAM.w / Math.max(1, (ctx.cssW || CAM.w));
  const ws = w && w.wind_speed_10m ? w.wind_speed_10m * 2.2 / 3600 : .004, wa = (w && w.wind_direction_10m || 240) * D2R, dt = (S.t % 864e5) / 1000;   // cloud drift: 2.2 x the 10 m wind, towards the downwind side
  const drift = [-Math.sin(wa) * ws * dt % 400, Math.cos(wa) * ws * dt % 400];
  const lpe = nm ? 1 : Math.max(.15, 1 - dk);   // city light under the cloud
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
  const P = S.P.sky; gl.useProgram(P.p); const U = P.U;
  gl.uniform3fv(U.cr, r); gl.uniform3fv(U.cu, u); gl.uniform3fv(U.cf, f); gl.uniform2f(U.tn, tf * CAM.aspect, tf);
  gl.uniform3fv(U.sd, A.sun.dir); gl.uniform3fv(U.md, A.moon.dir); gl.uniform3fv(U.mx, A.moon.sx);
  const mR = Math.max(A.moon.diam / 2 * D2R, pxr * 4);   // real size, but at least 4 pixels across the radius
  gl.uniform4f(U.mp, Math.cos(A.moon.phase * D2R), mR, A.moon.frac, A.moon.alt > -1 ? 1 : 0);
  gl.uniform4f(U.sk, h, nm ? 1 : 0, dk, haze); gl.uniform3f(U.cv, cov[0], cov[1], cov[2]);
  gl.uniform4f(U.ck, (CAM.eye[0]) / 1000, CAM.eye[2] / 1000, Math.max(0, CAM.eye[1] / (S.vz || 1)) / 1000, 0); gl.uniform4f(U.wd, drift[0], drift[1], 0, lpe);
  const cl = clmFor(S.t), cr = cl && clmLoad(gl, cl); S.clm = cr || null;
  if (cr && cr.ready && w) { const here = S.here, la = here.lat, kx = 111.32 * Math.cos(la * D2R), b = CLM.box, x0 = here.x / 1000 + (b[1] - here.lon) * kx, z0 = here.z / 1000 - (b[2] - here.lat) * 110.57, dts = (S.t - cr.t) / 1000;
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, cr.tex); gl.uniform1i(U.cm, 2); gl.activeTexture(gl.TEXTURE0);
    gl.uniform4f(U.cmb, x0, z0, (b[3] - b[1]) * kx, (b[2] - b[0]) * 110.57); gl.uniform4f(U.cmk, 1, cr.mean, -Math.sin(wa) * ws * dts, Math.cos(wa) * ws * dts); }
  else gl.uniform4f(U.cmk, 0, 0, 0, 0);
  gl.uniformMatrix3fv(U.gm, false, A.GM); gl.uniform1f(U.mw, S.mw ? Math.max(0, Math.min(1, (nelm() - 4.6) / 1.5)) : 0); gl.uniform1f(U.px, pxr); gl.uniform1f(U.ps, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, S.quad); gl.disableVertexAttribArray(ctx.aC); gl.vertexAttribPointer(ctx.aP, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // stars, constellation lines, planets, Jupiter's moons, satellites: additive points on the sky
  const N = nelm(), Q = S.P.pt, QU = Q.U; gl.useProgram(Q.p); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.enableVertexAttribArray(ctx.aC);
  gl.uniformMatrix3fv(QU.V, false, new Float32Array([V[0], V[1], V[2], V[4], V[5], V[6], V[8], V[9], V[10]])); gl.uniform2f(QU.P, ctx.PROJ[0], ctx.PROJ[5]);
  const ext = .28 + haze * .5; gl.uniform4f(QU.L, N, ext, Math.min(2, dpr), 1);
  const bind = (b, n, mode) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.vertexAttribPointer(ctx.aP, 3, gl.FLOAT, false, 20, 0); gl.vertexAttribPointer(ctx.aC, 2, gl.FLOAT, false, 20, 12); gl.drawArrays(mode, 0, n); };
  gl.uniformMatrix3fv(QU.R, false, A.M); gl.uniform1f(QU.ln, 1);
  if (S.lines && S.lineBuf && N > 1.5) { const k = Math.min(1, (N - 1.5) / 2) * (S.dark ? .32 : .2); gl.uniform3f(QU.lc, .45 * k, .58 * k, .8 * k); bind(S.lineBuf, S.nLine, gl.LINES); }
  gl.uniform1f(QU.ln, 0); if (S.starBuf) bind(S.starBuf, S.nStars, gl.POINTS);
  const dyn = []; for (const p of A.planets) dyn.push(...p.dir, p.mag, p.bv); for (const m of A.jmoons) dyn.push(...m.dir, m.mag, .9);
  if (S.t - S.satAt > 1000 || S.satAt > S.t) { S.satPts = satPoints(); S.satAt = S.t; } for (const s of S.satPts) dyn.push(...s.dir, s.mag, .6);
  gl.uniformMatrix3fv(QU.R, false, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])); gl.uniform4f(QU.L, N, ext, Math.min(2, dpr), 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, S.dyn); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dyn), gl.DYNAMIC_DRAW); bind(S.dyn, dyn.length / 5, gl.POINTS);
  // the moon and the clouds over everything above
  gl.useProgram(P.p); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(U.ps, 1); gl.disableVertexAttribArray(ctx.aC);
  gl.bindBuffer(gl.ARRAY_BUFFER, S.quad); gl.vertexAttribPointer(ctx.aP, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  S.drawn = { nelm: N, stars: S.nStars || 0, sats: S.satPts.length }; S.skyThisFrame = true;
  if (S.names && !S.nameData && !once.names) Promise.all([load('names', 'data/sky/star-names.json'), load('messier', 'data/sky/messier.json')]).then(([n, m]) => { S.nameData = { n, m }; redraw(); }).catch(e => console.warn('names', e));
  return true;
}

// ---------- after each frame: azimuth lines from the viewpoint to the sun and the moon on a 2D overlay
let ov = null;
function after(ctx) {
  if (!S.A || !AE) return; S.ctx = Object.assign(S.ctx || {}, ctx);
  if (!ov) { ov = document.createElement('canvas'); ov.id = 'skyOv'; ov.setAttribute('aria-hidden', 'true'); ov.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    const c = $('c'); c.parentNode.insertBefore(ov, c.nextSibling); const st = document.createElement('style'); st.textContent = 'body.capture #skyOv{display:none}'; document.head.appendChild(st); }
  const W = ctx.cssW, H = ctx.cssH, dpr = Math.min(2, devicePixelRatio || 1); if (ov.width !== Math.round(W * dpr) || ov.height !== Math.round(H * dpr)) { ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr); }
  const g = ov.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const sky = S.skyThisFrame; S.skyThisFrame = false; if (sky && S.names && !ctx.pix && ctx.MVP && S.ctx.CAM) labels(g, ctx, W, H); else S.labelled = null;
  if (S.lcy && !ctx.pix && ctx.MVP) approaches(g, ctx, W, H);
  if (!S.azl || ctx.pix || S.vp === 'camera' || !ctx.MVP || !S.ctx.CAM) return;
  const E = S.ctx.CAM.eye; if (Math.hypot(E[0] - S.here.x, E[2] - S.here.z) < 500) return;   // from the viewpoint itself the lines on the ground only confuse
  const M = ctx.MVP, vz = ctx.VZ || 1, here = S.here, pr = (x, y, z) => { const c = [0, 1, 2, 3].map(i => M[i] * x + M[4 + i] * y * vz + M[8 + i] * z + M[12 + i]); return c[3] > 1 ? [(c[0] / c[3] * .5 + .5) * W, (1 - (c[1] / c[3] * .5 + .5)) * H] : null; };
  const line = (az, col, label, dash) => {
    const d = dirOf(0, az), pts = []; for (let k = 0; k <= 48; k++) { const s = 6000 * (k / 48) ** 1.6; pts.push(pr(here.x + d[0] * s, here.y, here.z + d[2] * s)); }
    g.strokeStyle = col; g.lineWidth = dash ? 1.2 : 2.2; g.setLineDash(dash ? [5, 5] : []); g.beginPath(); let on = false, last = null;
    for (const p of pts) { if (!p) { on = false; continue; } if (on) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); on = true; last = p; } g.stroke(); g.setLineDash([]);
    if (label && last && last[0] > 4 && last[0] < W - 4 && last[1] > 4 && last[1] < H - 4) { g.font = '600 11px system-ui,sans-serif'; g.fillStyle = col; g.shadowColor = '#000'; g.shadowBlur = 3; g.fillText(label, last[0] + 4, last[1] - 4); g.shadowBlur = 0; }
  };
  const A = S.A, T = S.days; if (T) { const lineAt = (t, b, col) => { if (t == null) return; const tm = AE.MakeTime(new Date(t)), eq = AE.Equator(b, tm, S.obs, true, true), hz = AE.Horizon(tm, S.obs, eq.ra, eq.dec, 'normal'); line(hz.azimuth, col, null, true); };
    lineAt(T.sunrise, 'Sun', '#ffd27a99'); lineAt(T.sunset, 'Sun', '#ff9a5a99'); lineAt(T.moonrise, 'Moon', '#bcd4ff99'); lineAt(T.moonset, 'Moon', '#8fa6d199'); }
  line(A.sun.az, A.sun.alt > -.8 ? '#ffd23f' : '#ffd23f80', `Sun ${Math.round(A.sun.az)}° ${A.sun.alt > -.8 ? 'up' : 'down'}`);
  line(A.moon.az, A.moon.alt > -.8 ? '#e8f0ff' : '#e8f0ff80', `Moon ${Math.round(A.moon.az)}° ${A.moon.alt > -.8 ? 'up' : 'down'}`);
  const p0 = pr(here.x, here.y, here.z); if (p0) { g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(p0[0], p0[1], 5, 0, 7); g.stroke(); g.fill(); }
}

// star names (IAU WGSN) and Messier objects (HEASARC), only for what the sky model shows: a named star when its magnitude
// is within the star limit less 0.5 and no fainter than 2.5 (so London shows the brightest few), a Messier object when
// its integrated magnitude is 1.5 brighter than the star limit (an extended object needs a darker sky than a star of
// the same magnitude); above 1 degree, and not behind a building (the skyline from the eye, __docklands.horizon)
function labels(g, ctx, W, H) {
  const D = S.nameData, A = S.A, Dk = globalThis.__docklands; if (!D || !A || !S.starMeta) return; const N = nelm(), M = ctx.MVP, E = S.ctx.CAM.eye, vz = ctx.VZ || 1;
  const now = performance.now(); if (Dk && Dk.horizon && (!S.hz || now - S.hzAt > 400)) { S.hz = Dk.horizon(E[0], E[1] / vz, E[2]); S.hzAt = now; }
  const pr = d => { const c = [0, 1, 2, 3].map(i => M[i] * d[0] + M[4 + i] * d[1] + M[8 + i] * d[2]); return c[3] > 0 ? [(c[0] / c[3] * .5 + .5) * W, (1 - (c[1] / c[3] * .5 + .5)) * H] : null; };
  const seen = (d, alt) => { if (alt < 1) return false; if (!S.hz) return true; const a = ((Math.atan2(d[0], -d[2]) * R2D + 360) % 360) * 2 | 0, t = d[1] / Math.hypot(d[0], d[2]); return t > S.hz[a] + .004; };
  const refr = h => h + 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R) / 60, dirOfEq = (ra, de) => { const m = M3(A.M, eqjVec(ra, de)), h = Math.asin(Math.max(-1, Math.min(1, m[1]))) * R2D, hz = Math.hypot(m[0], m[2]) || 1, h2 = refr(h) * D2R; return { d: [m[0] / hz * Math.cos(h2), Math.sin(h2), m[2] / hz * Math.cos(h2)], alt: h }; };
  const mag = new Map(S.starMeta.stars.map(s => [s[0], s])), boxes = [], out = { stars: [], messier: [] };
  const put = (txt, p, col, dot) => { const w = txt.length * 6 + 6, b = [p[0] + 5, p[1] - 15, w, 13]; if (p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) return false;
    if (boxes.some(q => b[0] < q[0] + q[2] && q[0] < b[0] + b[2] && b[1] < q[1] + q[3] && q[1] < b[1] + b[3])) return false; boxes.push(b);
    if (dot) { g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.arc(p[0], p[1], dot, 0, 7); g.stroke(); } g.fillStyle = col; g.fillText(txt, p[0] + 6, p[1] - 4); return true; };
  g.font = '500 11px system-ui,sans-serif'; g.shadowColor = '#000'; g.shadowBlur = 3;
  const lim = Math.min(N - .5, 2.5);
  for (const [hr, name] of D.n.names.map(x => [x[0], x[1]]).sort((a, b) => (mag.get(a[0]) || [0, 0, 0, 9])[3] - (mag.get(b[0]) || [0, 0, 0, 9])[3])) {
    const s = mag.get(hr); if (!s || s[3] > lim || out.stars.length >= 30) continue; const o = dirOfEq(s[1], s[2]); if (!seen(o.d, o.alt)) continue; const p = pr(o.d); if (p && put(name, p, 'rgba(214,224,240,.8)')) out.stars.push(name); }
  for (const m of D.m.objects) { if (!(m[4] <= N - 1.5)) continue; const o = dirOfEq(m[2], m[3]); if (!seen(o.d, o.alt)) continue; const p = pr(o.d), nm = m[7] && m[7].length < 34 && !/Id With|Asterism|Double Star|Localized/.test(m[7]) ? ` ${m[7].replace(/ = .*/, '')}` : '';
    if (p && put(`M ${m[0]}${nm}`, p, 'rgba(226,196,255,.85)', Math.max(3, Math.min(14, (m[5] || 10) / 60 * D2R / (2 * Math.tan(S.ctx.CAM.fovY / 2)) * H / 2)))) out.messier.push(m[0]); }
  g.shadowBlur = 0; S.labelled = out;
}

// London City Airport approach paths: the extended runway centreline from each landing threshold (OpenStreetMap, ODbL)
// rising at the published 5.5 degree glide path from 15 m over the threshold, out to 12 km; a dot every kilometre.
// No live aircraft: no ADS-B source allows its use on a public page (README "Sky, time, weather and tide", aircraft).
function approaches(g, ctx, W, H) {
  if (!S.lcyData) { if (!once.lcy) load('lcy', 'data/sky/lcy-approach.json').then(d => { S.lcyData = d; redraw(); }).catch(e => console.warn('lcy', e)); return; }
  const D = S.lcyData, M = ctx.MVP, vz = ctx.VZ || 1, pr = (x, y, z) => { const c = [0, 1, 2, 3].map(i => M[i] * x + M[4 + i] * y * vz + M[8 + i] * z + M[12 + i]); return c[3] > 1 ? [(c[0] / c[3] * .5 + .5) * W, (1 - (c[1] / c[3] * .5 + .5)) * H] : null; };
  const T = D.thresholds.map(t => geo(t.lon, t.lat)), L = Math.hypot(T[1][0] - T[0][0], T[1][1] - T[0][1]), u = [(T[1][0] - T[0][0]) / L, (T[1][1] - T[0][1]) / L], tg = Math.tan(D.glide_path_deg * D2R), y0 = D.aerodrome_elevation_m + D.threshold_crossing_height_m;
  g.font = '600 11px system-ui,sans-serif'; g.shadowColor = '#000'; g.shadowBlur = 3;
  D.thresholds.forEach((t, k) => { const s = k === 0 ? -1 : 1, P = d => pr(T[k][0] + s * u[0] * d, y0 + d * tg, T[k][1] + s * u[1] * d); let on = false, last = null;
    g.strokeStyle = 'rgba(255,190,90,.75)'; g.lineWidth = 1.5; g.setLineDash([6, 5]); g.beginPath();
    for (let d = 0; d <= 12000; d += 100) { const p = P(d); if (!p) { on = false; continue; } if (on) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); on = true; if (d === 6000) last = p; } g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(255,190,90,.9)'; for (let d = 1000; d <= 12000; d += 1000) { const p = P(d); if (p && p[0] > 0 && p[0] < W && p[1] > 0 && p[1] < H) { g.beginPath(); g.arc(p[0], p[1], 2, 0, 7); g.fill(); } }
    if (last && last[0] > 4 && last[0] < W - 120 && last[1] > 14 && last[1] < H - 4) g.fillText(`London City runway ${t.rwy} approach, ${D.glide_path_deg}°`, last[0] + 5, last[1] - 5); });
  g.shadowBlur = 0;
}

// ---------- the clock, weather, tide and satellites for the time shown; the scene follows when asked
let busy = 0;
async function refreshAsync() {
  const t = S.t, k = ++busy;
  try {
    const w = await weatherDay(isoL(t).slice(0, 10)).catch(e => ({ err: e.message }));
    if (k !== busy) return; S.wxRec = w; S.wxNow = w && !w.err ? wxAt(w, t) : null;
    const td = await tideAt(t).catch(e => ({ why: e.message })); if (k !== busy) return; S.tide = td; applyTide();
    S.satSet = await satRecs().catch(e => { S.satErr = e.message; return null; }); if (k !== busy) return; S.satAt = 0;
    S.days = dayTimes(); S.iss = undefined; S.issDone = false;
    redraw(); panel();
  } catch (e) { console.warn('sky refresh', e); }
}
let tideSet = false;
function applyTide() {
  const D = globalThis.__docklands; if (!D || !D.setTidal) return;
  const v = S.tideOn && S.tide && S.tide.v != null ? Math.round(S.tide.v * 100) / 100 : null;
  if (v != null) { D.setTidal(v, S.tide.field); tideSet = true; } else if (tideSet) { D.setTidal(null); tideSet = false; }
}
let lightAt = null;
function applyStyle() {   // the clock drives Night (sun below -6 degrees) and the direction of the light
  const D = globalThis.__docklands; if (!D || !S.drive || !S.A) return; const h = S.A.sun.alt, night = h < -6;
  if (!!(D.NIGHT && D.NIGHT.on) !== night) { S.selfNight = true; D.setNight(night); S.selfNight = false; }
  if (!night && D.relight) { const s = S.A.sun.dir, l = nrm([s[0], Math.max(.12, s[1]), s[2]]); if (!lightAt || dot(l, lightAt) < Math.cos(3 * D2R)) { lightAt = l; clearTimeout(S.lt); S.lt = setTimeout(() => D.relight(l), 500); } }
}
function restoreLight() { const D = globalThis.__docklands; if (lightAt && D && D.relight) { lightAt = null; D.relight(null); } }
function redraw() { const D = globalThis.__docklands; if (D && D.draw) D.draw(); }
function setTime(t, opts = {}) {
  if (!isFinite(t)) return; S.t = t; S.live = !!opts.live; if (opts.drive !== false && !opts.live) S.drive = true;
  if (!S.obs) setObserver(); compute(); applyStyle(); refreshAsync(); syncInputs(); redraw();
  if (!opts.noUrl) { try { const u = new URL(location.href); if (S.live) u.searchParams.delete('t'); else u.searchParams.set('t', isoL(t)); history.replaceState(null, '', u); } catch { /* no URL API */ } }
}
setInterval(() => { if (S.live && S.ready) { S.t = Date.now(); compute(); applyStyle(); if (Math.random() < .1) refreshAsync(); panel(); redraw(); } }, 30000);

// ---------- the Sky panel (Menu > Sky)
function syncInputs() { const i = $('skyT'); if (i && document.activeElement !== i) i.value = isoL(S.t); const lv = $('skyLive'); if (lv) lv.textContent = S.live ? 'now (live)' : `${dayL(S.t)}, ${hm(S.t)} ${tz(S.t)}`; }
function buildPanel() {
  const el = $('paneSky'); if (!el || el.dataset.built) return; el.dataset.built = '1';
  el.innerHTML = `<h2>Sky, weather and tide for a time</h2>
  <div class="row"><label for="skyT">London time</label> <input id="skyT" type="datetime-local" step="60" style="font-size:16px;background:#293038;color:var(--fg);border:1px solid #59616a;border-radius:8px;padding:6px"></div>
  <div class="acts"><button type="button" data-dt="-60">−1 h</button><button type="button" data-dt="-10">−10 min</button><button type="button" data-dt="now">Now</button><button type="button" data-dt="10">+10 min</button><button type="button" data-dt="60">+1 h</button><button type="button" id="skyPhoto">Photo time (3 Oct)</button></div>
  <p class="small">Showing <b id="skyLive"></b>. The page address keeps the time (<code>?t=2026-10-03T22:30</code>, London time).</p>
  <div class="row"><label>Viewpoint <select id="skyVp">${Object.entries(VPS).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('')}</select></label></div>
  <div class="chips row"><label><input type="checkbox" id="skyDrive"> Light and night follow the clock</label><label><input type="checkbox" id="skyTide" checked> Thames at the measured level</label><label><input type="checkbox" id="skyAz" checked> Sun and moon lines on the map</label>
  <label><input type="checkbox" id="skyLines" checked> Constellation lines</label><label><input type="checkbox" id="skyNames" checked> Star names and Messier objects (those the sky shows)</label><label><input type="checkbox" id="skyLcy"> London City Airport approach paths</label><label><input type="checkbox" id="skyMw" checked> Milky Way</label><label><input type="checkbox" id="skyDark"> Sky as from a dark site</label><label><input type="checkbox" id="skyFetch"> Fetch weather, tide and satellites for other times</label></div>
  <div class="acts"><button type="button" id="skyLookMoon">Look at the moon</button><button type="button" id="skyLookSun">Look at the sun</button></div>
  <div id="skyOut" class="small" aria-live="polite"></div>
  <p class="small" id="skyCredit"></p>`;
  el.querySelectorAll('[data-dt]').forEach(b => b.onclick = () => b.dataset.dt === 'now' ? setTime(Date.now(), { live: true }) : setTime(S.t + b.dataset.dt * 60e3));
  $('skyT').onchange = () => setTime(fromLondon($('skyT').value));
  $('skyPhoto').onclick = () => photoTime();
  $('skyVp').onchange = () => { S.vp = $('skyVp').value; setObserver(); compute(); refreshAsync(); redraw(); };
  const ck = (id, k, fn) => { $(id).checked = S[k]; $(id).onchange = () => { S[k] = $(id).checked; if (fn) fn(); redraw(); panel(); }; };
  ck('skyDrive', 'drive', () => { if (S.drive) applyStyle(); else restoreLight(); }); ck('skyTide', 'tideOn', applyTide); ck('skyAz', 'azl'); ck('skyLines', 'lines'); ck('skyNames', 'names'); ck('skyLcy', 'lcy'); ck('skyMw', 'mw'); ck('skyDark', 'dark');
  ck('skyFetch', 'fetch', () => { WX.days = {}; TIDE.days = {}; refreshAsync(); });
  const look = b => { const D = globalThis.__docklands, A = S.A; if (!D || !A) return; const d = A[b].dir, e = [S.here.x, S.here.y + 1.6, S.here.z], T = e.map((v, i) => v + d[i] * 1000); D.setEye(e, T, (b === 'moon' ? 12 : 40) * D2R); if (D.NIGHT && !D.NIGHT.on && A.sun.alt < -6) D.setNight(true); };
  $('skyLookMoon').onclick = () => look('moon'); $('skyLookSun').onclick = () => look('sun');
  syncInputs(); panel();
}
function photoTime() { S.vp = 'greenland'; if ($('skyVp')) $('skyVp').value = 'greenland'; setObserver(); setTime(fromLondon(PHOTO.iso)); const D = globalThis.__docklands; if (D && D.setView) D.setView('rotherhithe'); }
const f1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1), deg = v => `${Math.round(v)}°`;
function panel() {
  const out = $('skyOut'); if (!out || !S.A || !$('paneSky').classList.contains('on') && !S.forcePanel) return; syncInputs();
  const A = S.A, T = S.days || {}, w = S.wxNow, td = S.tide, rng = (a, b) => `${hm(a)}–${hm(b)}`;
  if (S.iss === undefined && S.satSet) { S.iss = null; setTimeout(() => { S.iss = nextIss(S.t); S.issDone = true; panel(); }, 30); }
  const up = A.planets.filter(p => p.alt > 0).map(p => `${p.name} ${deg(p.az)} ${compass(p.az)}, ${f1(p.alt)}° up, mag ${f1(p.mag)}`);
  const jm = A.planets[3].alt > 0 ? ` Jupiter's moons (mag 4.6 to 5.7, only from a dark site or with binoculars): ${A.jmoons.map(m => `${m.name} ${f1(m.sep)}′`).join(', ')} from Jupiter.` : '';
  const rows = [
    ['Sun', `${deg(A.sun.az)} ${compass(A.sun.az)}, ${f1(A.sun.alt)}° ${A.sun.alt >= 0 ? 'up' : 'below the horizon'}`],
    ['Sunrise, sunset', `${hm(T.sunrise)}, ${hm(T.sunset)}`],
    ['Golden hour', `${rng(T.goldenAm && T.goldenAm[0], T.goldenAm && T.goldenAm[1])} and ${rng(T.goldenPm && T.goldenPm[0], T.goldenPm && T.goldenPm[1])} (sun from −4° to +6°)`],
    ['Blue hour', `${rng(T.blueAm && T.blueAm[0], T.blueAm && T.blueAm[1])} and ${rng(T.bluePm && T.bluePm[0], T.bluePm && T.bluePm[1])} (sun −6° to −4°)`],
    ['Twilight ends (civil, nautical, astronomical)', T.dusk ? T.dusk.map(hm).join(', ') : '—'], ['Dawn begins (astronomical, nautical, civil)', T.dawn ? T.dawn.map(hm).join(', ') : '—'],
    ['Moon', `${deg(A.moon.az)} ${compass(A.moon.az)}, ${f1(A.moon.alt)}° ${A.moon.alt >= 0 ? 'up' : 'below the horizon'}`],
    ['Moon phase', `${phaseName(A.moon.elong)}, ${Math.round(A.moon.frac * 100)}% lit (phase angle ${f1(A.moon.phase)}°), ${(A.moon.diam * 60).toFixed(1)}′ across`],
    ['Bright limb', A.moon.alt > -2 ? `${deg(A.moon.limb)} from the top of the disc, clockwise (the ${clockWord(A.moon.limb)} side is lit)` : 'moon down'],
    ['Moonrise, moonset', `${hm(T.moonrise)}, ${hm(T.moonset)}`],
    ['Planets up', up.length ? up.join('; ') + '.' + jm : 'none above the horizon'],
    ['Milky Way core', `${f1(A.gc.alt)}° ${A.gc.alt > 0 ? 'up' : 'below the horizon'} now${T.gcBest ? `; highest in full darkness ${f1(T.gcBest.alt)}° at ${hm(T.gcBest.t)}` : '; no astronomical darkness this night'} (from London it never rises more than 9.5°)`],
    ['Stars drawn', S.drawn ? `to magnitude ${f1(S.drawn.nelm)} (${S.dark ? 'dark site' : 'London sky glow, Bortle 8 to 9'}, with twilight, moonlight and haze)` : '—'],
    ['Names on the sky', !S.names ? 'off' : S.labelled ? `${S.labelled.stars.length ? 'stars: ' + S.labelled.stars.map(esc).join(', ') : 'no named star bright enough and in view'}; ${S.labelled.messier.length ? 'Messier: ' + S.labelled.messier.map(m => 'M ' + m).join(', ') : 'no Messier object bright enough for this sky and in view'} (only what the star limit shows, not behind buildings)` : 'shown with the night sky'],
    ['Aircraft', 'no live positions: OpenSky needs a written licence for live use, adsb.fi is for personal non-commercial use, ADS-B Exchange is commercial, adsb.lol is ODbL (share-alike), airplanes.live terms could not be read (bot challenge). The London City Airport approach paths can be shown (above).'],
    ['Satellites', S.satSet ? `${S.satPts.length} sunlit above the horizon now (${S.satSet.recs.length} bright satellites, ${esc(S.satSet.src)})` : S.fetch ? (S.satErr ? esc(S.satErr) : 'orbit data older than 10 days from that time') : 'tick "Fetch" for times away from 3 October'],
    ['Next ISS pass', S.iss ? `${dayL(S.iss.t0)} ${hm(S.iss.t0)}–${hm(S.iss.t1)}: from ${compass(S.iss.az0)} to ${compass(S.iss.az1)}, highest ${f1(S.iss.max)}° at ${hm(S.iss.tmax)} in the ${compass(S.iss.azmax)}` : S.issDone ? 'none above 10° in a dark sky in the next 3 days' : S.satSet ? 'searching…' : '—'],
    ['Cloud from the satellite', S.clm ? (S.clm.ready ? `EUMETSAT Meteosat cloud mask at ${hm(S.clm.t)} ${tz(S.clm.t)} (${esc(S.clm.src)}): ${Math.round(S.clm.mean * 100)}% cloud within 60 km; it places the cloud of each layer, moved with the wind` : S.clm.err ? 'cloud mask ' + esc(S.clm.err) : 'loading…') : S.fetch ? 'no cloud mask for that time (none before September 2020, none in the future)' : 'tick "Fetch" for the satellite cloud at times away from the photo evening'],
    ['Weather', w ? `cloud ${Math.round(w.cloud_cover)}% (low ${Math.round(w.cloud_cover_low)}%, mid ${Math.round(w.cloud_cover_mid)}%, high ${Math.round(w.cloud_cover_high)}%), visibility ${w.visibility != null ? (w.visibility / 1000).toFixed(0) + ' km' : 'not given'}, humidity ${Math.round(w.relative_humidity_2m)}%, ${f1(w.temperature_2m)} °C, rain ${f1(w.precipitation)} mm/h, wind ${Math.round(w.wind_speed_10m)} km/h from ${Math.round(w.wind_direction_10m)}° (Open-Meteo, ${esc(w.src)})` : S.wxRec && S.wxRec.why ? esc(S.wxRec.why) : S.wxRec && S.wxRec.err ? 'did not load: ' + esc(S.wxRec.err) : S.fetch ? 'loading…' : 'clear sky assumed (no data: tick "Fetch")'],
    ['One Canada Square halo', globalThis.__docklands && __docklands.crownText ? esc(__docklands.crownText()) : '—'],
    ['Thames level', td && td.v != null ? `${td.v.toFixed(2)} m above Ordnance Datum at ${esc(VPS[S.vp].name)}, ${td.trend > .05 ? 'rising' : td.trend < -.05 ? 'falling' : 'near the turn'} (${td.trend > 0 ? '+' : ''}${td.trend.toFixed(2)} m/h); ${td.pts.map(p => `${esc(p.name)} ${p.v.toFixed(2)} m${p.dropped ? ` (${p.dropped} faulty readings left out)` : ''}`).join(', ')}, linear along the river between the gauges; the model's Thames runs from ${td.ends[0].toFixed(2)} m at its west end to ${td.ends[1].toFixed(2)} m at its east end (EA, ${esc(td.src)})` : td && td.why ? esc(td.why) + ' — no prediction shown' : 'no reading (tick "Fetch")'],
  ];
  out.innerHTML = `<p>${esc(VPS[S.vp].name)} · ${dayL(S.t)} ${hm(S.t)} ${tz(S.t)}${S.live ? ' (now)' : ''}${Math.abs(S.t - fromLondon(PHOTO.iso)) < 30 * 60e3 ? ` · ${esc(PHOTO.note)}` : ''}</p><div class="tw"><table>${rows.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${b}</td></tr>`).join('')}</table></div>`;
  $('skyCredit').innerHTML = 'Positions: <a href="https://github.com/cosinekitty/astronomy">astronomy-engine</a> (Don Cross, MIT). Stars: <a href="https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50">Yale Bright Star Catalogue 5th ed.</a> (Hoffleit &amp; Warren 1991, NASA ADC / CDS; public domain) to magnitude 5.5. Constellation lines: <a href="https://github.com/ofrohn/d3-celestial">d3-celestial</a> (Olaf Frohn, BSD-3-Clause). Star names: <a href="https://www.iau.org/public/themes/naming_stars/">IAU Working Group on Star Names</a> (IAU Catalog of Star Names, CC BY). Messier objects: <a href="https://heasarc.gsfc.nasa.gov/W3Browse/all/messier.html">NASA HEASARC MESSIER table</a> (public domain). Runway thresholds: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> (ODbL). Milky Way: a band computed from galactic coordinates. Satellites: <a href="https://celestrak.org/">CelesTrak</a> GP data, <a href="https://github.com/shashwatak/satellite-js">satellite.js</a> (MIT). Cloud mask: <a href="https://view.eumetsat.int/">contains modified EUMETSAT Meteosat data 2026</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>). Weather: <a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>). Tide: Environment Agency flood-monitoring API, this uses Environment Agency flood and river level data from the real-time data API (Beta) (<a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">OGL v3.0</a>); the EA publishes readings only, and published tide predictions (PLA, UKHO) are not under an open licence, so future times show no level.';
}
// a "Sky" tab in the menu (the main script owns the tabs; ours opens like the others)
function hookUi() {
  buildPanel(); const btn = document.querySelector('#dtabs [data-pane="paneSky"]'); if (btn) btn.addEventListener('click', () => setTimeout(panel, 0));
  const nmEl = $('nightMode'); if (nmEl) nmEl.addEventListener('change', () => { if (!S.selfNight && S.drive) { S.drive = false; if ($('skyDrive')) $('skyDrive').checked = false; restoreLight(); } });
  const al = $('attribLine'); if (al && !$('attribSky')) { const s = document.createElement('span'); s.id = 'attribSky'; al.appendChild(s); }
}
setInterval(() => { const s = $('attribSky'); if (!s) return; const t = S.wxNow ? ' · weather Open-Meteo (CC BY 4.0)' : ''; const k = S.tide && S.tide.v != null && S.tideOn ? ' · tide EA (OGL)' : ''; const c = S.satPts.length ? ' · CelesTrak' : '', m = S.clm && S.clm.ready ? ' · contains modified EUMETSAT Meteosat data 2026 (CC BY 4.0)' : ''; const v = t + k + c + m; if (s.textContent !== v) s.textContent = v; }, 2000);

// public: the main script's hooks, and a test surface
function sunMoon(date) {   // the old night code's shape: directions in model axes, the moon's phase angle (radians), lit fraction
  if (!AE) return { sun: [0, -1, 0], moon: [0, -1, 0], phase: 0, lit: 0 }; const keep = S.t, keepA = S.A; S.t = +date; if (!S.obs) setObserver(); const A = compute(); S.t = keep; S.A = keepA; S.at = keep;
  return { sun: A.sun.dir, moon: A.moon.dir, phase: A.moon.phase * D2R, lit: A.moon.frac };
}
const qs = new URLSearchParams(location.search), qt = qs.get('t');
if (AE && AREA) { setObserver(); if (qt) { const t = qt === 'photo' ? fromLondon(PHOTO.iso) : fromLondon(qt); if (isFinite(t)) { S.t = t; S.live = false; S.drive = true; } } compute(); }
globalThis.DocklandsSky = {
  draw, after, sunMoon, setTime, photoTime, fromLondon, isoL, get t() { return S.t; }, get A() { return S.A; }, S, compute, nextIss, tideAt, dayTimes, PHOTO,
  get day() { return S.drive && !!S.A && S.A.sun.alt > -6; },
  init() { if (this.inited) return; this.inited = true; hookUi(); if (qt) { applyStyle(); refreshAsync(); if (qt === 'photo') { const D = globalThis.__docklands; if (D && D.setView && !/[?&]view=/.test(location.search)) D.setView('rotherhithe'); } } },
};
document.addEventListener('DOMContentLoaded', () => globalThis.DocklandsSky.init());
})();
