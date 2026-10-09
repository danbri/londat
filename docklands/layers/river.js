// River (layer "river") of the Three.js port: the WebGL page's river-layer.js (Menu > Layers > River): river buses and
// piers, locks, PLA harbour notices, swim water, moorings and houseboats, named historic ships, the Thames Barrier test-day
// banner. Ported from river-layer.js (busIndex, scheduledBoats, nextDepartures, liveBoats, lockState, tides, plaRing,
// the cards and build); the drawing goes through overlay-kit.js (solid parts lit, ribbons on the water). Static parts
// are one group per part; boats and lock badges change with the page clock and are rebuilt once a minute of page clock
// (ctx.clock). Files (../cwplans/feeds/river/*.json, tools/fetch-river.mjs) load when a part is ticked; TfL is asked
// only after a tap on "Correct with live TfL arrivals". On the water: max(ground, the tide level of layers/tide.js) + 0.5 m.
// URL: ?river=rbus,rlocks (parts on at load). Not ported: the Tower Bridge note on its card, the Sky panel row.
// Data and licences: skill cwplans-river-and-water; page side: skill docklands-3d-page, "River layer", "Three.js port".
import { RMesh, beam, stick, ribbon, geoOf, inBoxOf, bboxOf, londonTime, buildGroup, disposeGroup, addTaps, makeLabels, toast, revealPart } from '../overlay-kit.js';
import { WU } from '../water.js';

const FILES = { bus: 'river-bus.json', locks: 'locks.json', crt: 'crt-notices.json', pla: 'pla-notices.json', barrier: 'thames-barrier.json', eden: 'eden-dock.json', royal: 'royal-docks.json', osm: 'osm-river.json', moor: 'pla-moorings.json', wd: 'wikidata-vessels.json', levels: 'levels.json' };
const NEED = { rbus: ['bus'], rlocks: ['locks', 'levels', 'crt'], rpla: ['pla'], rswim: ['eden', 'royal'], rmoor: ['osm', 'moor'], rships: ['wd', 'osm'] };
const NAMES = { rbus: 'River buses and piers', rlocks: 'Locks', rpla: 'Harbour notices (PLA)', rswim: 'Swim water', rmoor: 'Moorings and houseboats', rships: 'Historic ships' };
const LINE = { rb1: { name: 'RB1', col: [.12, .55, .98] }, rb4: { name: 'RB4', col: [.1, .82, .72] }, rb6: { name: 'RB6', col: [1, .55, .15] }, 'woolwich-ferry': { name: 'Woolwich Ferry', col: [.95, .9, .3] } };
const PLACOL = { closure: [1, .3, .18], 'exclusion-zone': [1, .3, .18], works: [1, .68, .15], event: [.88, .42, 1], 'thames-barrier': [.35, .7, 1] };
const RATE = { excellent: [.15, .8, .35], good: [.2, .7, .85], sufficient: [1, .7, .2], poor: [.95, .2, .2] };
const M2 = 744.6 * 60e3;   // semi-diurnal tidal cycle, 12 h 25.2 min
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

export default {
  id: 'river', label: 'River', on: true,
  async init(ctx) {
    const { A, esc, loadJSON, groundAt, draw, scene, THREE } = ctx, CW = ctx.WEBGL.replace(/docklands\/$/, ''), geo = geoOf(A), inBox = inBoxOf(A);
    const RV = { data: {}, live: null, clockN: {}, river: null, bus: null, tides: null };
    const on = {}; for (const k of Object.keys(NEED)) on[k] = false;
    const T = () => ctx.clock, wl = () => WU.tideLevel.value + .1;
    const card = html => ctx.showCard(html);
    const credit = (m, extra) => `<div class="small" style="margin-top:6px">Snapshot ${esc(londonTime(m.fetched))} (London time; not live)${extra ? ' · ' + esc(extra) : ''}. ${esc(m.attribution || '')}. Licence: ${esc(m.licence || '')}.</div>`;
    const loadFile = k => RV.data[k] ? Promise.resolve(RV.data[k]) : loadJSON(CW + 'feeds/river/' + FILES[k]).then(d => (RV.data[k] = d));
    const loadRiver = () => RV.river ? Promise.resolve(RV.river) : loadJSON(ctx.DATA + 'river.json').then(d => (RV.river = d));
    const badge = (M, x, z, y0, h, plate, col, stem = [.92, .93, .95]) => { stick(M, x, z, y0, y0 + h, 1.2, stem); stick(M, x, z, y0 + h, y0 + h + plate, plate, col); };
    const onWater = h => (x, z) => Math.max(groundAt(x, z), wl()) + h;
    const labels = makeLabels(ctx);

    // ---------- Thames centreline and pier paths (data/river.json: every 20 m, third value = distance to the bank)
    function nearestCl(x, z) { const cl = RV.river.thames; let b = 0, e = 1e18; for (let i = 0; i < cl.length; i++) { const d = (cl[i][0] - x) ** 2 + (cl[i][1] - z) ** 2; if (d < e) { e = d; b = i; } } return b; }
    const pathCache = new Map();
    function pierPath(a, b) {
      const key = a.id + '>' + b.id; if (pathCache.has(key)) return pathCache.get(key);
      const cl = RV.river.thames, ia = nearestCl(a.x, a.z), ib = nearestCl(b.x, b.z), p = [[a.x, a.z]];
      if (Math.abs(ia - ib) > 6) { const s = ia < ib ? 1 : -1; for (let i = ia; i !== ib + s; i += s) p.push([cl[i][0], cl[i][1]]); }
      p.push([b.x, b.z]); const L = [0]; for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
      const out = { p, L, len: L.at(-1) }; pathCache.set(key, out); return out;
    }
    function along(Pp, f) {
      const d = Math.max(0, Math.min(1, f)) * Pp.len; let i = 1; while (i < Pp.L.length - 1 && Pp.L[i] < d) i++;
      const a = Pp.p[i - 1], b = Pp.p[i], s = Pp.L[i] - Pp.L[i - 1] || 1, u = (d - Pp.L[i - 1]) / s;
      return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, hx: (b[0] - a[0]) / s, hz: (b[1] - a[1]) / s };
    }
    // ---------- river buses (TfL)
    function busIndex() {
      if (RV.bus) return RV.bus; const d = RV.data.bus, piers = new Map(), routes = [], tts = [];
      const pier = (id, name, lon, lat) => { if (!piers.has(id)) { const [x, z] = geo(lon, lat); piers.set(id, { id, name, x, z, lines: new Set() }); } return piers.get(id); };
      for (const it of d.items) if (it.kind === 'pier') pier(it.values.naptan, it.values.name, it.position.lon, it.position.lat);
      for (const it of d.items) if (it.kind === 'river-bus-route') { const v = it.values, stops = v.stops.map(s => pier(s.id, s.name, s.lon, s.lat)); stops.forEach(s => s.lines.add(v.line)); routes.push({ line: v.line, dir: v.direction, stops }); }
      for (const it of d.items) if (it.kind === 'river-bus-timetable') { const v = it.values, iv = {};
        for (const [k, o] of Object.entries(v.minutes_to_later_zone_piers_by_interval || {})) iv[k] = Object.entries(o).map(([id, m]) => ({ p: piers.get(id), m })).filter(s => s.p).sort((a, b) => a.m - b.m);
        tts.push({ line: v.line, dir: v.direction, sched: v.schedule, from: v.from_name, deps: v.departures.map(x => ({ m: toMin(x.t), iv: x.iv })).filter(x => x.m != null), iv, url: it.url }); }
      return (RV.bus = { piers, routes, tts });
    }
    const schedFits = (name, wd) => { const s = name.toLowerCase(); if (/monday/.test(s)) return wd >= 1 && wd <= 5; if (/saturday and sunday/.test(s)) return wd === 0 || wd === 6; if (/saturday/.test(s)) return wd === 6; if (/sunday/.test(s)) return wd === 0; return false; };
    function scheduledBoats(t) {
      const Bi = busIndex(), wd = wdOf(t), now = minOf(t) + (t / 60e3 % 1), out = [];
      for (const tt of Bi.tts) { if (!schedFits(tt.sched, wd)) continue;
        for (const dp of tt.deps) { const st = tt.iv[dp.iv]; if (!st || st.length < 2) continue; const m = now - dp.m; if (m < 0 || m > st.at(-1).m) continue;
          let k = 1; while (k < st.length - 1 && st[k].m < m) k++; const a = st[k - 1], b = st[k], f = b.m > a.m ? (m - a.m) / (b.m - a.m) : 1;
          out.push({ line: tt.line, dir: tt.dir, a: a.p, b: b.p, f, dep: dp.m, from: tt.from, sched: tt.sched, ta: dp.m + a.m, tb: dp.m + b.m, url: tt.url }); } }
      return out;
    }
    function nextDepartures(pier, t, n = 4) {
      const Bi = busIndex(), wd = wdOf(t), now = minOf(t), out = [];
      for (const tt of Bi.tts) { if (!schedFits(tt.sched, wd)) continue;
        for (const dp of tt.deps) { const st = tt.iv[dp.iv]; if (!st) continue; const i = st.findIndex(s => s.p === pier); if (i < 0 || i === st.length - 1) continue; const at = dp.m + st[i].m; if (at >= now) out.push({ at, line: tt.line, to: st.at(-1).p.name }); } }
      return out.sort((a, b) => a.at - b.at).slice(0, n);
    }
    async function liveBoats(btn) {   // only after a tap: TfL arrival predictions, one request for the lines
      if (btn) { btn.disabled = true; btn.textContent = 'Asking TfL…'; }
      try {
        const r = await fetch('https://api.tfl.gov.uk/Line/rb1,rb4,rb6,woolwich-ferry/Arrivals'); if (!r.ok) throw new Error('HTTP ' + r.status); const list = await r.json();
        await loadFile('bus'); await loadRiver(); const Bi = busIndex(), first = new Map();
        for (const a of list) { const k = a.vehicleId || a.id; if (!first.has(k) || a.timeToStation < first.get(k).timeToStation) first.set(k, a); }
        const boats = [];
        for (const a of first.values()) { const p = Bi.piers.get(a.naptanId); if (!p) continue;
          const route = Bi.routes.find(q => q.line === a.lineId && q.dir === a.direction && q.stops.indexOf(p) > 0) || Bi.routes.find(q => q.line === a.lineId && q.stops.indexOf(p) > 0); if (!route) continue;
          const prev = route.stops[route.stops.indexOf(p) - 1]; let segMin = null;
          for (const tt of Bi.tts) if (tt.line === a.lineId) for (const st of Object.values(tt.iv)) { const i = st.findIndex(s => s.p === prev), j = st.findIndex(s => s.p === p); if (i >= 0 && j > i) { segMin = st[j].m - st[i].m; break; } }
          if (segMin == null) segMin = pierPath(prev, p).len / 8 / 60;
          const f = Math.max(0, Math.min(1, 1 - a.timeToStation / 60 / Math.max(1, segMin)));
          boats.push({ line: a.lineId, dir: a.direction || route.dir, a: prev, b: p, f, live: true, vessel: a.vehicleId, tts: a.timeToStation, expected: a.expectedArrival, dest: a.destinationName }); }
        RV.live = { at: Date.now(), boats, n: list.length };
        if (btn) btn.textContent = `Live TfL arrivals at ${hm(Date.now())}: ${boats.length} boats. Ask again`;
        if (!on.rbus) await setPart('rbus', true); else rebuildClock();
        if (Math.abs(T() - Date.now()) > 15 * 60e3) toast('Live river-bus positions are for now; the page clock is at another time, so the boats stay at their timetable positions.');
      } catch (e) { if (btn) btn.textContent = 'TfL did not answer (' + e.message + '). Try again'; }
      finally { if (btn) btn.disabled = false; }
    }
    const liveValid = () => RV.live && Date.now() - RV.live.at < 5 * 60e3 && Math.abs(T() - Date.now()) < 15 * 60e3;
    const busCredit = live => credit(RV.data.bus.meta, live ? 'timetables and piers; the boat position above is from the live request' : 'timetables and piers');
    const liveBtn = () => { const b = document.querySelector('#cardBody [data-rlive]'); if (b) b.onclick = () => liveBoats(b); };
    function boatCard(o) {
      const L = LINE[o.line] || { name: o.line }, where = `between ${esc(o.a.name)} and ${esc(o.b.name)}`;
      const body = o.live ? `<div>Live: TfL predicts arrival at ${esc(o.b.name)} in ${Math.round(o.tts / 60)} min (${esc(hm(Date.parse(o.expected)))}), towards ${esc(o.dest || '')}. Vessel ${esc(o.vessel || '')}.</div><div class="small">TfL gives no boat positions: the boat is drawn ${where}, at the share of the timetable minutes that is left. Asked at ${esc(hm(RV.live.at))}.</div>`
        : `<div>Timetabled trip ${where}: ${hmm(o.ta)} to ${hmm(o.tb)} (left ${esc(o.from)} at ${hmm(o.dep)}; ${esc(o.sched)} timetable).</div><div class="small">Drawn where the timetable puts it at the page clock (${esc(hm(T()))}), not a live position. Bank holidays and planned closures are not applied.</div>`;
      card(`<b>${esc(L.name)} river bus</b> <span class="small">${esc(o.dir)}</span>${body}<p><button type="button" data-rlive>Correct with live TfL arrivals</button></p>${barrierRow()}${busCredit(o.live)}`); liveBtn();
    }
    function pierCard(p) {
      const t = T(), nx = nextDepartures(p, t);
      card(`<b>${esc(p.name)}</b> <span class="small">river-bus pier · ${esc(p.id)} · ${[...p.lines].map(l => esc((LINE[l] || { name: l }).name)).join(', ')}</span>` +
        `<div>${nx.length ? 'Next timetabled boats after ' + esc(hm(t)) + ': ' + nx.map(d => `${hmm(d.at)} ${esc((LINE[d.line] || { name: d.line }).name)} to ${esc(d.to)}`).join('; ') : 'No more timetabled boats from this pier on this day in the timetables held.'}</div>` +
        `<div class="small">Times from the TfL timetable for the page clock's weekday (bank holidays not applied). <a href="https://tfl.gov.uk/modes/river/" target="_blank" rel="noopener">TfL river services</a></div><p><button type="button" data-rlive>Correct river buses with live TfL arrivals</button></p>${barrierRow()}${busCredit()}`); liveBtn();
    }
    // ---------- locks: tide window from the EA gauges, CRT notices in force
    function gauge(id) { const it = RV.data.levels.items.find(i => i.id === `ea-level:${id}-level-tidal_level-i-15_min-mAOD`); return it ? it.values.readings.map(r => [Date.parse(r[0]), r[1]]) : []; }
    function cleanTP() {   // Tower Pier minus Charlton: drop readings more than 0.45 m from the 2-hour median (fault F21)
      const tp = gauge('0007'), ch = new Map(gauge('0003')), d = tp.map(([t, v]) => [t, ch.has(t) ? v - ch.get(t) : null]);
      return tp.filter((r, i) => { if (d[i][1] == null) return true; const w = d.filter(q => q[1] != null && Math.abs(q[0] - d[i][0]) <= 2 * 3600e3).map(q => q[1]).sort((a, b) => a - b); return Math.abs(d[i][1] - w[w.length >> 1]) <= .45; });
    }
    function extremes(R) {
      const out = [];
      for (let i = 1; i < R.length - 1; i++) { const lo = R.filter(r => Math.abs(r[0] - R[i][0]) <= 3 * 3600e3); if (lo[0][0] > R[i][0] - 2.5 * 3600e3 || lo.at(-1)[0] < R[i][0] + 1.5 * 3600e3) continue;
        const hi = lo.every(r => r[1] <= R[i][1]), lw = lo.every(r => r[1] >= R[i][1]); if (!hi && !lw) continue;
        const [a, b, c] = [R[i - 1], R[i], R[i + 1]], den = a[1] - 2 * b[1] + c[1], s = (c[0] - a[0]) / 2, dt = den ? (a[1] - c[1]) / (2 * den) * s : 0;
        if (!out.length || Math.abs(out.at(-1).t - (b[0] + dt)) > 3 * 3600e3) out.push({ hw: hi, t: b[0] + Math.max(-s, Math.min(s, dt)), v: b[1] }); }
      return out;
    }
    function tides() { if (RV.tides) return RV.tides; const lb = extremes(cleanTP()), nw = extremes(gauge('0001')), all = [...lb, ...nw].map(e => e.t); return (RV.tides = { lb, nw, t0: Math.min(...all), t1: Math.max(...all) }); }
    function nearestExtreme(list, hw, t) {
      const L = list.filter(e => e.hw === hw); if (!L.length) return null; const Tt = tides();
      if (t >= Tt.t0 - 3 * 3600e3 && t <= Tt.t1 + 3 * 3600e3) { const e = L.reduce((b, e) => Math.abs(e.t - t) < Math.abs(b.t - t) ? e : b); return { t: e.t, est: false }; }
      if (Math.abs(t - (t < Tt.t0 ? Tt.t0 : Tt.t1)) > 7 * 864e5) return null;
      const e = t < Tt.t0 ? L[0] : L.at(-1), k = Math.round((t - e.t) / M2); return { t: e.t + k * M2, est: true };
    }
    function hoursFit(rows, t) {
      if (!rows || !rows.length) return { ok: true, row: null }; const p = lp(t), mo = +p.month, wd = wdOf(t), m = minOf(t);
      for (const r of rows) { const s = (r.season || 'all year').toLowerCase(), d = (r.days || 'every day').toLowerCase();
        if (/summer/.test(s) && !(mo >= 4 && mo <= 10)) continue; if (/winter/.test(s) && (mo >= 4 && mo <= 10)) continue;
        if (/monday to friday/.test(d) && !(wd >= 1 && wd <= 5)) continue; if (/weekend/.test(d) && !(wd === 0 || wd === 6)) continue;
        return { ok: m >= toMin(r.from) && m <= toMin(r.to), row: r }; }
      return { ok: false, row: null };
    }
    const inForce = (n, t) => { const s = Date.parse(n.validity.start), e = n.validity.end ? Date.parse(n.validity.end) : Infinity; return t >= s && t <= e; };
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
      const ns = s.ns.map(n => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a> (${esc(n.type)}, ${esc(n.validity.start.slice(0, 10))} to ${esc(n.validity.end ? n.validity.end.slice(0, 10) : 'open-ended')})</li>`).join('');
      const conf = (v.conflicts || []).map(c => `<div class="small">Another CRT page says: ${esc(c.claim)} (<a href="${esc(c.source)}" target="_blank" rel="noopener">source</a>).</div>`).join('');
      card(`<b>${esc(it.name)}</b> <span class="small">${esc(v.operator || '')}${v.links ? ' · ' + esc(v.links) : ''}</span>` +
        `<div><b>At ${esc(hm(t))}, ${esc(dShort(t))}: ${esc(s.word)}.</b></div><div class="small">${esc(v.status || '')}. ${win} ${hrs ? 'Staffed: ' + hrs + '.' : ''} ${v.booking ? 'Booking: ' + esc(v.booking) + '.' : ''}</div>${conf}` +
        (ns ? `<div class="small">CRT notices in force at the clock:</div><ul class="small">${ns}</ul>` : '') +
        `<div class="small">High and low water from the EA tide gauges (Tower Pier for London Bridge, Silvertown for North Woolwich; Tower Pier readings cleaned for fault F21), measured ${esc(dShort(tides().t0))} to ${esc(dShort(tides().t1))}; outside those days the time is stepped by 12 h 25 min cycles and is only an estimate. Badge: green inside the window and the staffed hours, amber inside the window only, grey outside or not known, red a CRT closure. Rules paraphrased from the operator pages: ${(v.sources || []).map(s2 => `<a href="${esc(s2.url)}" target="_blank" rel="noopener">${esc(s2.title)}</a> (read ${esc(s2.read)})`).join('; ')}.</div>${barrierRow()}${credit(RV.data.locks.meta)}`);
    }
    // ---------- PLA notices
    function plaFor(t) { const day = dayOf(t); return RV.data.pla.items.filter(i => (!i.validity.start || i.validity.start.slice(0, 10) <= day) && (!i.validity.end || i.validity.end.slice(0, 10) >= day)); }
    function plaRing(it) {
      const [w, s, e, n] = it.position.bbox, c = [geo(w, s), geo(e, s), geo(e, n), geo(w, n)], diag = Math.hypot(c[2][0] - c[0][0], c[2][1] - c[0][1]);
      if (diag < 700) return { ring: c, kind: 'box' };
      const cl = RV.river.thames, X = c.map(p => p[0]), Z = c.map(p => p[1]), inb = p => p[0] >= Math.min(...X) && p[0] <= Math.max(...X) && p[1] >= Math.min(...Z) && p[1] <= Math.max(...Z);
      const idx = cl.map((p, i) => inb(p) && inBox(p[0], p[1]) ? i : -1).filter(i => i >= 0); if (idx.length < 2) return null;
      const sel = cl.slice(idx[0], idx.at(-1) + 1), L = [], R = [];
      for (let i = 0; i < sel.length; i++) { const a = sel[Math.max(0, i - 1)], b = sel[Math.min(sel.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, h = sel[i][2] * .8;
        L.push([sel[i][0] - dz / l * h, sel[i][1] + dx / l * h]); R.push([sel[i][0] + dz / l * h, sel[i][1] - dx / l * h]); }
      return { ring: L.concat(R.slice().reverse()), kind: 'reach', mid: sel.map((p, i) => [(p[0] + L[i][0]) / 2, (p[1] + L[i][1]) / 2]), caps: [[L[0], R[0]], [L.at(-1), R.at(-1)]] };
    }
    function plaCard(it) {
      const v = it.values;
      card(`<b>${esc(it.title)}</b> <span class="small">PLA Notice to Mariners ${esc(v.notice)} · ${esc(it.kind)}${v.closure ? ' · closure' : ''}</span><div>In force ${esc(it.validity.start || '?')} to ${esc(it.validity.end || '?')} · ${esc(v.reach_from || '')}${v.reach_to ? ' to ' + esc(v.reach_to) : ''} · issued by the ${esc(v.issued_by_role || 'harbourmaster')}</div>` +
        `<div class="small">Outline: the notice's bounding box (or, for a long reach, the river between its banks inside that box), not the notice's own polygon. Facts only; the notice text is not copied: read it at <a href="${esc(it.url)}" target="_blank" rel="noopener">pla.co.uk/notices/${esc(v.notice)}</a>. Shown for the page clock's day, ${esc(dShort(T()))}.</div>${barrierRow()}${credit(RV.data.pla.meta)}`);
    }
    // ---------- swim water, moorings, ships
    function edenCard() {
      const d = RV.data.eden, S = d.items.filter(i => i.kind === 'bathing-sample').sort((a, b) => a.time < b.time ? 1 : -1), tmp = d.items.find(i => i.kind === 'water-temperature');
      card(`<b>Eden Dock: swim water</b> <span class="small">Sea Lanes Canary Wharf · results as published</span><table class="small">${S.map(s => `<tr><td>${esc(s.time)}</td><td>${esc(s.values.rating)}</td><td>E. coli ${s.values.e_coli_cfu_100ml}</td><td>IE ${s.values.intestinal_enterococci_cfu_100ml}</td></tr>`).join('')}</table>` +
        `<div class="small">cfu per 100 ml. ${esc(S[0] ? S[0].values.standard : '')}.${tmp ? ` Water temperature ${tmp.values.temperature_c} °C as the swimming page showed it on ${esc(londonTime(tmp.time))} (the page does not say when it was measured).` : ''} The last sample is not today's water: check <a href="${esc(S[0] ? S[0].url : d.meta.url)}" target="_blank" rel="noopener">the operator's page</a> before a swim.</div>${credit(d.meta)}`);
    }
    function royalCard() {
      const d = RV.data.royal, S = d.items.filter(i => i.kind === 'bathing-sample');
      card(`<b>Royal Docks: water tests</b> <span class="small">Royal Docks Waterways certificate${d.meta.certificates && d.meta.certificates[0] ? ' ' + esc(d.meta.certificates[0].id || '') : ''}</span><table class="small">${S.map(s => { const v = s.values; return `<tr><td>${esc(v.location)}</td><td>E. coli ${v.e_coli_per_100ml}</td><td>enterococci ${v.enterococci_per_100ml}</td><td>${v.temperature_c} °C</td><td>${esc(v.interpretation_e_coli || '')}</td></tr>`; }).join('')}</table>` +
        `<div class="small">Sampled ${esc(S[0] ? S[0].time : '')}; per 100 ml. The docks lie east of the model: this marker stands at the model's east edge towards them. The certificate writes "Royal George V Dock" for King George V Dock. <a href="${esc(S[0] ? S[0].url : d.meta.url)}" target="_blank" rel="noopener">The certificate (PDF)</a></div>${credit(d.meta)}`);
    }
    function osmCard(it) {
      const v = it.values, tags = Object.entries(v).filter(([k]) => k !== 'name').map(([k, x]) => `${esc(k)}=${esc(x)}`).join(', ');
      card(`<b>${esc(v.name || ({ mooring: 'Mooring', houseboat: 'Houseboat', ship: 'Ship' })[it.kind] || it.kind)}</b> <span class="small">${esc(it.kind)} · OSM</span><div class="small">${tags}</div><div class="small">${it.kind === 'houseboat' ? 'A houseboat is a home: the name is the boat\'s, as mapped. ' : ''}<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.id.replace(/^osm:/, ''))} on OpenStreetMap</a>. © OpenStreetMap contributors (ODbL 1.0); extract of ${esc(String(RV.data.osm.meta.osm_data_as_of).slice(0, 10))}.</div>`);
    }
    const visitCard = it => { const v = it.values; card(`<b>${esc(it.title)}</b> <span class="small">PLA visitor mooring</span><div>Run by ${esc(v.ownership || '?')}${v.website ? ` · <a href="${esc(v.website)}" target="_blank" rel="noopener">${esc(v.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>` : ''}</div>${credit(RV.data.moor.meta)}`); };
    const wdCard = it => { const v = it.values; card(`<b>${esc(it.title || 'Wikidata ' + v.qid + ' (no English label)')}</b> <span class="small">${esc(v.description || '')}</span><div class="small">${esc((v.classes || []).join(', '))}${v.inception ? ' · built ' + esc(v.inception) : ''}${v.imo ? ' · IMO ' + esc(v.imo) : ''}${v.mmsi ? ' · MMSI ' + esc(v.mmsi) : ''}</div><div class="small">Position: ${esc(it.position.precision)}. <a href="${esc(it.url)}" target="_blank" rel="noopener">Wikidata ${esc(v.qid)}</a> (CC0).</div>`); };
    // ---------- Thames Barrier test days (GOV.UK)
    function barrierInfo(t) {
      const d = RV.data.barrier; if (!d) return null; const day = dayOf(t), L = d.items.filter(i => i.kind === 'planned-closure').map(i => ({ s: Date.parse(i.time.start), e: Date.parse(i.time.end), it: i }));
      return { today: L.find(x => dayOf(x.s) === day), next: L.filter(x => x.s > t).sort((a, b) => a.s - b.s)[0], meta: d.meta };
    }
    function barrierRow() { const b = barrierInfo(T()); return b && b.today ? `<div class="small" style="border-left:3px solid #ffb347;padding-left:8px;margin:6px 0">Thames Barrier test closure on this day: gates closed about ${hm(b.today.s)} to ${hm(b.today.e)} (London time). Gates may move up to an hour early; tests can be cancelled.</div>` : ''; }
    function banner() {
      const b = barrierInfo(T()); if (!b) return;
      bannerEl.innerHTML = (b.today ? `<b>Thames Barrier test closure on ${esc(dShort(b.today.s))}</b>: gates closed about ${hm(b.today.s)} to ${hm(b.today.e)}, London time (gates may move up to an hour early; tests can be cancelled).`
        : b.next ? `Next planned Thames Barrier test closure: ${esc(dShort(b.next.s))}, about ${hm(b.next.s)} to ${hm(b.next.e)}, London time.` : 'No planned Thames Barrier test closure after the page clock in the GOV.UK list held.') +
        ` Source: <a href="${esc(b.meta.page)}" target="_blank" rel="noopener">GOV.UK, The Thames Barrier</a> (OGL v3.0).`; bannerEl.hidden = false;
    }

    // ---------- build: static parts per part; clock parts (boats, locks) in their own group
    const root = new THREE.Group(); root.name = 'river'; scene.add(root);
    const PART = {}; for (const k of Object.keys(NEED)) PART[k] = { k, group: null, hits: [], polys: [], n: {}, lines: [] };
    let clockG = null, clockHits = [], lastMin = -1, lastDay = '';
    function buildPart(k) {
      const p = PART[k], M = { S: new RMesh(), G: new RMesh(), F: new RMesh(), tips: [] }, t = T(), hits = [], polys = [], n = {}, L = p.lines = [];
      labels.clear(l => l.part === k);
      const lab = (name, x, y, z, pri, cd) => { const l = labels.add(name, x, y, z, pri, cd, () => on[k] && root.visible); l.part = k; };
      if (k === 'rbus') { const BI = busIndex(); n.piers = 0; n.routes = 0; const seen = new Set();
        for (const r of BI.routes) for (let i = 0; i + 1 < r.stops.length; i++) { const a = r.stops[i], b = r.stops[i + 1], key = [r.line, ...[a.id, b.id].sort()].join(); if (seen.has(key)) continue; seen.add(key);
          if (!inBox(a.x, a.z) && !inBox(b.x, b.z)) continue; const pts = pierPath(a, b).p, col = (LINE[r.line] || LINE.rb1).col; ribbon(M.F, pts, 6, col, onWater(.5), false, inBox); L.push({ pts, col, w: 3 }); n.routes++; }
        for (const p2 of BI.piers.values()) { if (!inBox(p2.x, p2.z)) continue; const g = Math.max(groundAt(p2.x, p2.z), wl()); badge(M.S, p2.x, p2.z, g, 18, 9, [.1, .55, .95], [.95, .95, 1]); n.piers++; L.push({ pts: [[p2.x, p2.z]], col: [.1, .55, .95], r: 6 }); hits.push({ x: p2.x, y: g + 22, z: p2.z, card: () => pierCard(p2) }); } }
      if (k === 'rpla') { n.local = 0; n.portwide = 0;
        for (const it of plaFor(t)) { if (/portwide/.test(it.values.scope || '')) { n.portwide++; continue; } const R = plaRing(it); if (!R) continue; const col = PLACOL[it.kind] || [.8, .8, .85];
          if (R.kind === 'box') { ribbon(M.F, R.ring, 5, col, onWater(.6), true, inBox); L.push({ pts: R.ring, col, closed: true }); }
          else { ribbon(M.F, R.mid, 5, col, onWater(.6), false, inBox); L.push({ pts: R.mid, col }); for (const c of R.caps) ribbon(M.F, c, 6, col, onWater(.6), false, inBox); }
          n.local++; polys.push({ ring: R.ring, bb: bboxOf(R.ring), pri: R.kind === 'box' ? .5 : 4, card: () => plaCard(it) });
          const [cx, cz] = geo(it.position.lon, it.position.lat); if (inBox(cx, cz)) hits.push({ x: cx, y: wl() + 2, z: cz, card: () => plaCard(it) }); } }
      if (k === 'rswim') { n.swim = 0;
        if (RV.data.eden) { const d = RV.data.eden, s = d.items.filter(i => i.kind === 'bathing-sample').sort((a, b) => a.time < b.time ? 1 : -1)[0], tmp = d.items.find(i => i.kind === 'water-temperature'), [x, z] = geo(s.position.lon, s.position.lat), g = Math.max(groundAt(x, z), RV.river ? RV.river.eden_level : 3.6);
          badge(M.S, x, z, g, 14, 7, RATE[String(s.values.rating).toLowerCase()] || [.6, .6, .6]); hits.push({ x, y: g + 17, z, card: edenCard }); n.swim++; L.push({ pts: [[x, z]], col: [.15, .8, .35], r: 6 });
          lab(`Swim water: ${s.values.rating} (${new Date(s.time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})${tmp ? ` · ${tmp.values.temperature_c} °C` : ''}`, x, g + 21, z, 3, edenCard); }
        if (RV.data.royal) { const E = A.meta.extent, x = E.x1 - 30, z = -310, g = groundAt(x, z), S0 = RV.data.royal.items.filter(i => i.kind === 'bathing-sample'), worst = S0.some(s => !/pass/i.test(s.values.interpretation_e_coli || '')) ? RATE.sufficient : RATE.excellent;
          badge(M.S, x, z, g, 14, 7, worst); hits.push({ x, y: g + 17, z, card: royalCard }); n.swim++; lab('Royal Docks water tests →', x, g + 21, z, 3, royalCard); } }
      if (k === 'rmoor') { n.moor = 0; n.house = 0; n.visit = 0;
        if (RV.data.osm) for (const it of RV.data.osm.items) { if (it.kind !== 'mooring' && it.kind !== 'houseboat') continue; const [x, z] = geo(it.position.lon, it.position.lat); if (!inBox(x, z)) continue; const g = Math.max(groundAt(x, z), wl());
          if (it.kind === 'mooring') { stick(M.S, x, z, g, g + 6, 1.4, [.55, .75, .95]); n.moor++; }
          else { beam(M.S, [x - 8, g + 1.5, z], [x + 8, g + 1.5, z], 4.5, 3, [.55, .38, .25]); beam(M.S, [x - 5, g + 4, z], [x + 5, g + 4, z], 3.5, 2, [.85, .8, .7]); n.house++; }
          L.push({ pts: [[x, z]], col: [.55, .75, .95], r: 3 }); hits.push({ x, y: g + 4, z, card: () => osmCard(it) }); }
        if (RV.data.moor) for (const it of RV.data.moor.items) { const [x, z] = geo(it.position.lon, it.position.lat); if (!inBox(x, z)) continue; const g = Math.max(groundAt(x, z), wl());
          badge(M.S, x, z, g, 12, 5, [.2, .8, .75]); n.visit++; L.push({ pts: [[x, z]], col: [.2, .8, .75], r: 5 }); hits.push({ x, y: g + 15, z, card: () => visitCard(it) }); } }
      if (k === 'rships') { n.ships = 0; const qs = new Set();
        const ship = (name, x, z, cd) => { const g = Math.max(groundAt(x, z), wl()); badge(M.S, x, z, g, 12, 4, [.95, .78, .35]); hits.push({ x, y: g + 14, z, card: cd }); lab(name, x, g + 16, z, 2, cd); L.push({ pts: [[x, z]], col: [.95, .78, .35], r: 5 }); n.ships++; };
        if (RV.data.wd) for (const it of RV.data.wd.items) { const [x, z] = geo(it.position.lon, it.position.lat); if (!inBox(x, z)) continue; qs.add(it.values.qid); ship(it.title || `Wikidata ${it.values.qid}`, x, z, () => wdCard(it)); }
        if (RV.data.osm) for (const it of RV.data.osm.items) { if (it.kind !== 'ship' || !it.values.name || qs.has(it.values.wikidata)) continue; const [x, z] = geo(it.position.lon, it.position.lat); if (!inBox(x, z)) continue; ship(it.values.name, x, z, () => osmCard(it)); } }
      disposeGroup(p.group); p.group = buildGroup(M, 'river:' + k); p.group.visible = on[k]; root.add(p.group); p.hits = hits; p.polys = polys; p.n = n; p.tris = M.S.idx.length / 3 + M.F.idx.length / 3;
    }
    function rebuildClock() {
      disposeGroup(clockG); clockG = null; clockHits = []; const M = { S: new RMesh(), tips: [] }, t = T(), n = {};
      if (on.rbus && RV.data.bus && RV.river) { const boats = liveValid() ? RV.live.boats : scheduledBoats(t); n.boats = 0; n.live = !!liveValid();
        for (const o of boats) { const q = along(pierPath(o.a, o.b), o.f); if (!inBox(q.x, q.z)) continue; const y = wl(), col = (LINE[o.line] || LINE.rb1).col, hx = q.hx * 16, hz = q.hz * 16;
          beam(M.S, [q.x - hx, y + 1.5, q.z - hz], [q.x + hx, y + 1.5, q.z + hz], 8, 3, [.93, .94, .96]); beam(M.S, [q.x - hx * .6, y + 4, q.z - hz * .6], [q.x + hx * .5, y + 4, q.z + hz * .5], 6, 2.4, col);
          stick(M.S, q.x, q.z, y + 5, y + 24, 1, [.93, .94, .96]); stick(M.S, q.x, q.z, y + 24, y + 29, 5, col);
          clockHits.push({ x: q.x, y: y + 26, z: q.z, card: () => boatCard(o) }); n.boats++; } }
      if (on.rlocks && RV.data.locks && RV.data.levels) { n.locks = 0;
        for (const it of RV.data.locks.items) { const [x, z] = geo(it.position.lon, it.position.lat); if (!inBox(x, z)) continue; const s = lockState(it, t), g = groundAt(x, z);
          badge(M.S, x, z, g, 22, 10, s.col); clockHits.push({ x, y: g + 26, z, card: () => lockCard(it) }); n.locks++; } }
      if (M.S.n) { clockG = buildGroup(M, 'river:clock'); root.add(clockG); }
      RV.clockN = n; draw();
    }
    async function setPart(k, v, quiet) {
      on[k] = v; boxes[k].checked = v;
      if (!v) { if (PART[k].group) PART[k].group.visible = false; if (k === 'rbus' || k === 'rlocks') rebuildClock(); draw(); return; }
      try { await Promise.all([...NEED[k].map(loadFile), loadRiver(), loadFile('barrier').then(banner)]); }
      catch (e) { toast(`${esc(NAMES[k])}: a file did not load (${esc(e.message)}).`); on[k] = false; boxes[k].checked = false; return; }
      if (!on[k]) return;
      buildPart(k); if (k === 'rbus' || k === 'rlocks') rebuildClock();
      if (quiet) { PART[k].group.visible = true; draw(); return; }
      PART[k].group.visible = false; revealPart(ctx, PART[k].group, NAMES[k], draw2dOf(PART[k].lines), () => on[k]); draw();
    }
    const css = c => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
    const draw2dOf = list => (cx, toPx) => { cx.lineCap = cx.lineJoin = 'round';
      for (const l of list) { if (l.pts.length === 1) { const [px, py] = toPx(l.pts[0][0], l.pts[0][1]); cx.fillStyle = css(l.col); cx.beginPath(); cx.arc(px, py, l.r || 5, 0, 7); cx.fill(); continue; }
        cx.strokeStyle = css(l.col); cx.lineWidth = l.w || 4; cx.beginPath(); l.pts.forEach(([x, z], i) => { const [px, py] = toPx(x, z); i ? cx.lineTo(px, py) : cx.moveTo(px, py); }); if (l.closed) cx.closePath(); cx.stroke(); } };
    addTaps(ctx, () => root.visible ? [...Object.values(PART).filter(p => on[p.k] && p.group && p.group.visible), { hits: clockHits }] : []);
    // the page clock: boats and locks once a minute of page clock; a new day rebuilds the notices and the banner
    ctx.onFrame(() => {
      const t = T(), m = Math.floor(t / 60e3), day = dayOf(t); if (m === lastMin) return; lastMin = m;
      if (day !== lastDay) { lastDay = day; if (RV.data.barrier) banner(); if (on.rpla) buildPart('rpla'); }
      if ((on.rbus || on.rlocks) && RV.river) rebuildClock();
    });

    // ---------- UI
    ctx.ui.section('River');
    const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px 10px'; ctx.ui.host().appendChild(wrap);
    const boxes = {};
    for (const k of Object.keys(NEED)) { const l = document.createElement('label'); l.className = 'row'; l.style.margin = '2px 0'; const i = document.createElement('input'); i.type = 'checkbox'; i.onchange = () => setPart(k, i.checked); l.append(i, ' ' + NAMES[k]); wrap.appendChild(l); boxes[k] = i; }
    const bannerEl = ctx.ui.note(''); bannerEl.hidden = true;
    ctx.ui.note('Dated snapshots (4 October 2026). Boats where the TfL timetable puts them at the page clock (live only after a tap on a pier or boat). Locks: green inside the tide window and staffed hours, amber window only, grey outside or not known, red a CRT closure. Tap one for its record. Powered by TfL Open Data; PLA; Canal &amp; River Trust; EA (OGL v3.0); © OpenStreetMap contributors (ODbL); Wikidata (CC0).');

    for (const k of (ctx.qs.has('river') ? ctx.qs.get('river') : Object.keys(NEED).join(',')).split(',').filter(k => NEED[k])) setPart(k, true, true);   // all on by default (owner, 2026-10-09); ?river= or ?river=a,b for fewer
    const api = { object: root, ownUi: true, setPart, liveBoats, rebuildClock, lockState, tides, scheduledBoats, busIndex, barrierInfo, RV, on,
      setVisible(v) { root.visible = v; draw(); },
      get state() { return { on: { ...on }, parts: Object.fromEntries(Object.values(PART).map(p => [p.k, { n: p.n, hits: p.hits.length, polys: p.polys.length, tris: p.tris }])), clock: { ...RV.clockN, hits: clockHits.length }, labels: labels.n, live: !!RV.live }; } };
    ctx.river = api;
    return api;
  },
};
