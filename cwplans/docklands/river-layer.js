// Docklands 3D: the River layer group (Menu > Layers > River): river buses and piers, locks, PLA harbour notices,
// swim water, moorings and houseboats, named historic ships, the Thames Barrier test-day banner and the Tower Bridge
// card. Loaded by index.html after sky.js. It adds its own Layers section and Credits lines to the page. The main script
// calls DocklandsRiver.init(ctx) with its helpers, DocklandsRiver.load() and DocklandsRiver.build(B) inside
// buildOverlays(), draws OV.rclock (boats and lock badges: they change with the page clock), and calls
// DocklandsRiver.extendCard(label) in showInfo().
// Data: ../feeds/river/*.json (tools/fetch-river.mjs). Sources, licences and lessons: skill cwplans-river-and-water;
// the page side: skill docklands-3d-page, "River layer".
(() => {
'use strict';
let C = null;   // the page's helpers (init)
const RV = { data: {}, minute: -1, day: '', live: null, clockN: {}, labels: [], busy: 0 };
const FILES = { bus: 'river-bus.json', locks: 'locks.json', crt: 'crt-notices.json', pla: 'pla-notices.json', barrier: 'thames-barrier.json', eden: 'eden-dock.json', royal: 'royal-docks.json', osm: 'osm-river.json', moor: 'pla-moorings.json', wd: 'wikidata-vessels.json', levels: 'levels.json' };
const NEED = { rbus: ['bus'], rlocks: ['locks', 'levels'], rpla: ['pla'], rswim: ['eden', 'royal'], rmoor: ['osm', 'moor'], rships: ['wd', 'osm'] };
const $ = id => document.getElementById(id), on = k => { const e = $('ov_' + k); return !!(e && e.checked); };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const T = () => globalThis.DocklandsSky && isFinite(DocklandsSky.t) ? DocklandsSky.t : Date.now();

// ---------- London time
const LDN = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
const lp = t => { const o = {}; for (const p of LDN.formatToParts(new Date(t))) o[p.type] = p.value; return o; };
const dayOf = t => { const p = lp(t); return `${p.year}-${p.month}-${p.day}`; };
const minOf = t => { const p = lp(t); return +p.hour * 60 + +p.minute; };
const wdOf = t => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(lp(t).weekday);
const hm = t => { const p = lp(t); return `${p.hour}:${p.minute}`; };
const hmm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const dShort = t => new Date(t).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const toMin = s => { const m = /^(\d{1,2}):(\d\d)/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };

// ---------- the page's side
function init(ctx) {
  C = ctx; injectUi();
  loadFile('barrier').then(banner).catch(() => {});
  setInterval(tick, 1000);
}
function loadFile(k) { return RV.data[k] ? Promise.resolve(RV.data[k]) : C.loadJSON('../feeds/river/' + FILES[k]).then(d => (RV.data[k] = d)); }
async function load() {
  const want = new Set(['barrier']); for (const [k, f] of Object.entries(NEED)) if (on(k)) f.forEach(x => want.add(x));
  if (on('rlocks')) want.add('crt');
  const jobs = [...want].map(loadFile); if (want.size > 1 && !RV.river) jobs.push(C.loadJSON('data/river.json').then(d => (RV.river = d)));
  await Promise.all(jobs);
}
const wl = () => C.wl();
const credit = (m, extra) => C.ovCredit(m, extra);

// ---------- drawing helpers
const stick = (M, x, z, y0, y1, w, col) => C.beam(M, [x, y0, z], [x + .01, y1, z], w, w, col);
function badge(M, x, z, y0, h, plate, col, stem = [.92, .93, .95]) { stick(M, x, z, y0, y0 + h, 1.2, stem); stick(M, x, z, y0 + h, y0 + h + plate, plate, col); }
function ribbon(M, pts, w, col, y, closed) {   // flat quads along a polyline at height y(x, z), inside the model only
  const c = C.shade(col, 0, 1, 0), n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) { const p = pts[i], q = pts[(i + 1) % n]; if (!C.inBox(p[0], p[1]) || !C.inBox(q[0], q[1])) continue; const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz); if (l < .01) continue;
    const ox = -dz / l * w / 2, oz = dx / l * w / 2, yp = y(p[0], p[1]), yq = y(q[0], q[1]);
    const a = M.v(p[0] - ox, yp, p[1] - oz, c), b = M.v(p[0] + ox, yp, p[1] + oz, c), e = M.v(q[0] + ox, yq, q[1] + oz, c), f = M.v(q[0] - ox, yq, q[1] - oz, c); M.tri(a, b, e); M.tri(a, e, f); }
}
const onWater = h => (x, z) => Math.max(C.groundAt(x, z), wl()) + h;
function addLabel(name, x, y, z, pri, card) {
  name = String(name || '?'); const l = { name, x, y, z, pri, cls: 'rv', river: true }, el = document.createElement('button'); el.type = 'button'; el.className = 'lb rv'; el.textContent = name; el.onclick = card;
  C.labelBox.appendChild(el); l.el = el; C.labels.push(l); RV.labels.push(l);
}
function clearLabels() { for (const l of RV.labels.splice(0)) { l.el.remove(); const i = C.labels.indexOf(l); if (i >= 0) C.labels.splice(i, 1); } }

// ---------- Thames centreline and pier paths (data/river.json: every 20 m, third value = distance to the bank)
function nearestCl(x, z) { const cl = RV.river.thames; let b = 0, e = 1e18; for (let i = 0; i < cl.length; i++) { const d = (cl[i][0] - x) ** 2 + (cl[i][1] - z) ** 2; if (d < e) { e = d; b = i; } } return b; }
const pathCache = new Map();
function pierPath(a, b) {   // model-metre polyline from pier a to pier b along the river (straight across for a ferry)
  const key = a.id + '>' + b.id; if (pathCache.has(key)) return pathCache.get(key);
  const cl = RV.river.thames, ia = nearestCl(a.x, a.z), ib = nearestCl(b.x, b.z), p = [[a.x, a.z]];
  if (Math.abs(ia - ib) > 6) { const s = ia < ib ? 1 : -1; for (let i = ia; i !== ib + s; i += s) p.push([cl[i][0], cl[i][1]]); }
  p.push([b.x, b.z]); const L = [0]; for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const out = { p, L, len: L.at(-1) }; pathCache.set(key, out); return out;
}
function along(P, f) {   // point and heading at fraction f of a path
  const d = Math.max(0, Math.min(1, f)) * P.len; let i = 1; while (i < P.L.length - 1 && P.L[i] < d) i++;
  const a = P.p[i - 1], b = P.p[i], s = P.L[i] - P.L[i - 1] || 1, u = (d - P.L[i - 1]) / s;
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, hx: (b[0] - a[0]) / s, hz: (b[1] - a[1]) / s };
}

// ---------- river buses: piers, routes, timetables (TfL)
const LINE = { rb1: { name: 'RB1', col: [.12, .55, .98] }, rb4: { name: 'RB4', col: [.1, .82, .72] }, rb6: { name: 'RB6', col: [1, .55, .15] }, 'woolwich-ferry': { name: 'Woolwich Ferry', col: [.95, .9, .3] } };
function busIndex() {
  if (RV.bus) return RV.bus; const d = RV.data.bus, piers = new Map(), routes = [], tts = [];
  const pier = (id, name, lon, lat) => { if (!piers.has(id)) { const [x, z] = C.geo(lon, lat); piers.set(id, { id, name, x, z, lines: new Set() }); } return piers.get(id); };
  for (const it of d.items) if (it.kind === 'pier') pier(it.values.naptan, it.values.name, it.position.lon, it.position.lat);
  for (const it of d.items) if (it.kind === 'river-bus-route') { const v = it.values, stops = v.stops.map(s => pier(s.id, s.name, s.lon, s.lat)); stops.forEach(s => s.lines.add(v.line)); routes.push({ line: v.line, dir: v.direction, stops }); }
  for (const it of d.items) if (it.kind === 'river-bus-timetable') { const v = it.values, iv = {};
    for (const [k, o] of Object.entries(v.minutes_to_later_zone_piers_by_interval || {})) iv[k] = Object.entries(o).map(([id, m]) => ({ p: piers.get(id), m })).filter(s => s.p).sort((a, b) => a.m - b.m);
    tts.push({ line: v.line, dir: v.direction, sched: v.schedule, from: v.from_name, deps: v.departures.map(x => ({ m: toMin(x.t), iv: x.iv })).filter(x => x.m != null), iv, url: it.url }); }
  return (RV.bus = { piers, routes, tts });
}
function schedFits(name, wd) {   // TfL schedule names: "Monday to Friday", "Saturday and Sunday", "Monday - Friday", "Saturdays and Public Holidays", "Sunday"
  const s = name.toLowerCase(); if (/monday/.test(s)) return wd >= 1 && wd <= 5; if (/saturday and sunday/.test(s)) return wd === 0 || wd === 6; if (/saturday/.test(s)) return wd === 6; if (/sunday/.test(s)) return wd === 0; return false;
}
function scheduledBoats(t) {   // every timetabled trip under way at t, placed by the timetable's minutes between piers
  const B = busIndex(), wd = wdOf(t), now = minOf(t) + (t / 60e3 % 1), out = [];
  for (const tt of B.tts) { if (!schedFits(tt.sched, wd)) continue;
    for (const dp of tt.deps) { const st = tt.iv[dp.iv]; if (!st || st.length < 2) continue; const m = now - dp.m; if (m < 0 || m > st.at(-1).m) continue;
      let k = 1; while (k < st.length - 1 && st[k].m < m) k++; const a = st[k - 1], b = st[k], f = b.m > a.m ? (m - a.m) / (b.m - a.m) : 1;
      out.push({ line: tt.line, dir: tt.dir, a: a.p, b: b.p, f, dep: dp.m, from: tt.from, sched: tt.sched, ta: dp.m + a.m, tb: dp.m + b.m, url: tt.url }); } }
  return out;
}
function nextDepartures(pier, t, n = 4) {
  const B = busIndex(), wd = wdOf(t), now = minOf(t), out = [];
  for (const tt of B.tts) { if (!schedFits(tt.sched, wd)) continue;
    for (const dp of tt.deps) { const st = tt.iv[dp.iv]; if (!st) continue; const i = st.findIndex(s => s.p === pier); if (i < 0 || i === st.length - 1) continue; const at = dp.m + st[i].m; if (at >= now) out.push({ at, line: tt.line, to: st.at(-1).p.name }); } }
  return out.sort((a, b) => a.at - b.at).slice(0, n);
}
// live correction (only after a tap): TfL arrival predictions, one request for the lines; each vessel is placed on the
// route between the stop before its next pier and that pier, by the predicted seconds against the timetable's minutes
async function liveBoats() {
  const b = $('riverLive'); if (b) { b.disabled = true; b.textContent = 'Asking TfL…'; }
  try {
    const r = await fetch('https://api.tfl.gov.uk/Line/rb1,rb4,rb6,woolwich-ferry/Arrivals'); if (!r.ok) throw new Error('HTTP ' + r.status); const list = await r.json();
    await loadFile('bus'); if (!RV.river) RV.river = await C.loadJSON('data/river.json'); const B = busIndex(), first = new Map();
    for (const a of list) { const k = a.vehicleId || a.id; if (!first.has(k) || a.timeToStation < first.get(k).timeToStation) first.set(k, a); }
    const boats = [];
    for (const a of first.values()) { const p = B.piers.get(a.naptanId); if (!p) continue;
      const route = B.routes.find(r => r.line === a.lineId && r.dir === a.direction && r.stops.indexOf(p) > 0) || B.routes.find(r => r.line === a.lineId && r.stops.indexOf(p) > 0); if (!route) continue;
      const prev = route.stops[route.stops.indexOf(p) - 1]; let segMin = null;
      for (const tt of B.tts) if (tt.line === a.lineId) for (const st of Object.values(tt.iv)) { const i = st.findIndex(s => s.p === prev), j = st.findIndex(s => s.p === p); if (i >= 0 && j > i) { segMin = st[j].m - st[i].m; break; } }
      if (segMin == null) segMin = pierPath(prev, p).len / 8 / 60;   // about 8 m/s when the timetable has no minutes for the pair
      const f = Math.max(0, Math.min(1, 1 - a.timeToStation / 60 / Math.max(1, segMin)));
      boats.push({ line: a.lineId, dir: a.direction || route.dir, a: prev, b: p, f, live: true, vessel: a.vehicleId, tts: a.timeToStation, expected: a.expectedArrival, dest: a.destinationName }); }
    RV.live = { at: Date.now(), boats, n: list.length };
    if (b) b.textContent = `Live TfL arrivals at ${hm(Date.now())}: ${boats.length} boats. Ask again`;
    if (!on('rbus')) { $('ov_rbus').checked = true; C.buildOverlays(); } else rebuildClock();
    if (Math.abs(T() - Date.now()) > 15 * 60e3) C.note('Live river-bus positions are for now; the page clock is at another time, so the boats stay at their timetable positions. Set the clock to now in the Sky panel.');
  } catch (e) { if (b) b.textContent = 'TfL did not answer (' + e.message + '). Try again'; }
  finally { if (b) b.disabled = false; }
}
const liveValid = () => RV.live && Date.now() - RV.live.at < 5 * 60e3 && Math.abs(T() - Date.now()) < 15 * 60e3;
function busCredit(live) { return credit(RV.data.bus.meta, live ? 'timetables and piers; the boat position above is from the live request' : 'timetables and piers'); }
function boatCard(o) {
  const L = LINE[o.line] || { name: o.line };
  const where = `between ${esc(o.a.name)} and ${esc(o.b.name)}`;
  const body = o.live ? `<div>Live: TfL predicts arrival at ${esc(o.b.name)} in ${Math.round(o.tts / 60)} min (${esc(hm(Date.parse(o.expected)))}), towards ${esc(o.dest || '')}. Vessel ${esc(o.vessel || '')}.</div><div class="small">TfL gives no boat positions: the boat is drawn ${where}, at the share of the timetable minutes that is left. Asked at ${esc(hm(RV.live.at))}.</div>`
    : `<div>Timetabled trip ${where}: ${hmm(o.ta)} to ${hmm(o.tb)} (left ${esc(o.from)} at ${hmm(o.dep)}; ${esc(o.sched)} timetable).</div><div class="small">Drawn where the timetable puts it at the page clock (${esc(hm(T()))}), not a live position. Bank holidays and planned closures are not applied (closures: the "What's on" page).</div>`;
  C.ovCard(`<b>${esc(L.name)} river bus</b> <span class="small">${esc(o.dir)}</span>${body}<div class="acts"><button type="button" data-rlive>Correct with live TfL arrivals</button></div>${barrierRow()}${busCredit(o.live)}`);
  const b = document.querySelector('[data-rlive]'); if (b) b.onclick = liveBoats;
}
function pierCard(p) {
  const t = T(), nx = nextDepartures(p, t);
  C.ovCard(`<b>${esc(p.name)}</b> <span class="small">river-bus pier · ${esc(p.id)} · ${[...p.lines].map(l => esc((LINE[l] || { name: l }).name)).join(', ')}</span>` +
    `<div>${nx.length ? 'Next timetabled boats after ' + esc(hm(t)) + ': ' + nx.map(d => `${hmm(d.at)} ${esc((LINE[d.line] || { name: d.line }).name)} to ${esc(d.to)}`).join('; ') : 'No more timetabled boats from this pier on this day in the timetables held.'}</div>` +
    `<div class="small">Times from the TfL timetable for the page clock's weekday (bank holidays not applied). <a href="https://tfl.gov.uk/modes/river/">TfL river services</a></div>${barrierRow()}${busCredit()}`);
}

// ---------- locks: tide window (EA gauges) and CRT notices in force
function gauge(id) { const it = RV.data.levels.items.find(i => i.id === `ea-level:${id}-level-tidal_level-i-15_min-mAOD`); return it ? it.values.readings.map(r => [Date.parse(r[0]), r[1]]) : []; }
function cleanTP() {   // Tower Pier minus Charlton: drop readings more than 0.45 m from the 2-hour median (fault F21)
  const tp = gauge('0007'), ch = new Map(gauge('0003')), d = tp.map(([t, v]) => [t, ch.has(t) ? v - ch.get(t) : null]);
  return tp.filter((r, i) => { if (d[i][1] == null) return true; const w = d.filter(q => q[1] != null && Math.abs(q[0] - d[i][0]) <= 2 * 3600e3).map(q => q[1]).sort((a, b) => a - b); return Math.abs(d[i][1] - w[w.length >> 1]) <= .45; });
}
function extremes(R) {   // local highs and lows over +-3 h, timed by a parabola through the three readings round the peak
  const out = [];
  for (let i = 1; i < R.length - 1; i++) { const lo = R.filter(r => Math.abs(r[0] - R[i][0]) <= 3 * 3600e3); if (lo[0][0] > R[i][0] - 2.5 * 3600e3 || lo.at(-1)[0] < R[i][0] + 1.5 * 3600e3) continue;   // a peak needs 2.5 h of readings before it and 1.5 h after
    const hi = lo.every(r => r[1] <= R[i][1]), lw = lo.every(r => r[1] >= R[i][1]); if (!hi && !lw) continue;
    const [a, b, c] = [R[i - 1], R[i], R[i + 1]], den = a[1] - 2 * b[1] + c[1], s = (c[0] - a[0]) / 2, dt = den ? (a[1] - c[1]) / (2 * den) * s : 0;
    if (!out.length || Math.abs(out.at(-1).t - (b[0] + dt)) > 3 * 3600e3) out.push({ hw: hi, t: b[0] + Math.max(-s, Math.min(s, dt)), v: b[1] }); }
  return out;
}
const M2 = 744.6 * 60e3;   // semi-diurnal tidal cycle, 12 h 25.2 min
function tides() {
  if (RV.tides) return RV.tides; const lb = extremes(cleanTP()), nw = extremes(gauge('0001')), all = [...lb, ...nw].map(e => e.t);
  return (RV.tides = { lb, nw, t0: Math.min(...all), t1: Math.max(...all), fetched: RV.data.levels.meta.fetched });
}
function nearestExtreme(list, hw, t) {   // measured when the clock is inside the gauge window; else stepped by whole M2 cycles from the nearest measured one (estimate)
  const L = list.filter(e => e.hw === hw); if (!L.length) return null; const Tt = tides();
  if (t >= Tt.t0 - 3 * 3600e3 && t <= Tt.t1 + 3 * 3600e3) { const e = L.reduce((b, e) => Math.abs(e.t - t) < Math.abs(b.t - t) ? e : b); return { t: e.t, est: false }; }
  if (Math.abs(t - (t < Tt.t0 ? Tt.t0 : Tt.t1)) > 7 * 864e5) return null;
  const e = t < Tt.t0 ? L[0] : L.at(-1), k = Math.round((t - e.t) / M2); return { t: e.t + k * M2, est: true };
}
function hoursFit(rows, t) {   // the staffed hours row for the clock's season and weekday, and whether the clock is inside it
  if (!rows || !rows.length) return { ok: true, row: null }; const p = lp(t), mo = +p.month, wd = wdOf(t), m = minOf(t);
  for (const r of rows) { const s = (r.season || 'all year').toLowerCase(), d = (r.days || 'every day').toLowerCase();
    if (/summer/.test(s) && !(mo >= 4 && mo <= 10)) continue; if (/winter/.test(s) && (mo >= 4 && mo <= 10)) continue;
    if (/monday to friday/.test(d) && !(wd >= 1 && wd <= 5)) continue; if (/weekend/.test(d) && !(wd === 0 || wd === 6)) continue;
    return { ok: m >= toMin(r.from) && m <= toMin(r.to), row: r }; }
  return { ok: false, row: null };
}
function inForce(n, t) { const s = Date.parse(n.validity.start), e = n.validity.end ? Date.parse(n.validity.end) : Infinity; return t >= s && t <= e; }
function lockState(it, t) {
  const v = it.values, ns = (v.crt_notices || []).filter(n => inForce(n, t)), closed = ns.filter(n => /closure/i.test(n.type) && !/towpath/i.test(n.type + n.title));
  if (closed.length) return { col: [.92, .14, .12], word: 'closed (CRT notice in force)', closed, ns };
  const w = v.window; if (!w) return { col: [.45, .48, .52], word: 'no tide window held for this lock', ns };
  const ref = /north woolwich/i.test(w.reference) ? tides().nw : tides().lb, hw = /high/.test(w.kind), x = nearestExtreme(ref, hw, t);
  if (!x) return { col: [.45, .48, .52], word: 'tide not known for this date (gauge readings held for ' + dShort(tides().t0) + ' to ' + dShort(tides().t1) + ')', ns };
  const dh = (t - x.t) / 3600e3, inside = w.kind.startsWith('open') ? dh >= -w.open_hours_before && dh <= w.open_hours_after : !(dh >= -w.closed_hours_before && dh <= w.closed_hours_after);
  const h = hoursFit(v.hours, t), what = `${hw ? 'HW' : 'LW'} ${hm(x.t)}${x.est ? ' (estimated)' : ''}`;
  if (inside && h.ok) return { col: [.15, .78, .3], word: `inside the tide window (${what})`, x, ns, est: x.est };
  if (inside) return { col: [1, .7, .15], word: `inside the tide window (${what}) but outside the staffed hours`, x, ns, est: x.est };
  return { col: [.45, .48, .52], word: `outside the tide window (${what})`, x, ns, est: x.est };
}
function lockCard(it) {
  const t = T(), s = lockState(it, t), v = it.values, w = v.window;
  const win = w ? `${w.kind.startsWith('open') ? 'Open' : 'Closed'} from ${w.open_hours_before ?? w.closed_hours_before} h before to ${w.open_hours_after ?? w.closed_hours_after} h after ${esc(w.reference)}${w.approximate ? ' (approximate)' : ''}.` : '';
  const hrs = (v.hours || []).map(r => `${esc(r.season || r.days || '')}${r.season && r.days ? ' ' + esc(r.days) : ''} ${esc(r.from)} to ${esc(r.to)}`).join('; ');
  const ns = s.ns.map(n => `<li><a href="${esc(n.url)}">${esc(n.title)}</a> (${esc(n.type)}, ${esc(n.validity.start.slice(0, 10))} to ${esc(n.validity.end ? n.validity.end.slice(0, 10) : 'open-ended')})</li>`).join('');
  const conf = (v.conflicts || []).map(c => `<div class="small">Another CRT page says: ${esc(c.claim)} (<a href="${esc(c.source)}">source</a>).</div>`).join('');
  C.ovCard(`<b>${esc(it.name)}</b> <span class="small">${esc(v.operator || '')}${v.links ? ' · ' + esc(v.links) : ''}</span>` +
    `<div><b>At ${esc(hm(t))}, ${esc(dShort(t))}: ${esc(s.word)}.</b></div><div class="small">${esc(v.status || '')}. ${win} ${hrs ? 'Staffed: ' + hrs + '.' : ''} ${v.booking ? 'Booking: ' + esc(v.booking) + '.' : ''}</div>${conf}` +
    (ns ? `<div class="small">CRT notices in force at the clock:</div><ul class="small">${ns}</ul>` : '') +
    `<div class="small">High and low water from the EA tide gauges (Tower Pier for London Bridge, Silvertown for North Woolwich; Tower Pier readings cleaned for fault F21), measured ${esc(dShort(tides().t0))} to ${esc(dShort(tides().t1))}; outside those days the time is stepped by 12 h 25 min cycles and is only an estimate (error grows to about an hour within a week). Badge: green inside the window and the staffed hours, amber inside the window only, grey outside or not known, red a CRT closure. Rules paraphrased from the operator pages: ${(v.sources || []).map(s => `<a href="${esc(s.url)}">${esc(s.title)}</a> (read ${esc(s.read)})`).join('; ')}.</div>${barrierRow()}${credit(RV.data.locks.meta)}`);
}

// ---------- PLA harbourmaster notices: local ones in force on the clock's day as outlines on the water; port-wide ones in a list
const PLACOL = { closure: [1, .3, .18], 'exclusion-zone': [1, .3, .18], works: [1, .68, .15], event: [.88, .42, 1], 'thames-barrier': [.35, .7, 1] };
function plaFor(t) { const day = dayOf(t), d = RV.data.pla; return d.items.filter(i => (!i.validity.start || i.validity.start.slice(0, 10) <= day) && (!i.validity.end || i.validity.end.slice(0, 10) >= day)); }
function plaRing(it) {   // a small notice: its bbox; a long reach: the river between the banks inside the bbox
  const [w, s, e, n] = it.position.bbox, c = [C.geo(w, s), C.geo(e, s), C.geo(e, n), C.geo(w, n)], diag = Math.hypot(c[2][0] - c[0][0], c[2][1] - c[0][1]);
  if (diag < 700) return { ring: c, kind: 'box' };
  const cl = RV.river.thames, X = c.map(p => p[0]), Z = c.map(p => p[1]), inb = p => p[0] >= Math.min(...X) && p[0] <= Math.max(...X) && p[1] >= Math.min(...Z) && p[1] <= Math.max(...Z);
  const idx = cl.map((p, i) => inb(p) && C.inBox(p[0], p[1]) ? i : -1).filter(i => i >= 0); if (idx.length < 2) return null;
  const sel = cl.slice(idx[0], idx.at(-1) + 1), L = [], R = [];
  for (let i = 0; i < sel.length; i++) { const a = sel[Math.max(0, i - 1)], b = sel[Math.min(sel.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, h = sel[i][2] * .8;
    L.push([sel[i][0] - dz / l * h, sel[i][1] + dx / l * h]); R.push([sel[i][0] + dz / l * h, sel[i][1] - dx / l * h]); }
  return { ring: L.concat(R.slice().reverse()), kind: 'reach', mid: sel.map((p, i) => [(p[0] + L[i][0]) / 2, (p[1] + L[i][1]) / 2]), caps: [[L[0], R[0]], [L.at(-1), R.at(-1)]] };
}
function plaCard(it) {
  const v = it.values, t = T();
  C.ovCard(`<b>${esc(it.title)}</b> <span class="small">PLA Notice to Mariners ${esc(v.notice)} · ${esc(it.kind)}${v.closure ? ' · closure' : ''}</span><div>In force ${esc(it.validity.start || '?')} to ${esc(it.validity.end || '?')} · ${esc(v.reach_from || '')}${v.reach_to ? ' to ' + esc(v.reach_to) : ''} · issued by the ${esc(v.issued_by_role || 'harbourmaster')}</div>` +
    `<div class="small">Outline: the notice's bounding box (or, for a long reach, the river between its banks inside that box), not the notice's own polygon. Facts only; the notice text is not copied: read it at <a href="${esc(it.url)}">pla.co.uk/notices/${esc(v.notice)}</a>. Shown for the page clock's day, ${esc(dShort(t))}.</div>${barrierRow()}${credit(RV.data.pla.meta)}`);
}

// ---------- swim water (Eden Dock, Royal Docks)
const RATE = { excellent: [.15, .8, .35], good: [.2, .7, .85], sufficient: [1, .7, .2], poor: [.95, .2, .2] };
function edenCard() {
  const d = RV.data.eden, S = d.items.filter(i => i.kind === 'bathing-sample').sort((a, b) => a.time < b.time ? 1 : -1), tmp = d.items.find(i => i.kind === 'water-temperature');
  C.ovCard(`<b>Eden Dock: swim water</b> <span class="small">Sea Lanes Canary Wharf · results as published</span><table>${S.map(s => `<tr><td>${esc(s.time)}</td><td>${esc(s.values.rating)}</td><td class="n">E. coli ${s.values.e_coli_cfu_100ml}</td><td class="n">IE ${s.values.intestinal_enterococci_cfu_100ml}</td></tr>`).join('')}</table>` +
    `<div class="small">cfu per 100 ml. ${esc(S[0] ? S[0].values.standard : '')}.${tmp ? ` Water temperature ${tmp.values.temperature_c} °C as the swimming page showed it on ${esc(C.londonTime(tmp.time))} (the page does not say when it was measured).` : ''} The last sample is not today's water: check <a href="${esc(S[0] ? S[0].url : d.meta.url)}">the operator's page</a> before a swim.</div>${credit(d.meta)}`);
}
function royalCard() {
  const d = RV.data.royal, S = d.items.filter(i => i.kind === 'bathing-sample');
  C.ovCard(`<b>Royal Docks: water tests</b> <span class="small">Royal Docks Waterways certificate${d.meta.certificates && d.meta.certificates[0] ? ' ' + esc(d.meta.certificates[0].id || '') : ''}</span><table>${S.map(s => { const v = s.values; return `<tr><td>${esc(v.location)}</td><td class="n">E. coli ${v.e_coli_per_100ml}</td><td class="n">enterococci ${v.enterococci_per_100ml}</td><td class="n">${v.temperature_c} °C</td><td>${esc(v.interpretation_e_coli || '')}</td></tr>`; }).join('')}</table>` +
    `<div class="small">Sampled ${esc(S[0] ? S[0].time : '')}; per 100 ml. The docks lie east of the model: this marker stands at the model's east edge towards them; positions in the file are the west or east fifth of each dock (approximate). The certificate writes "Royal George V Dock" for King George V Dock. Cyanobacteria counts are in the file. <a href="${esc(S[0] ? S[0].url : d.meta.url)}">The certificate (PDF)</a></div>${credit(d.meta)}`);
}

// ---------- Thames Barrier test days (GOV.UK) and the Tower Bridge card
function barrierInfo(t) {
  const d = RV.data.barrier; if (!d) return null; const day = dayOf(t), L = d.items.filter(i => i.kind === 'planned-closure').map(i => ({ s: Date.parse(i.time.start), e: Date.parse(i.time.end), it: i }));
  const today = L.find(x => dayOf(x.s) === day), next = L.filter(x => x.s > t).sort((a, b) => a.s - b.s)[0];
  return { today, next, meta: d.meta };
}
function barrierRow() {
  const b = barrierInfo(T()); if (!b || !b.today) return '';
  return `<div class="rbanner">Thames Barrier test closure on this day: gates closed about ${hm(b.today.s)} to ${hm(b.today.e)} (London time). Gates may move up to an hour early; tests can be cancelled.</div>`;
}
function banner() {
  const el = $('riverBanner'), sk = $('riverSky'), b = barrierInfo(T()); if (!b) return;
  const html = b.today ? `<b>Thames Barrier test closure on ${esc(dShort(b.today.s))}</b>: gates closed about ${hm(b.today.s)} to ${hm(b.today.e)}, London time (GOV.UK: gates may move up to an hour early; tests can be cancelled).`
    : b.next ? `Next planned Thames Barrier test closure: ${esc(dShort(b.next.s))}, about ${hm(b.next.s)} to ${hm(b.next.e)}, London time.` : 'No planned Thames Barrier test closure after the page clock in the GOV.UK list held.';
  const src = ` <span class="small">Source: <a href="${esc(b.meta.page)}">GOV.UK, The Thames Barrier</a> (page updated ${esc(String(b.meta.page_updated).slice(0, 10))}, OGL v3.0).</span>`;
  if (el) { el.innerHTML = html + src; el.classList.toggle('today', !!b.today); el.hidden = false; }
  if (sk) { sk.innerHTML = html + src; sk.classList.toggle('today', !!b.today); }
}
function extendCard(l) {
  if (!l || l.wd !== 'Q83125') return;   // Tower Bridge
  const el = C.info, div = document.createElement('div'); div.className = 'small'; div.style.marginTop = '6px';
  div.innerHTML = 'Bridge lifts: the times (about 6 to 10 days ahead, with vessel names) are published at <a href="https://www.towerbridge.org.uk/bridge-lifts">towerbridge.org.uk/bridge-lifts</a>. This page does not copy them: the site\'s terms forbid automated access and reuse of its data (Legal statement clauses 2.5 and 5.3, read 4 October 2026).';
  el.appendChild(div); const b = barrierRow(); if (b) el.insertAdjacentHTML('beforeend', b);
}

// ---------- build: static parts into the overlay buffers (B.S solid, B.F flat), clock parts into OV.rclock
function build(B) {
  clearLabels(); const { S, F, hits, polys, n } = B, t = T();
  if (on('rbus') && RV.data.bus) { const BI = busIndex(); n.rpiers = 0; n.rroutes = 0; const seen = new Set();
    for (const r of BI.routes) for (let i = 0; i + 1 < r.stops.length; i++) { const a = r.stops[i], b = r.stops[i + 1], k = [r.line, ...[a.id, b.id].sort()].join(); if (seen.has(k)) continue; seen.add(k);
      if (!C.inBox(a.x, a.z) && !C.inBox(b.x, b.z)) continue; ribbon(B.F, pierPath(a, b).p, 6, (LINE[r.line] || LINE.rb1).col, onWater(.5)); n.rroutes++; }
    for (const p of BI.piers.values()) { if (!C.inBox(p.x, p.z)) continue; const g = Math.max(C.groundAt(p.x, p.z), wl()); badge(S, p.x, p.z, g, 18, 9, [.1, .55, .95], [.95, .95, 1]); n.rpiers++; hits.push({ x: p.x, y: g + 22, z: p.z, card: () => pierCard(p) }); } }
  if (on('rpla') && RV.data.pla && RV.river) { n.rpla = 0; n.rplaList = 0;
    for (const it of plaFor(t)) { if (/portwide/.test(it.values.scope || '')) { n.rplaList++; continue; } const R = plaRing(it); if (!R) continue; const col = PLACOL[it.kind] || [.8, .8, .85];
      // a box: its outline; a long reach: a line down the middle and a bar across each end (an outline along the banks ran
      // through the foreground of the photo views, where the eye stands at the river wall)
      if (R.kind === 'box') ribbon(F, R.ring, 5, col, onWater(.6), true); else { ribbon(F, R.mid, 5, col, onWater(.6));   // the middle line sits 0.4 x the half-width to one side, off the river-bus route on the centreline
        for (const c of R.caps) ribbon(F, c, 6, col, onWater(.6)); }
      n.rpla++;
      const bb = R.ring.reduce((b, [x, z]) => [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)], [1e9, 1e9, -1e9, -1e9]);
      polys.push({ ring: R.ring, bb, pri: R.kind === 'box' ? .5 : 4, card: () => plaCard(it) });
      const [cx, cz] = C.geo(it.position.lon, it.position.lat); if (C.inBox(cx, cz)) hits.push({ x: cx, y: wl() + 2, z: cz, card: () => plaCard(it) }); } }
  if (on('rswim')) { n.rswim = 0;
    if (RV.data.eden) { const d = RV.data.eden, s = d.items.filter(i => i.kind === 'bathing-sample').sort((a, b) => a.time < b.time ? 1 : -1)[0], tmp = d.items.find(i => i.kind === 'water-temperature'), [x, z] = C.geo(s.position.lon, s.position.lat), g = Math.max(C.groundAt(x, z), RV.river ? RV.river.eden_level : 3.6);
      badge(S, x, z, g, 14, 7, RATE[String(s.values.rating).toLowerCase()] || [.6, .6, .6]); hits.push({ x, y: g + 17, z, card: edenCard }); n.rswim++;
      addLabel(`Swim water: ${s.values.rating} (${new Date(s.time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})${tmp ? ` · ${tmp.values.temperature_c} °C` : ''}`, x, g + 21, z, 3, edenCard); }
    if (RV.data.royal) { const E = C.A.meta.extent, x = E.x1 - 30, z = -310, g = C.groundAt(x, z), S0 = RV.data.royal.items.filter(i => i.kind === 'bathing-sample'), worst = S0.some(s => !/pass/i.test(s.values.interpretation_e_coli || '')) ? RATE.sufficient : RATE.excellent;
      badge(S, x, z, g, 14, 7, worst); hits.push({ x, y: g + 17, z, card: royalCard }); n.rswim++; addLabel('Royal Docks water tests →', x, g + 21, z, 3, royalCard); } }
  if (on('rmoor')) { n.rmoor = 0; n.rhouse = 0; n.rvisit = 0;
    if (RV.data.osm) for (const it of RV.data.osm.items) { if (it.kind !== 'mooring' && it.kind !== 'houseboat') continue; const [x, z] = C.geo(it.position.lon, it.position.lat); if (!C.inBox(x, z)) continue; const g = Math.max(C.groundAt(x, z), wl());
      if (it.kind === 'mooring') { stick(S, x, z, g, g + 6, 1.4, [.55, .75, .95]); n.rmoor++; }
      else { C.beam(S, [x - 8, g + 1.5, z], [x + 8, g + 1.5, z], 4.5, 3, [.55, .38, .25]); C.beam(S, [x - 5, g + 4, z], [x + 5, g + 4, z], 3.5, 2, [.85, .8, .7]); n.rhouse++; }
      hits.push({ x, y: g + 4, z, card: () => osmCard(it) }); }
    if (RV.data.moor) for (const it of RV.data.moor.items) { const [x, z] = C.geo(it.position.lon, it.position.lat); if (!C.inBox(x, z)) continue; const g = Math.max(C.groundAt(x, z), wl());
      badge(S, x, z, g, 12, 5, [.2, .8, .75]); n.rvisit++; hits.push({ x, y: g + 15, z, card: () => visitCard(it) }); } }
  if (on('rships')) { n.rships = 0; const qs = new Set();
    const ship = (name, x, z, card) => { const g = Math.max(C.groundAt(x, z), wl()); badge(S, x, z, g, 12, 4, [.95, .78, .35]); hits.push({ x, y: g + 14, z, card }); addLabel(name, x, g + 16, z, 2, card); n.rships++; };
    if (RV.data.wd) for (const it of RV.data.wd.items) { const [x, z] = C.geo(it.position.lon, it.position.lat); if (!C.inBox(x, z)) continue; qs.add(it.values.qid); ship(it.title || `Wikidata ${it.values.qid}`, x, z, () => wdCard(it)); }
    if (RV.data.osm) for (const it of RV.data.osm.items) { if (it.kind !== 'ship' || !it.values.name || qs.has(it.values.wikidata)) continue; const [x, z] = C.geo(it.position.lon, it.position.lat); if (!C.inBox(x, z)) continue; ship(it.values.name, x, z, () => osmCard(it)); } }
  B.hits.push(...clockParts());
  C.labels.sort((a, b) => b.pri - a.pri);
}
function osmCard(it) {
  const v = it.values, tags = Object.entries(v).filter(([k]) => k !== 'name').map(([k, x]) => `${esc(k)}=${esc(x)}`).join(', ');
  C.ovCard(`<b>${esc(v.name || ({ mooring: 'Mooring', houseboat: 'Houseboat', ship: 'Ship' })[it.kind] || it.kind)}</b> <span class="small">${esc(it.kind)} · OSM</span><div class="small">${tags}</div><div class="small">${it.kind === 'houseboat' ? 'A houseboat is a home: the name is the boat\'s, as mapped. ' : ''}<a href="${esc(it.url)}">${esc(it.id.replace(/^osm:/, ''))} on OpenStreetMap</a>. © OpenStreetMap contributors (ODbL 1.0); extract of ${esc(String(RV.data.osm.meta.osm_data_as_of).slice(0, 10))}.</div>`);
}
function visitCard(it) { const v = it.values; C.ovCard(`<b>${esc(it.title)}</b> <span class="small">PLA visitor mooring</span><div>Run by ${esc(v.ownership || '?')}${v.website ? ` · <a href="${esc(v.website)}">${esc(v.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>` : ''}</div>${credit(RV.data.moor.meta)}`); }
function wdCard(it) {
  const v = it.values;
  C.ovCard(`<b>${esc(it.title || 'Wikidata ' + v.qid + ' (no English label)')}</b> <span class="small">${esc(v.description || '')}</span><div class="small">${esc((v.classes || []).join(', '))}${v.inception ? ' · built ' + esc(v.inception) : ''}${v.imo ? ' · IMO ' + esc(v.imo) : ''}${v.mmsi ? ' · MMSI ' + esc(v.mmsi) : ''}</div><div class="small">Position: ${esc(it.position.precision)}. <a href="${esc(it.url)}">Wikidata ${esc(v.qid)}</a> (CC0).</div>`);
}
// boats and lock badges: they change with the page clock, so they have their own buffer (OV.rclock) and hit entries
function clockParts() {
  const OV = C.OV; if (OV.rclock) { OV.rclock.free(); OV.rclock = null; } const M = new C.Mesh(), hits = [], t = T(), n = {};
  if (on('rbus') && RV.data.bus && RV.river) { const boats = liveValid() ? RV.live.boats : scheduledBoats(t); n.boats = 0; n.live = liveValid();
    for (const o of boats) { const P = pierPath(o.a, o.b), q = along(P, o.f); if (!C.inBox(q.x, q.z)) continue; const y = wl(), col = (LINE[o.line] || LINE.rb1).col, hx = q.hx * 16, hz = q.hz * 16;
      C.beam(M, [q.x - hx, y + 1.5, q.z - hz], [q.x + hx, y + 1.5, q.z + hz], 8, 3, [.93, .94, .96]); C.beam(M, [q.x - hx * .6, y + 4, q.z - hz * .6], [q.x + hx * .5, y + 4, q.z + hz * .5], 6, 2.4, col);
      stick(M, q.x, q.z, y + 5, y + 24, 1, [.93, .94, .96]); stick(M, q.x, q.z, y + 24, y + 29, 5, col);
      hits.push({ x: q.x, y: y + 26, z: q.z, rclk: true, card: () => boatCard(o) }); n.boats++; } }
  if (on('rlocks') && RV.data.locks && RV.data.levels) { n.locks = 0;
    for (const it of RV.data.locks.items) { const [x, z] = C.geo(it.position.lon, it.position.lat); if (!C.inBox(x, z)) continue; const s = lockState(it, t), g = C.groundAt(x, z);
      badge(M, x, z, g, 22, 10, s.col); hits.push({ x, y: g + 26, z, rclk: true, card: () => lockCard(it) }); n.locks++; } }
  OV.rclock = M.n ? M.upload() : null; RV.clockN = n; return hits;
}
function rebuildClock() { const OV = C.OV, h = clockParts(); OV.hits = OV.hits.filter(o => !o.rclk).concat(h); C.draw(); }
function tick() {
  const t = T(), m = Math.floor(t / 60e3), day = dayOf(t); if (m === RV.minute) return; RV.minute = m;
  if (day !== RV.day) { RV.day = day; banner(); if (on('rpla')) { C.buildOverlays(); return; } }
  if ((on('rbus') || on('rlocks')) && C.OV && !RV.pending) { RV.pending = true; requestAnimationFrame(() => { RV.pending = false; rebuildClock(); }); }
}

// ---------- the Layers section, the Credits lines, the Sky panel row (added to the page by this file)
function injectUi() {
  const css = document.createElement('style');
  css.textContent = '.lb.rv{border-color:#7fd6ff;color:#d8f3ff}.rbanner{margin:6px 0;padding:6px 9px;border-left:3px solid #5aa9e6;background:#18232d;border-radius:6px;font-size:13px}.rbanner.today{border-left-color:#ffb347;background:#2d2418}';
  document.head.appendChild(css);
  const after = $('ovLdsNote');
  if (after) after.insertAdjacentHTML('afterend', `<h3>River</h3>
      <div class="chips"><label><input type="checkbox" id="ov_rbus"> River buses and piers</label><label><input type="checkbox" id="ov_rlocks"> Locks</label><label><input type="checkbox" id="ov_rpla"> Harbour notices (PLA)</label><label><input type="checkbox" id="ov_rswim"> Swim water</label><label><input type="checkbox" id="ov_rmoor"> Moorings and houseboats</label><label><input type="checkbox" id="ov_rships"> Historic ships</label></div>
      <div id="riverBanner" class="rbanner" hidden></div>
      <p class="small" id="ovRiverNote">Dated snapshots (4 October 2026). River buses: routes on the water, piers as blue and white badges, boats where the TfL timetable puts them at the page clock (Sky panel); live positions only after a tap on the button below. Locks: green inside the tide window and staffed hours, amber inside the window only, grey outside or not known, red when a CRT closure notice is in force. Harbour notices: outlines on the water for the clock's day (red closures and exclusion zones, amber works, violet events). Swim water: the last published sample. Moorings: blue posts (OSM), houseboats, teal PLA visitor moorings. Historic ships: gold, labelled. Tap one for its record, source and date.</p>
      <div class="acts"><button type="button" id="riverLive">Correct river buses with live TfL arrivals</button></div>`);
  const lb = $('riverLive'); if (lb) lb.onclick = liveBoats;
  for (const k of Object.keys(NEED)) { const el = $('ov_' + k); if (el) el.onchange = () => C.buildOverlays(); }   // the main script binds its ov_ inputs before this section exists
  const mus = [...document.querySelectorAll('#credits h3')].find(h => /Music and software/.test(h.textContent));
  if (mus) mus.insertAdjacentHTML('beforebegin', `<h3>River and water</h3><ul class="small">
        <li>River buses, piers and timetables: Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016 and Geomni UK Map data © and database rights [2019]</li>
        <li>Harbour notices and visitor moorings: Port of London Authority (public map layers; no licence stated: facts and links only)</li>
        <li>Lock notices: Canal &amp; River Trust (facts and links only); lock rules paraphrased from Canal &amp; River Trust and Southwark Council pages</li>
        <li>Tide gauges: this uses Environment Agency flood and river level data from the real-time data API (Beta), <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">OGL v3.0</a>; Thames Barrier test closures: GOV.UK, OGL v3.0</li>
        <li>Swim water: Sea Lanes Canary Wharf (Eden Dock) and Royal Docks Waterways (certificate), results as published, with links</li>
        <li>Moorings, houseboats and ships: © OpenStreetMap contributors (ODbL 1.0); historic vessels: Wikidata (CC0 1.0)</li></ul>`);
  const tab = document.querySelector('#dtabs [data-pane="paneSky"]');
  const skyRow = () => { const p = $('paneSky'); if (p && !$('riverSky')) { p.insertAdjacentHTML('beforeend', '<div id="riverSky" class="rbanner"></div>'); banner(); } };
  if (tab) tab.addEventListener('click', () => setTimeout(skyRow, 50));
}

globalThis.DocklandsRiver = { init, load, build, extendCard, liveBoats, rebuildClock, lockState, tides, scheduledBoats, busIndex, barrierInfo, RV,
  stats() { return { ...RV.clockN, labels: RV.labels.length, live: !!RV.live }; } };
})();
