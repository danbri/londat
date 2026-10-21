// What is in view, and what is at a point, as text and as data: the core of the page API's describeView() and
// featuresAt() (api.js), the text view (textview.js, no WebGL needed) and the MCP tools describe_view and features_at
// (tools/view-mcp/server.mjs, in Node). Pure: no DOM, no three.js. Inputs are the model data (area.js A, optionally
// under.js U.pois, building-keys.json, the atlas index) and a camera (eye and target in model metres, vertical field,
// aspect); outputs speak WGS84 longitude and latitude, metres, degrees from true north and ISO times. The locale (the
// model frame, the height datum, the time zone, names the data lacks) comes from an adapter (adapters/uk.js).
// Skill: docklands-3d-page, "Three.js port: page API, WebMCP and non-visual access (2026-10-11)".
export const DESCRIBE_VERSION = '1.0.0';
const D = Math.PI / 180;

export function decode(q, stride = 2) { const o = new Array(q.length), acc = new Array(stride).fill(0); for (let i = 0; i < q.length; i++) { acc[i % stride] += q[i]; o[i] = acc[i % stride] / 10; } return o; }
const rings = o => { const f = decode(o.p), n = f.length / 2, st = [0, ...(o.holes || []), n]; return { f, st }; };
function inRings(R, x, z) {   // even-odd over the outer ring and its holes
  let c = false; const { f, st } = R;
  for (let r = 0; r + 1 < st.length; r++) for (let k = st[r], j = st[r + 1] - 1; k < st[r + 1]; j = k++) {
    const ax = f[2 * k], az = f[2 * k + 1], bx = f[2 * j], bz = f[2 * j + 1];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c;
  }
  return c;
}
const bboxOf = f => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < f.length; i += 2) { x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); z0 = Math.min(z0, f[i + 1]); z1 = Math.max(z1, f[i + 1]); } return [x0, z0, x1, z1]; };
export const COMPASS = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east', 'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'];
export const compass = deg => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
export const distText = m => m < 950 ? `${Math.round(m / 10) * 10 || Math.round(m)} m` : `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`;
export function bearing(lon1, lat1, lon2, lat2) {   // initial great-circle bearing, degrees from true north
  const p1 = lat1 * D, p2 = lat2 * D, dl = (lon2 - lon1) * D;
  return ((Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / D) + 360) % 360;
}
const r6 = v => Math.round(v * 1e6) / 1e6, r1 = v => Math.round(v * 10) / 10;
const KIND = cls => { const s = (cls || []).join(' ').toLowerCase();
  if (/station|stop\b/.test(s)) return 'station'; if (/park|garden|woodland|common|farm|green/.test(s)) return 'park';
  if (/dock|river|basin|lake|creek|canal|watercourse|body of water/.test(s)) return 'water';
  if (/skyscraper|building|tower|office|block|museum|hospital|stadium|church|school|hall|house/.test(s)) return 'building';
  if (/bridge|tunnel|pier|landing|lock|stairs/.test(s)) return 'crossing or quay';
  if (/area|neighbo|district|town|estate|peninsula|island/.test(s)) return 'district'; return 'place'; };

// ---------- the index: places, water, parks and buildings with positions (built once; the buildings lazily)
export function makeIndex(A, { adapter, under = null, keys = null, atlas = null } = {}) {
  const T = A.terrain;
  const ground = (x, z) => { const fx = Math.max(0, Math.min(T.nx - 1.001, (x - T.x0) / T.cell)), fz = Math.max(0, Math.min(T.nz - 1.001, (z - T.z0) / T.cell)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, h = (a, b) => T.dm[b * T.nx + a] / 10;
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v; };
  const places = [], seen = new Set();
  for (const p of A.places) if (p.name && !seen.has('p' + p.name + Math.round(p.x / 50))) { seen.add('p' + p.name + Math.round(p.x / 50));
    places.push({ name: p.name, kind: KIND(p.cls), cls: p.cls || [], x: p.x, z: p.z, y: (p.g ?? ground(p.x, p.z)) + 10, wd: p.wd || null, desc: p.desc || null, key: {} }); }
  for (const p of (under && under.pois) || []) if ((p.kind === 'station' || p.kind === 'place') && p.name && !places.some(q => q.name.toLowerCase() === p.name.toLowerCase())) {
    places.push({ name: p.name, kind: p.kind === 'station' ? 'station' : 'district', cls: [], x: p.x, z: p.z, y: (p.g ?? ground(p.x, p.z)) + 8, wd: p.wd || null, osm: p.osm || null, key: {} }); }
  // water: one entry a name (all its polygons), unnamed tidal water as the adapter's name; sampled outline points for the view test
  const water = new Map();
  A.water.forEach((w, i) => {
    if (/Pond|Fountain|Times Square|Stairs/.test(w.n || '')) return;
    const name = w.n || (w.tidal ? (adapter && adapter.tidalWaterName) || 'tidal river' : null); if (!name) return;
    const R = rings(w), n = R.f.length / 2, step = Math.max(1, Math.floor(n / 60)), e = water.get(name) || { name, kind: 'water', tidal: !!w.tidal, level: w.level, polys: [], pts: [], key: {} };
    e.polys.push(i); for (let k = 0; k < n; k += step) e.pts.push([R.f[2 * k], w.level, R.f[2 * k + 1]]);
    let sx = 0, sz = 0; for (let k = 0; k < n; k++) { sx += R.f[2 * k]; sz += R.f[2 * k + 1]; } e.cx = (e.cx ?? sx / n); e.cz = (e.cz ?? sz / n);
    water.set(name, e);
  });
  let B = null, GR = null, WR = null;
  function buildings() {   // centroid, bbox, base, height of every model building; a 100 m bucket grid of bboxes
    if (B) return B; const n = A.buildings.length; B = { cx: new Float32Array(n), cz: new Float32Array(n), bb: new Float32Array(4 * n), grid: new Map() };
    for (let i = 0; i < n; i++) { const b = A.buildings[i], f = decode(b.p), m = b.holes && b.holes.length ? b.holes[0] : f.length / 2; let sx = 0, sz = 0;
      for (let k = 0; k < m; k++) { sx += f[2 * k]; sz += f[2 * k + 1]; } B.cx[i] = sx / m; B.cz[i] = sz / m; const bb = bboxOf(f.slice(0, 2 * m)); B.bb.set(bb, 4 * i);
      for (let gx = Math.floor(bb[0] / 100); gx <= Math.floor(bb[2] / 100); gx++) for (let gz = Math.floor(bb[1] / 100); gz <= Math.floor(bb[3] / 100); gz++) { const k = gx + ',' + gz; if (!B.grid.has(k)) B.grid.set(k, []); B.grid.get(k).push(i); } }
    return B;
  }
  function waterRings() { return WR || (WR = A.water.map(w => { const R = rings(w); return { R, bb: bboxOf(R.f), w }; })); }
  function greenRings() { return GR || (GR = (A.greens || []).map(g => { const R = rings(g); return { R, bb: bboxOf(R.f) }; })); }
  const regOf = new Map(); if (atlas) atlas.buildings.forEach(r => (r.mi || []).forEach(i => regOf.set(i, r)));
  function buildingName(i) {
    const r = regOf.get(i); if (r && r.n) return r.n;
    const id = keys && keys.ids[i], o = id && keys.osm[id]; if (o && (o.n || o.h)) return o.n || o.h;
    const Bx = buildings(); for (const p of places) if (p.kind === 'building' && Math.abs(p.x - Bx.cx[i]) < 60 && Math.abs(p.z - Bx.cz[i]) < 60 && inRings(rings(A.buildings[i]), p.x, p.z)) return p.name;
    if (o && o.a) return o.a; return null;
  }
  function buildingAt(x, z) {
    const Bx = buildings(), list = Bx.grid.get(Math.floor(x / 100) + ',' + Math.floor(z / 100)) || []; let best = -1;
    for (const i of list) { const q = Bx.bb.subarray(4 * i, 4 * i + 4); if (x < q[0] || x > q[2] || z < q[1] || z > q[3]) continue;
      const b = A.buildings[i]; if (inRings(rings({ p: b.p, holes: b.holes }), x, z) && (best < 0 || b.b + b.h > A.buildings[best].b + A.buildings[best].h)) best = i; }
    return best;
  }
  return { A, adapter, ground, places, water: [...water.values()], buildings, buildingName, buildingAt, waterRings, greenRings, regOf, keys, atlas, setKeys(K) { keys = K; this.keys = K; }, setAtlas(AT) { atlas = AT; this.atlas = AT; regOf.clear(); AT.buildings.forEach(r => (r.mi || []).forEach(i => regOf.set(i, r))); } };
}

// ---------- the camera: eye and target in model metres, fovY (radians), aspect; the frame to test points against
export function camFrame(cam) {
  const [ex, ey, ez] = cam.eye, [tx, ty, tz] = cam.target; let fx = tx - ex, fy = ty - ey, fz = tz - ez; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;   // right = f x up(0,1,0)
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;   // up = right x f
  const ty2 = Math.tan(cam.fovY / 2), tx2 = ty2 * (cam.aspect || 1);
  return { e: cam.eye, f: [fx, fy, fz], r: [rx, 0, rz], u: [ux, uy, uz], tx2, ty2, hfov: 2 * Math.atan(tx2) / D, vfov: cam.fovY / D,
    // NDC-like position (-1..1 inside the frame) and the depth, or null behind the eye
    see(p) { const vx = p[0] - ex, vy = p[1] - ey, vz = p[2] - ez, d = vx * fx + vy * fy + vz * fz; if (d <= 1) return null; return [(vx * rx + vz * rz) / (d * tx2), (vx * ux + vy * uy + vz * uz) / (d * ty2), d]; } };
}
const inside = s => s && Math.abs(s[0]) <= 1 && Math.abs(s[1]) <= 1;

// the camera state in WGS84 terms: eye and target position and height, true heading, pitch, fields of view
export function viewGeo(I, cam) {
  const ad = I.adapter, [ex, ey, ez] = cam.eye, [tx, ty, tz] = cam.target, F = camFrame(cam);
  const [elon, elat] = ad.toLonLat(ex, ez), [tlon, tlat] = ad.toLonLat(tx, tz);
  const hl = Math.hypot(F.f[0], F.f[2]) > 1e-6 ? [F.f[0] / Math.hypot(F.f[0], F.f[2]), F.f[2] / Math.hypot(F.f[0], F.f[2])] : [-Math.sin(cam.yaw || 0), -Math.cos(cam.yaw || 0)];
  const [hlon, hlat] = ad.toLonLat(ex + hl[0] * 100, ez + hl[1] * 100), heading = bearing(elon, elat, hlon, hlat);
  const ge = I.ground(ex, ez), gt = I.ground(tx, tz);
  return { eye: { lon: r6(elon), lat: r6(elat), height_m: r1(ey), above_ground_m: r1(ey - ge) }, target: { lon: r6(tlon), lat: r6(tlat), height_m: r1(ty), ground_m: r1(gt) },
    heading_deg: r1(heading), heading_name: compass(heading), pitch_deg: r1(Math.asin(Math.max(-1, Math.min(1, F.f[1]))) / D), range_m: Math.round(Math.hypot(tx - ex, ty - ey, tz - ez)),
    fov_deg: { vertical: r1(F.vfov), horizontal: r1(F.hfov) }, height_datum: ad.heightDatum, frame: F, elon, elat };
}
function rel(G, x, z) {   // bearing and distance from the eye, and the side of the view
  const [lon, lat] = G.adapter.toLonLat(x, z), b = bearing(G.elon, G.elat, lon, lat), d = Math.hypot(x - G.ex, z - G.ez);
  let a = b - G.heading; a = ((a + 540) % 360) - 180; const side = Math.abs(a) < 12 ? 'ahead' : a < 0 ? (a > -35 ? 'ahead left' : 'left') : (a < 35 ? 'ahead right' : 'right');
  return { distance_m: Math.round(d), bearing_deg: r1(b), direction: compass(b), side, lon: r6(lon), lat: r6(lat) };
}

// ---------- what is in view. cam: { eye, target, fovY, aspect, yaw? }; o: { time (ms), sun {alt, az}, moon, weather,
// live { aircraft: [{x,y,z}], ships: [{x,y,z}] }, occluded(key, x, y, z), share, maxDistance, maxItems, view }
export function describeView(I, cam, o = {}) {
  const V = viewGeo(I, cam), F = V.frame, maxD = o.maxDistance || Math.max(6000, Math.min(14000, V.eye.above_ground_m * 25)), N = o.maxItems || 8;
  const G = { adapter: I.adapter, elon: V.elon, elat: V.elat, heading: V.heading_deg, ex: cam.eye[0], ez: cam.eye[2] };
  const occ = (key, p) => !!(o.occluded && o.occluded(key, p[0], p[1], p[2]));
  const vis = (key, p) => { const s = F.see(p); return inside(s) && s[2] < maxD && !occ(key, p); };
  const places = [], parks = [], water = [], seenB = new Set();
  for (const p of I.places) { const P = [p.x, p.y, p.z]; if (!vis(p.key, P)) continue; const r = { name: p.name, kind: p.kind, ...rel(G, p.x, p.z), wikidata: p.wd || undefined };
    (p.kind === 'park' ? parks : p.kind === 'water' ? null : places)?.push(r); }
  for (const w of I.water) { let best = null; for (const P of w.pts) { const s = F.see(P); if (inside(s) && s[2] < maxD && (!best || s[2] < best[1])) best = [P, s[2]]; }
    if (best) water.push({ name: w.name, kind: w.tidal ? 'tidal water' : 'water', water_level_m: w.level, ...rel(G, best[0][0], best[0][2]) }); }
  // the tallest buildings in view (by top height above the datum), named where the data has a name; parts of one building once
  const Bx = I.buildings(), A = I.A, tall = [];
  for (let i = 0; i < A.buildings.length; i++) { const b = A.buildings[i]; if (b.h < 25) continue; const P = [Bx.cx[i], b.b + b.h, Bx.cz[i]], s = F.see(P);
    if (!inside(s) || s[2] > maxD) continue; tall.push([i, b.b + b.h]); }
  tall.sort((a, b) => b[1] - a[1]);
  const buildings = [];
  for (const [i, top] of tall) { if (buildings.length >= Math.max(N, 10)) break; const name = I.buildingName(i), b = A.buildings[i], k = name || ('#' + i);
    if (seenB.has(k)) continue; const P = [Bx.cx[i], top - 1, Bx.cz[i]]; const BK = I.bkeys || (I.bkeys = new Map()); if (!BK.has(i)) BK.set(i, {}); if (occ(BK.get(i), P)) continue;   // a top hidden by a nearer building (the march skips the building's own cells)
    seenB.add(k); const id = I.keys && I.keys.ids[i];
    buildings.push({ name: name || null, height_m: r1(b.h), top_m: r1(top), osm: id ? (id[0] === 'w' ? 'way/' : 'relation/') + id.slice(1) : undefined, model_index: i, ...rel(G, Bx.cx[i], Bx.cz[i]) }); }
  for (const L of [places, parks, water]) L.sort((a, b) => a.distance_m - b.distance_m);
  const over = nearestPlace(I, cam.target[0], cam.target[2]);
  // live things in the frame
  const count = L => (L || []).filter(p => { const s = F.see([p.x, p.y ?? 0, p.z]); return inside(s) && s[2] < maxD * 2; }).length;
  const live = o.live ? { aircraft: o.live.aircraft ? count(o.live.aircraft) : null, ships: o.live.ships ? count(o.live.ships) : null } : null;
  const time = o.time != null ? { ...timeOf(o.time, o.timeZone || I.adapter.timeZone), ...(o.zoneInfo || {}) } : null;   // o.timeZone, o.zoneInfo: the page clock's zone (clockzone.js)
  const sun = o.sun ? { altitude_deg: r1(o.sun.alt), azimuth_deg: r1(o.sun.az), direction: compass(o.sun.az), day_part: dayPart(o.sun.altGeo ?? o.sun.alt) } : null;
  const out = { version: DESCRIBE_VERSION, eye: V.eye, target: V.target, heading_deg: V.heading_deg, heading_name: V.heading_name, pitch_deg: V.pitch_deg, range_m: V.range_m, fov_deg: V.fov_deg, height_datum: V.height_datum,
    over: over ? { name: over.name, kind: over.kind, distance_m: over.d } : null, view: o.view || null,
    in_view: { places: places.slice(0, 30), buildings, water: water.slice(0, 15), parks: parks.slice(0, 15) }, time, sun, weather: o.weather || null, live, share: o.share || null };
  out.text = describeText(out, N);
  return out;
}
function dayPart(a) { return a > 6 ? 'daylight' : a > 0 ? 'low sun' : a > -6 ? 'twilight' : a > -12 ? 'dusk or dawn' : 'night'; }
export function timeOf(t, tz) {
  const d = new Date(t), f = new Intl.DateTimeFormat('en', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return { iso: d.toISOString(), local: f.format(d), time_zone: tz };
}
export function nearestPlace(I, x, z, kinds) {
  let best = null; for (const p of I.places) { if (kinds && !kinds.includes(p.kind)) continue; const d = Math.hypot(p.x - x, p.z - z); if (!best || d < best.d) best = { ...p, d: Math.round(d) }; }
  return best;
}
const item = r => `${r.name} ${distText(r.distance_m)} ${r.side === 'ahead' ? 'ahead' : 'to the ' + r.side.replace('ahead ', 'front ')}`;
export function describeText(o, N = 8) {
  const s = [];
  const up = o.eye.above_ground_m, where = up > 30 ? `from ${distText(up)} above the ground` : up > 0 ? `from ${Math.round(up)} m above the ground` : `from ${Math.round(-up)} m below the ground`;
  s.push(`Looking ${o.heading_name}${Math.abs(o.pitch_deg) > 60 ? ' and down' : o.pitch_deg < -8 ? ', down,' : o.pitch_deg > 5 ? ', up,' : ''} ${where}${o.over ? `, towards ${o.over.name}` : ''}.`);
  if (o.time) s.push(`${o.time.local} (${o.time.abbreviation && o.time.abbreviation !== o.time.utc_offset ? o.time.abbreviation + ', ' : ''}${o.time.utc_offset ? o.time.utc_offset + ', ' : ''}${o.time.time_zone})${o.sun ? `; ${o.sun.day_part}, the sun ${Math.abs(o.sun.altitude_deg).toFixed(0)}° ${o.sun.altitude_deg >= 0 ? 'up' : 'below the horizon'} in the ${o.sun.direction}` : ''}${o.weather && o.weather.cloud_pct != null ? `; cloud ${o.weather.cloud_pct} %` : ''}${o.weather && o.weather.temperature_c != null ? `, ${Math.round(o.weather.temperature_c)} °C` : ''}.`);
  const B = o.in_view.buildings.filter(b => b.name).slice(0, 4);
  if (B.length) s.push(`Tallest in view: ${B.map(b => `${b.name} (${Math.round(b.height_m)} m tall, ${distText(b.distance_m)} ${b.side})`).join('; ')}.`);
  const P = o.in_view.places.filter(p => !B.some(b => b.name === p.name)).slice(0, N);
  if (P.length) s.push(`Places: ${P.map(item).join('; ')}.`);
  if (o.in_view.water.length) s.push(`Water: ${o.in_view.water.slice(0, 5).map(item).join('; ')}.`);
  if (o.in_view.parks.length) s.push(`Parks: ${o.in_view.parks.slice(0, 4).map(item).join('; ')}.`);
  if (o.live && (o.live.aircraft || o.live.ships)) s.push(`Moving: ${[o.live.aircraft ? `${o.live.aircraft} aircraft` : '', o.live.ships ? `${o.live.ships} ${o.live.ships === 1 ? 'ship' : 'ships'}` : ''].filter(Boolean).join(' and ')} in view.`);
  if (!B.length && !P.length && !o.in_view.water.length) s.push('No named place is in view.');
  return s.join(' ');
}

// ---------- what is at a point (model metres): the building (tallest part at the point), water, park, nearest places
export function featuresAt(I, x, z, opts = {}) {
  const ad = I.adapter, [lon, lat] = ad.toLonLat(x, z), out = { lon: r6(lon), lat: r6(lat), in_model: ad.inBox(x, z), ground_m: r1(I.ground(x, z)), height_datum: ad.heightDatum, building: null, water: null, park: null, nearest: [] };
  const i = opts.building != null && opts.building >= 0 ? opts.building : I.buildingAt(x, z);
  if (i >= 0) { const b = I.A.buildings[i], id = I.keys && I.keys.ids[i], o = (id && I.keys.osm[id]) || {}, r = I.regOf.get(i);
    out.building = { model_index: i, name: I.buildingName(i), osm: id ? (id[0] === 'w' ? 'way/' : 'relation/') + id.slice(1) : null, osm_url: id ? `https://www.openstreetmap.org/${id[0] === 'w' ? 'way' : 'relation'}/${id.slice(1)}` : null,
      height_m: r1(b.h), base_m: r1(b.b), top_m: r1(b.b + b.h), levels: o.l ? +o.l || o.l : null, type: o.b || null, address: [o.a, o.pc].filter(Boolean).join(', ') || null, wikidata: o.wd || (r && r.wd) || null,
      registry: r ? { id: r.id, name: r.n || null, use: r.t || null, occupants: r.o ?? null, companies: r.co ?? null, homes: r.hm ?? null, owners: r.own || [] } : null }; }
  for (const { R, bb, w } of I.waterRings()) if (x >= bb[0] && x <= bb[2] && z >= bb[1] && z <= bb[3] && inRings(R, x, z)) { out.water = { name: w.n || (w.tidal ? ad.tidalWaterName : null), water_level_m: w.level, tidal: !!w.tidal }; break; }
  for (const { R, bb } of I.greenRings()) if (x >= bb[0] && x <= bb[2] && z >= bb[1] && z <= bb[3] && inRings(R, x, z)) { const p = nearestPlace(I, x, z, ['park']); out.park = { name: p && p.d < 400 ? p.name : null }; break; }
  const G = { adapter: ad, elon: lon, elat: lat, heading: 0, ex: x, ez: z };
  out.nearest = I.places.map(p => [p, Math.hypot(p.x - x, p.z - z)]).sort((a, b) => a[1] - b[1]).slice(0, 5).map(([p]) => { const r = rel(G, p.x, p.z); return { name: p.name, kind: p.kind, distance_m: r.distance_m, direction: r.direction, wikidata: p.wd || undefined }; });
  const bits = [];
  if (out.building) bits.push(`${out.building.name || 'A building without a name'}${out.building.registry && out.building.registry.occupants ? ` (${out.building.registry.occupants} occupants in the registry)` : ''}, ${Math.round(out.building.height_m)} m tall`);
  if (out.water) bits.push(`water: ${out.water.name || 'unnamed'}${out.water.tidal ? ' (tidal)' : ''}`);
  if (out.park) bits.push(`a park or green space${out.park.name ? ': ' + out.park.name : ''}`);
  if (!bits.length) bits.push(out.in_model ? 'open ground or street' : 'outside the model');
  out.text = `At ${out.lat.toFixed(5)}, ${out.lon.toFixed(5)}: ${bits.join('; ')}. Nearest named place: ${out.nearest[0] ? `${out.nearest[0].name}, ${distText(out.nearest[0].distance_m)} ${out.nearest[0].direction}` : 'none'}.`;
  return out;
}

// ---------- place search (exact, then prefix, then contains): places, water and named buildings of the atlas
export function findPlaces(I, q, limit = 10) {
  q = String(q || '').trim().toLowerCase(); if (!q) return [];
  const all = [...I.places.map(p => ({ name: p.name, kind: p.kind, x: p.x, z: p.z })), ...I.water.map(w => ({ name: w.name, kind: 'water', x: w.cx, z: w.cz })),
    ...((I.atlas && I.atlas.buildings) || []).filter(r => r.n && r.mi && r.mi.length).map(r => ({ name: r.n, kind: 'building', x: r.x, z: r.z, mi: r.mi[0], id: r.id }))];
  const score = n => { n = n.toLowerCase(); return n === q ? 0 : n.startsWith(q) ? 1 : n.includes(' ' + q) ? 2 : n.includes(q) ? 3 : 9; };
  const seen = new Set();
  return all.map(p => [p, score(p.name)]).filter(([p, s]) => s < 9).sort((a, b) => a[1] - b[1] || a[0].name.length - b[0].name.length)
    .filter(([p]) => { const k = p.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit)
    .map(([p]) => { const [lon, lat] = I.adapter.toLonLat(p.x, p.z); return { ...p, lon: r6(lon), lat: r6(lat) }; });
}

// ---------- a local wall-clock time (YYYY-MM-DD[THH:MM[:SS]], no offset) in a time zone to UTC milliseconds (Intl only)
export function zonedToUtc(s, tz) {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?$/.exec(String(s).trim()); if (!m) return NaN;
  const want = Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] ?? 12), +(m[5] ?? 0), +(m[6] ?? 0));
  const off = t => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t; };
  let t = want; for (let k = 0; k < 3; k++) t = want - off(t); return t;
}
// any time string: an ISO time with Z or an offset as it is; a wall-clock time without one in the place's time zone
export function parseTime(v, tz) {
  if (typeof v === 'number') return v; const s = String(v || '').trim(); if (!s || /^now$/i.test(s)) return Date.now();
  if (/(Z|[+-]\d\d:?\d\d)$/i.test(s)) return Date.parse(s); return zonedToUtc(s, tz);
}
