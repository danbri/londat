// Docklands 3D: the "Ships (AIS)" layer (Menu > Layers > River > Ships (AIS), on by default). Vessels on the river from
// Open Waters AIS: first the committed snapshot ../feeds/river/ais.json (tools/fetch-ais.mjs), then the live
// GET https://ais.openwaters.io/v1/vessels?bbox=... from the browser (anonymous, CORS *), every 60 s while the page is
// visible and the layer is on; doubling pause on an error or 429 (up to 16 min). Small private craft (ITU 36/37, class B
// without a commercial type, type not known on a non-class-A report) are never drawn or listed: counted only.
// AISHub and aisstream.io events are shown for scoping by the owner's decision of 2026-10-04: review before scaling.
// Loaded by index.html after river-layer.js; index.html calls DocklandsShips.init(ctx) and draws OV.ships.
// Licences, rules and lessons: skills cwplans-river-and-water ("AIS: Open Waters") and docklands-3d-page ("Ships (AIS)").
(() => {
'use strict';
let C = null;
const API = 'https://ais.openwaters.io/v1/vessels?bbox=51.474,-0.095,51.528,0.085';
const SH = { list: [], from: null, at: null, err: 0, wait: 60e3, timer: 0, labels: [], hits: [], n: {}, attribution: {}, busy: false };
const $ = id => document.getElementById(id), on = () => { const e = $('ov_ais'); return !e || e.checked; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- the same rules as tools/fetch-ais.mjs
const COMMERCIAL = t => t != null && ((t >= 30 && t <= 35) || (t >= 40 && t <= 99));
const CLASS_OF = { PositionReport: 'A', ShipStaticData: 'A', StandardClassBPositionReport: 'B', ExtendedClassBPositionReport: 'B', StaticDataReport: 'B' };
function isPrivate(v) {
  if (v.kind && v.kind !== 'vessel') return false;
  if (v.ship_type === 36 || v.ship_type === 37) return true;
  if (v.class === 'B' && !COMMERCIAL(v.ship_type)) return true;
  if (!v.class && !COMMERCIAL(v.ship_type)) return true;
  return false;
}
const GROUP = t => t == null || t === 0 ? 'type not known' : t >= 60 && t <= 69 ? 'passenger' : t >= 70 && t <= 79 ? 'cargo' : t >= 80 && t <= 89 ? 'tanker'
  : t >= 40 && t <= 49 ? 'high-speed craft' : t === 52 ? 'tug' : t === 50 ? 'pilot vessel' : t === 51 ? 'search and rescue' : t === 53 ? 'port tender'
  : t === 55 ? 'law enforcement' : t >= 50 && t <= 59 ? 'special craft' : t === 30 ? 'fishing' : t === 31 || t === 32 ? 'towing' : t === 33 ? 'dredging or underwater work'
  : t === 34 ? 'diving' : t === 35 ? 'military' : 'other';
const COL = { passenger: [.98, .55, .2], 'high-speed craft': [.2, .8, .95], tug: [.95, .85, .2], cargo: [.55, .85, .35], tanker: [.85, .3, .3], aton: [.75, .4, .95] };
const colOf = v => v.kind === 'aton' ? COL.aton : COL[GROUP(v.ship_type)] || [.85, .88, .92];
const NAV = ['under way using engine', 'at anchor', 'not under command', 'restricted manoeuvrability', 'constrained by draught', 'moored', 'aground', 'engaged in fishing', 'under way sailing'];
const still = v => v.nav_status === 1 || v.nav_status === 5 || v.nav_status === 6 || !(v.sog > .5);

// committed file items and live GeoJSON features to one shape
const fromItem = i => ({ mmsi: i.mmsi, kind: i.kind, name: i.name, callsign: i.callsign, imo: i.imo, flag: i.flag, ship_type: i.ship_type, class: i.class,
  length: i.length_m, beam: i.beam_m, lat: i.position.lat, lon: i.position.lon, cog: i.values.cog, sog: i.values.sog_kn, heading: i.values.heading,
  nav_status: i.values.nav_status, destination: i.values.destination, seen: i.time, source: i.source_kind, attribution: i.attribution });
const fromFeature = (f, attr) => { const p = f.properties || {}, [lon, lat] = f.geometry ? f.geometry.coordinates : [null, null], src = String(p.source || '').split(':')[0];
  return { mmsi: p.mmsi, kind: p.kind, name: p.name, callsign: p.callsign, imo: p.imo, flag: p.flag, ship_type: p.type, class: p.class || CLASS_OF[p.msg_type] || null,
    length: p.length, beam: p.beam, lat, lon, cog: p.cog, sog: p.sog, heading: p.heading, nav_status: p.nav_status, destination: p.destination, seen: p.seen, source: src,
    attribution: attr[src] || attr[p.source] || 'Open Waters AIS (https://openwaters.io/ais/)' }; };
function take(list, from, at) {
  const keep = [], n = { shown: 0, private: 0, outside: 0 };
  for (const v of list) { if (v.lat == null || v.lon == null) continue; if (isPrivate(v)) { n.private++; continue; } keep.push(v); }
  SH.list = keep; SH.from = from; SH.at = at; SH.n = n; rebuild();
}

// ---------- data
async function loadCommitted() {
  try { const d = await C.loadJSON('../feeds/river/ais.json'); SH.meta = d.meta; if (!SH.from || SH.from === 'none') take(d.items.map(fromItem), 'snapshot', d.meta.fetched); }
  catch (e) { C.note('The ships snapshot did not load: ' + e.message); }
}
async function fetchLive() {
  if (SH.busy || !on() || document.hidden) return; SH.busy = true;
  try {
    const r = await fetch(API, { headers: { Accept: 'application/geo+json' } });
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
    const d = await r.json(); SH.attribution = d.attribution || {};
    take((d.features || []).map(f => fromFeature(f, SH.attribution)), 'live', new Date().toISOString()); SH.err = 0; SH.wait = 60e3;
  } catch (e) { SH.err++; SH.wait = Math.min(16 * 60e3, 60e3 * 2 ** SH.err); SH.lastError = e.message; status(); }
  finally { SH.busy = false; schedule(); }
}
function schedule() { clearTimeout(SH.timer); if (on() && !document.hidden) SH.timer = setTimeout(fetchLive, SH.wait); }
function status() {
  const el = $('ovAisNote'); if (!el) return;
  const t = SH.at ? C.londonTime(SH.at) : '?', what = SH.from === 'live' ? `live from Open Waters AIS, ${t}` : `snapshot of ${t} (committed file)`;
  el.textContent = `${SH.n.shown || 0} vessels and aids to navigation shown, ${what}${SH.n.private ? `; ${SH.n.private} small private craft not shown` : ''}` +
    `${SH.lastError && SH.err ? `; live request failed (${SH.lastError}), next try in ${Math.round(SH.wait / 60e3)} min` : ''}. Positions are now, not the page clock. Tap a ship for its record.`;
}

// ---------- drawing: a hull along the heading, a mast with a coloured plate, an arrow ahead when under way
function rebuild() {
  if (!C) return; const OV = C.OV; if (OV.ships) { OV.ships.free(); OV.ships = null; }
  for (const l of SH.labels.splice(0)) { l.el.remove(); const i = C.labels.indexOf(l); if (i >= 0) C.labels.splice(i, 1); }
  SH.hits = []; SH.n.shown = 0; SH.n.outside = 0;
  if (!on()) { OV.hits = OV.hits.filter(o => !o.ais); status(); C.draw(); return; }
  const M = new C.Mesh(), y0 = C.wl();
  for (const v of SH.list) {
    const [x, z] = C.geo(v.lon, v.lat); if (!C.inBox(x, z)) { SH.n.outside++; continue; }
    const y = Math.max(C.groundAt(x, z), y0), col = colOf(v), card = () => shipCard(v);
    if (v.kind === 'aton') { C.beam(M, [x, y, z], [x + .01, y + 10, z], 1.5, 1.5, [.9, .9, .95]); C.beam(M, [x, y + 10, z], [x + .01, y + 13, z], 3, 3, col); SH.hits.push({ x, y: y + 12, z, ais: true, card }); SH.n.shown++; continue; }
    const hd = v.heading != null ? v.heading : v.cog != null ? v.cog : 0, a = hd * Math.PI / 180;
    const fx = Math.sin(a), fz = -Math.cos(a);                     // local x east, z south: heading 0 = north = -z
    const L = Math.max(v.length || 20, 14), W = Math.max(v.beam || L / 6, 4), h = Math.min(3 + L / 20, 10);
    C.beam(M, [x - fx * L / 2, y + h / 2, z - fz * L / 2], [x + fx * L / 2, y + h / 2, z + fz * L / 2], W, h, [.93, .94, .96]);
    C.beam(M, [x - fx * L * .3, y + h + 1.5, z - fz * L * .3], [x + fx * L * .15, y + h + 1.5, z + fz * L * .15], W * .7, 3, col);
    C.beam(M, [x, y + h, z], [x + .01, y + h + 14, z], 1.2, 1.2, col); C.beam(M, [x, y + h + 14, z], [x + .01, y + h + 18, z], 5, 4, col);
    if (!still(v)) { const b = L / 2, s = Math.min(10 + (v.sog || 0) * 3, 60);   // the arrow: a shaft ahead of the bow, longer with speed, and a head
      C.beam(M, [x + fx * b, y + 1.5, z + fz * b], [x + fx * (b + s), y + 1.5, z + fz * (b + s)], 2, 1.5, col);
      const hx = x + fx * (b + s), hz = z + fz * (b + s), px = -fz, pz = fx;
      C.beam(M, [hx - px * 5 - fx * 7, y + 1.5, hz - pz * 5 - fz * 7], [hx, y + 1.5, hz], 2, 1.5, col); C.beam(M, [hx + px * 5 - fx * 7, y + 1.5, hz + pz * 5 - fz * 7], [hx, y + 1.5, hz], 2, 1.5, col); }
    SH.hits.push({ x, y: y + h + 16, z, ais: true, card }); SH.n.shown++;
    if (v.name && (v.length || 0) >= 60) addLabel(v.name, x, y + h + 22, z, card);
  }
  OV.ships = M.n ? M.upload() : null; OV.hits = OV.hits.filter(o => !o.ais).concat(SH.hits); C.labels.sort((a, b) => b.pri - a.pri); status(); C.draw();
}
function addLabel(name, x, y, z, card) {
  const l = { name, x, y, z, pri: 2, cls: 'ais' }, el = document.createElement('button'); el.type = 'button'; el.className = 'lb ais'; el.textContent = name; el.onclick = card;
  C.labelBox.appendChild(el); l.el = el; C.labels.push(l); SH.labels.push(l);
}

// ---------- record card
function shipCard(v) {
  const rows = [], add = (k, val) => { if (val != null && val !== '') rows.push(`<tr><td>${k}</td><td>${esc(val)}</td></tr>`); };
  add('Type', v.kind === 'aton' ? 'aid to navigation' : `${GROUP(v.ship_type)}${v.ship_type ? ` (ITU ${v.ship_type})` : ''}`);
  add('Length', v.length ? `${v.length} m${v.beam ? ` x ${v.beam} m` : ''}` : null);
  add('Speed', v.sog != null ? `${v.sog} kn` : null); add('Course', v.cog != null ? `${Math.round(v.cog)}°` : null); add('Heading', v.heading != null ? `${v.heading}°` : null);
  add('Status', v.nav_status != null ? NAV[v.nav_status] || `code ${v.nav_status}` : null); add('Destination', v.destination);
  add('Last heard', v.seen ? `${C.londonTime(v.seen)} (London time)` : null);
  add('MMSI', v.mmsi); add('IMO', v.imo); add('Call sign', v.callsign); add('Flag', v.flag);
  const scoping = v.source === 'aishub' || v.source === 'aisstream';
  C.ovCard(`<b>${esc(v.name || 'MMSI ' + v.mmsi)}</b> <span class="small">AIS · ${SH.from === 'live' ? 'live' : 'snapshot'}</span><table>${rows.join('')}</table>` +
    `<div class="small" style="margin-top:6px">Source: ${esc(v.attribution)} (event source: ${esc(v.source)}). ${scoping ? 'Shown for scoping; licence under review (AISHub / aisstream.io).' : ''} ` +
    `<a href="https://ais.openwaters.io/v1/vessels/${esc(v.mmsi)}">Open Waters record</a>. Not for navigation. Positions are now, not the page clock.</div>`);
}

// ---------- the page's side
function injectUi() {
  const css = document.createElement('style'); css.textContent = '.lb.ais{border-color:#ffb36b;color:#ffe6cc}'; document.head.appendChild(css);
  const html = `<h3>Ships (AIS)</h3><div class="chips"><label><input type="checkbox" id="ov_ais" checked> Ships (AIS), live</label></div>
    <p class="small" id="ovAisNote">Loading ships…</p>`;
  const rl = $('riverLive'), anchor = rl ? rl.parentElement : $('ovLdsNote');
  if (anchor) anchor.insertAdjacentHTML('afterend', html);
  const cb = $('ov_ais'); if (cb) cb.onchange = () => { rebuild(); if (cb.checked) fetchLive(); else clearTimeout(SH.timer); };
  const mus = [...document.querySelectorAll('#credits h3')].find(h => /Music and software/.test(h.textContent));
  if (mus) mus.insertAdjacentHTML('beforebegin', `<h3>Ships (AIS)</h3><ul class="small">
    <li>Vessel positions: <a href="https://openwaters.io/ais/">Open Waters AIS</a> (open-source service; each event is re-served under its own source's terms).</li>
    <li>On the Thames the events come from <a href="https://www.aishub.net">AISHub</a> ("Open Waters AIS. AISHub") and aisstream.io ("Open Waters AIS. aisstream.io"); shown for scoping by the owner's decision of 4 October 2026, licence under review before any wider use. Volunteer receptions: CC0 1.0.</li>
    <li>Small private craft (sailing and pleasure craft, class B without a commercial type) are not shown. Not for navigation.</li></ul>`);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(SH.timer); else if (on()) fetchLive(); });
}
function init(ctx) {
  C = ctx; injectUi();
  loadCommitted().then(() => fetchLive());
  setInterval(() => { if (SH.hits.length && on() && !C.OV.hits.some(o => o.ais)) C.OV.hits = C.OV.hits.concat(SH.hits); }, 1000);   // buildOverlays() replaces OV.hits
}
globalThis.DocklandsShips = { init, rebuild, fetchLive, get SH() { return SH; }, isPrivate };
})();
