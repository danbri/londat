// The Docklands page without 3D (OKR KR3.2 and KR3.3: https://github.com/danbri/londat/issues/8): a 2D map (canvas 2D, no
// WebGL, no WebGPU) and a data-only page API (window.docklands) for a browser that has no renderer, or for ?no3d=1.
// textview.js loads this module when main.js signals "no 3D" (event docklands-no3d, flag globalThis.__docklandsNo3d);
// the text view stays the main view and the map sits above it. One state for all three: the address. A move (map drag,
// a link in the text, goTo) rewrites the address as the 3D page's share hash #v=1&c=tx,tz,ty,dist,yaw,pitch[&t=], so the
// same link opens the 3D view on a device that has one; ?ll=, ?view= and ?place= work as deep links in both.
// The map draws the model's own data (area.js: water, greens, roads, rail, buildings, place names), north up (the model
// grid north, within 1° of true north here), with the view's eye and field of view. Keys on the map: arrows pan, + and −
// zoom, Enter says what is at the centre. Skill: docklands-3d-page, "No 3D: text view, 2D map and page API (KR3.2)".
import { describeView as describeCore, featuresAt as featuresCore, findPlaces as findCore, viewGeo, timeOf, parseTime, bearing, decode, DESCRIBE_VERSION } from './describe.js';
import { VIEWS, VIEW_LABELS } from './views.js';

export const NO3D_VERSION = '1.0.0';
const API_VERSION = '1.0.0';   // the same interface version as api.js (the 3D page API); a subset of its functions
const D = Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function initNo3d({ index, linkCamera, section, refresh }) {
  if (globalThis.docklands && globalThis.docklands.no3d) return globalThis.docklands;
  const T0 = performance.now(), timing = {};   // ms from the start of initNo3d: paths (the map's Path2D), draw (the first map), ready
  const I = index(), ad = I.adapter, A = I.A, TZ = ad.timeZone;

  // ---------- the state is the address
  function state() { const { c, time } = linkCamera(); const t = time ? parseTime(time, TZ) : NaN; return { c, time: isFinite(t) ? t : Date.now(), timeSet: !!time && isFinite(t) }; }
  const wall = t => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
  function write(c, t) {   // the share hash of the 3D page (index.html / main.js writeHash): c= and t= (London wall-clock time)
    const q = new URLSearchParams(location.search); for (const k of ['ll', 'view', 'place', 't', 'ht']) q.delete(k);
    const h = new URLSearchParams(location.hash.replace(/^#/, '')); h.set('v', '1');
    h.set('c', [c.tx, c.tz, c.ty || 0].map(v => v.toFixed(1)).concat([c.dist.toFixed(0), c.yaw.toFixed(4), c.pitch.toFixed(4)]).join(','));
    if (c.vw) h.set('vw', c.vw); else if (c.vw === null) h.delete('vw'); if (c.hfov) h.set('f', 'h' + (+c.hfov).toFixed(4)); else h.delete('f'); if (t === null) h.delete('t'); else if (t !== undefined) h.set('t', wall(t));
    history.replaceState(null, '', location.pathname + (q.size ? '?' + q : '') + '#' + h.toString().replace(/%2C/g, ','));
  }
  const camOf = c => { const ce = Math.cos(c.pitch), eye = [c.tx + c.dist * Math.sin(c.yaw) * ce, (c.ty || 0) + c.dist * Math.sin(c.pitch), c.tz + c.dist * Math.cos(c.yaw) * ce];
    return { eye, target: [c.tx, c.ty || 0, c.tz], fovY: c.hfov ? 2 * Math.atan(Math.tan(c.hfov / 2) / (innerWidth / Math.max(1, innerHeight))) : 45.8 * D, aspect: innerWidth / Math.max(1, innerHeight), yaw: c.yaw }; };
  const sunAt = (t, lon, lat) => { const AE = globalThis.Astronomy; if (!AE) return null;
    try { const d = new Date(t), o = new AE.Observer(lat, lon, 10), e = AE.Equator('Sun', d, o, true, true), hz = AE.Horizon(d, o, e.ra, e.dec, 'normal'); return { alt: hz.altitude, az: hz.azimuth }; } catch { return null; } };
  const r1 = v => Math.round(v * 10) / 10;
  let changed = () => {};   // the map and the text view, after a move
  async function moved() { changed(); await refresh(); }

  // ---------- the page API without 3D: the same names and answers as api.js where they make sense
  function getView() {
    const { c, time } = state(), G = viewGeo(I, camOf(c)); delete G.frame; delete G.elon; delete G.elat;
    const [lon, lat] = ad.toLonLat(c.tx, c.tz), s = sunAt(time, lon, lat);
    return { api_version: API_VERSION, mode: 'no3d', ...G, time: timeOf(time, TZ), sun: s ? { altitude_deg: r1(s.alt), azimuth_deg: r1(s.az) } : null, night: s ? s.alt < -6 : null,
      view: new URLSearchParams(location.search).get('view') || null, share: location.href };
  }
  async function describeView(o = {}) {
    const { c, time } = state(), [lon, lat] = ad.toLonLat(c.tx, c.tz);
    return { ...describeCore(I, camOf(c), { time, sun: sunAt(time, lon, lat), share: location.href, view: new URLSearchParams(location.search).get('view') || null, maxItems: o.maxItems || 8, maxDistance: o.maxDistance }), api_version: API_VERSION, mode: 'no3d' };
  }
  async function goTo(t, o = {}) {
    let found = null; const { c: c0 } = state();
    if (t && typeof t === 'object' && t.view) t = String(t.view);
    if (t && typeof t === 'object' && t.place) { o = { ...t, ...o }; t = String(t.place); }
    if (typeof t === 'string') {
      const s = t.trim(), sl = s.toLowerCase(), vk = Object.keys(VIEWS).find(k => k === sl || (VIEW_LABELS[k] || '').toLowerCase() === sl);
      if (vk && o.lon == null) { const v = VIEWS[vk]; write({ tx: v.tx, tz: v.tz, ty: v.ty || 0, dist: v.dist, yaw: v.yaw, pitch: v.pitch, hfov: v.hfov || null, vw: vk }); await moved(); return { ...getView(), found: { name: VIEW_LABELS[vk] || vk, kind: 'view' } }; }
      found = findCore(I, s, 1)[0];
      if (!found) throw new Error(`No place called "${s}" in the model. Try findPlaces("${s.slice(0, 3)}") or listViews(). (Without 3D there is no globe: places outside the model are not shown.)`);
      t = { lon: found.lon, lat: found.lat, range_m: o.range_m ?? (found.kind === 'building' ? 600 : found.kind === 'water' ? 1200 : 900), heading_deg: o.heading_deg, pitch_deg: o.pitch_deg };
    }
    const lon = +t.lon, lat = +t.lat; if (!isFinite(lon) || !isFinite(lat)) throw new Error('goTo needs a place name, a view id, or { lon, lat } in WGS84 degrees');
    const [x, z] = ad.fromLonLat(lon, lat);
    if (!ad.inBox(x, z, 500)) throw new Error(`(${lat}, ${lon}) is outside the model area (west ${ad.bbox[0].toFixed(4)}, south ${ad.bbox[1].toFixed(4)}, east ${ad.bbox[2].toFixed(4)}, north ${ad.bbox[3].toFixed(4)}). Without 3D there is no globe.`);
    const pitch = t.pitch_deg != null ? clamp(+t.pitch_deg, 2, 89.5) * D : clamp(c0.pitch, 0.2, 1.3);
    const dist = clamp(+(t.range_m ?? t.range ?? (t.alt_m ?? t.alt) / Math.sin(Math.max(0.1, pitch))) || clamp(c0.dist, 250, 2000), 10, 16000);
    let yaw = c0.yaw;
    if (t.heading_deg != null) { const [l2, b2] = ad.toLonLat(x, z - 100), conv = ((bearing(lon, lat, l2, b2) + 540) % 360) - 180; yaw = -((+t.heading_deg - conv) * D); }
    write({ tx: x, tz: z, ty: I.ground(x, z), dist, yaw, pitch, hfov: null, vw: null }); await moved();
    return { ...getView(), found: found ? { name: found.name, kind: found.kind } : undefined };
  }
  async function setTime(v) {
    const t = parseTime(v, TZ); if (!isFinite(t)) throw new Error('setTime needs an ISO 8601 time (with Z or an offset, or a wall-clock time of the place), a number of ms, or "now"');
    const now = v == null || /^now$/i.test(String(v)); write(state().c, now ? null : t); await moved();
    const g = getView(); return { time: g.time, night: g.night, sun: g.sun };
  }
  async function featuresAt(lon, lat) {
    let x, z; if (lon == null || lat == null) { const { c } = state(); x = c.tx; z = c.tz; }
    else { if (!isFinite(+lon) || !isFinite(+lat)) throw new Error('featuresAt needs lon and lat in WGS84 degrees, or no arguments for the centre of the view'); [x, z] = ad.fromLonLat(+lon, +lat); }
    return featuresCore(I, x, z, {});
  }
  async function findPlaces(q, limit = 10) { return findCore(I, q, limit).map(({ name, kind, lon, lat, id }) => ({ name, kind, lon, lat, id })); }
  const listViews = () => Object.keys(VIEWS).map(id => ({ id, label: VIEW_LABELS[id] || id }));
  const listLayers = () => [{ id: 'map2d', label: '2D map (water, parks, roads, rail, buildings, names)', on: !mapBox.hidden, kind: 'setting' }];
  function setLayer(id, on) { if (id !== 'map2d') throw new Error(`No layer "${id}" without the 3D view. listLayers() gives the ids.`); mapBox.hidden = on === false || /^(0|false|off|no)$/i.test(String(on)); if (!mapBox.hidden) draw(); return listLayers()[0]; }
  const shareLink = () => location.href;

  const P = (type, description, extra = {}) => ({ type, description, ...extra });
  const TOOLS = [
    { name: 'go_to', description: 'Move the view to a place in the Docklands model (a name such as "Greenland Dock"), a named view (list_views), or a WGS84 point in the model. Returns the new view.', readOnly: false,
      inputSchema: { type: 'object', properties: { place: P('string', 'A place or building name, or a view id'), view: P('string', 'A named view id', { enum: Object.keys(VIEWS) }), lon: P('number', 'Longitude, WGS84 degrees'), lat: P('number', 'Latitude, WGS84 degrees'), range_m: P('number', 'Distance from the eye to the point, metres'), heading_deg: P('number', 'View direction, degrees clockwise from true north'), pitch_deg: P('number', 'Look-down angle, degrees') } },
      run: a => a.view ? goTo({ view: a.view }) : a.place ? goTo(a.place, a) : goTo(a) },
    { name: 'get_view', description: 'The current view: eye and target (lon, lat, height), true heading, pitch, field of view, time and time zone, sun, share link.', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: () => getView() },
    { name: 'describe_view', description: 'Describe what is in view: a paragraph and lists of the tallest buildings, named places, water and parks with distance and direction, the time of day and the sun.', readOnly: true, inputSchema: { type: 'object', properties: { maxItems: P('number', 'Places named in the paragraph (default 8)') } }, run: a => describeView(a) },
    { name: 'features_at', description: 'What is at a WGS84 point (or at the centre of the view): building, water, park, ground height, nearest named places.', readOnly: true, inputSchema: { type: 'object', properties: { lon: P('number', 'Longitude'), lat: P('number', 'Latitude') } }, run: a => featuresAt(a.lon, a.lat) },
    { name: 'set_time', description: 'Set the page clock (sun, day or night). ISO 8601; a time without an offset is the wall-clock time of the place; "now".', readOnly: false, inputSchema: { type: 'object', properties: { time: P('string', 'e.g. 2026-10-11T21:30 or now') }, required: ['time'] }, run: a => setTime(a.time) },
    { name: 'find_places', description: 'Search the named places, water and buildings of the model by name.', readOnly: true, inputSchema: { type: 'object', properties: { query: P('string', 'Two or more letters'), limit: P('number', 'At most this many (default 10)') }, required: ['query'] }, run: a => findPlaces(a.query, a.limit || 10) },
    { name: 'list_views', description: 'The named views with their ids for go_to.', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: () => listViews() },
    { name: 'share_link', description: 'A link that opens this page at the current view and time (3D where the device has it).', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: () => ({ url: shareLink() }) },
  ];
  async function callTool(name, args) { const t = TOOLS.find(x => x.name === name); if (!t) throw new Error('unknown tool ' + name); return t.run(args || {}); }
  const webmcp = { api: null, registered: [], errors: [] };
  { const mc = document.modelContext || navigator.modelContext;   // WebMCP where the browser has it (as api.js)
    if (mc) { webmcp.api = document.modelContext ? 'document.modelContext' : 'navigator.modelContext';
      for (const t of TOOLS) { const tool = { name: t.name, description: t.description + ' (Docklands page API ' + API_VERSION + ', no 3D)', inputSchema: t.inputSchema, annotations: { readOnlyHint: t.readOnly },
        execute: async input => { try { const r = await t.run(input || {}); return { content: [{ type: 'text', text: JSON.stringify(r) }], structuredContent: Array.isArray(r) ? { items: r } : r }; } catch (e) { return { content: [{ type: 'text', text: 'Error: ' + (e && e.message || e) }], isError: true }; } } };
        try { if (typeof mc.registerTool === 'function') { mc.registerTool(tool); webmcp.registered.push(t.name); } } catch (e) { webmcp.errors.push(t.name + ': ' + e); } }
      if (!webmcp.registered.length && typeof mc.provideContext === 'function') try { mc.provideContext({ tools: TOOLS }); webmcp.registered = TOOLS.map(t => t.name); } catch (e) { webmcp.errors.push(String(e)); } } }

  // ---------- the 2D map
  const css = document.createElement('style');
  css.textContent = `#map2d{max-width:760px;margin:0 auto 8px;position:relative}#map2d[hidden]{display:none}#map2d canvas{display:block;width:100%;height:min(56vh,520px);border-radius:10px;background:#20262b;touch-action:none;cursor:grab}
#map2d canvas:focus-visible{outline:3px solid var(--acc,#2cc3b5);outline-offset:2px}#map2d .bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}#map2d .bar button,#map2d .bar input{min-height:44px;min-width:44px}
#map2d .bar input[type=datetime-local]{width:auto;flex:1 1 12em}#map2d .note{margin:4px 0}`;
  document.head.appendChild(css);
  const mapBox = document.createElement('div'); mapBox.id = 'map2d';
  mapBox.innerHTML = `<canvas id="map2dCanvas" tabindex="0" role="img" aria-roledescription="2D map" aria-describedby="map2dHelp"></canvas>
<div class="bar"><button type="button" data-z="-1" aria-label="Zoom in">+</button><button type="button" data-z="1" aria-label="Zoom out">−</button>
<label for="map2dTime" class="note">Time</label><input id="map2dTime" type="datetime-local"><button type="button" id="map2dNow">Now</button></div>
<p id="map2dHelp" class="note">2D map, north up: drag or use the arrow keys to move, + and − to zoom, Enter to hear what is at the centre. The triangle is the field of view of the text below.</p>
<p id="map2dAt" class="note" aria-live="polite"></p>`;
  section.insertBefore(mapBox, section.firstChild);
  const cv = mapBox.querySelector('canvas'), g = cv.getContext('2d'), at = mapBox.querySelector('#map2dAt'), timeIn = mapBox.querySelector('#map2dTime');

  // paths in model metres, made once (Path2D; drawn with a transform)
  const ringsPath = (list, P2 = new Path2D()) => { for (const o of list) { const f = decode(o.p), n = f.length / 2, st = o.outer ? [0, (o.holes && o.holes[0]) || n] : [0, ...(o.holes || []), n];
    for (let r = 0; r + 1 < st.length; r++) { for (let k = st[r]; k < st[r + 1]; k++) (k === st[r] ? P2.moveTo : P2.lineTo).call(P2, f[2 * k], f[2 * k + 1]); P2.closePath(); } } return P2; };
  const PATH = { water: A.water.map(w => ringsPath([w])), greens: ringsPath(A.greens || []), roads: [new Path2D(), new Path2D(), new Path2D(), new Path2D()], rail: new Path2D() };
  for (const l of A.lines) { if (!l.q || l.tunnel || l.k === 'subway' || l.k === 'foot') continue; const q = decode(l.q, 3), P2 = l.k === 'road' ? PATH.roads[l.c | 0] : PATH.rail;
    for (let i = 0; i < q.length; i += 3) (i ? P2.lineTo : P2.moveTo).call(P2, q[i], q[i + 1]); }
  // buildings: one Path2D for each 500 m square, made when first in view (one Path2D of all 41,803 outlines took 14 s to
  // make in Chromium: the cost of a Path2D grows faster than its number of subpaths; 500 m squares take about 1 s in all)
  const TILE = 500, tiles = new Map();
  function buildingTiles(s) {
    if (!tiles.size) { const Bx = I.buildings(); for (let i = 0; i < A.buildings.length; i++) { const k = Math.floor(Bx.cx[i] / TILE) + ',' + Math.floor(Bx.cz[i] / TILE); if (!tiles.has(k)) tiles.set(k, { list: [], P: null }); tiles.get(k).list.push(i); } }
    const out = [], m = 120 / TILE, x0 = Math.floor((M.cx - W / 2 / s) / TILE - m), x1 = Math.floor((M.cx + W / 2 / s) / TILE + m), z0 = Math.floor((M.cz - H / 2 / s) / TILE - m), z1 = Math.floor((M.cz + H / 2 / s) / TILE + m);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const T = tiles.get(x + ',' + z); if (!T) continue;
      if (!T.P) T.P = ringsPath(T.list.map(i => ({ p: A.buildings[i].p, holes: A.buildings[i].holes, outer: true }))); out.push(T.P); }
    return out;
  }
  const LBL = [...I.places.filter(p => p.kind !== 'building').map(p => ({ name: p.name, x: p.x, z: p.z, k: p.kind })), ...I.water.map(w => ({ name: w.name, x: w.cx, z: w.cz, k: 'water' })),
    ...I.places.filter(p => p.kind === 'building').map(p => ({ name: p.name, x: p.x, z: p.z, k: 'building' }))];
  const RANK = { district: 0, water: 1, station: 2, park: 3, 'crossing or quay': 4, place: 5, building: 6 };
  LBL.sort((a, b) => (RANK[a.k] ?? 9) - (RANK[b.k] ?? 9));
  const COL = { land: '#2a3036', water: '#2f5f86', green: '#355e3b', road: '#8a8f94', rail: '#c9a35a', bld: '#4b535b', text: '#f1f4f6', halo: 'rgba(16,19,22,.85)', view: 'rgba(44,195,181,.22)', viewLine: '#2cc3b5' };

  let W = 0, H = 0, DPR = 1, M = null;   // M: the map view { cx, cz, s (px per m) }
  function fromState() { const { c } = state(); M = { cx: c.tx, cz: c.tz, s: clamp(Math.min(W, H) / Math.max(300, c.dist * 1.6), 0.02, 4) }; }
  function size() { const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1); W = Math.max(1, r.width); H = Math.max(1, r.height); cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
  const toScreen = (x, z) => [(x - M.cx) * M.s + W / 2, (z - M.cz) * M.s + H / 2];
  function draw() {
    if (mapBox.hidden) return; if (!W) size(); if (!M) fromState();
    const { c } = state(), s = M.s;
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.fillStyle = COL.land; g.fillRect(0, 0, W, H);
    g.setTransform(DPR * s, 0, 0, DPR * s, DPR * (W / 2 - M.cx * s), DPR * (H / 2 - M.cz * s));
    g.fillStyle = COL.green; g.fill(PATH.greens);
    g.fillStyle = COL.water; for (const P2 of PATH.water) g.fill(P2, 'evenodd');   // one water polygon at a time: its holes (islands) cut, overlaps do not
    if (s > 0.12) { g.fillStyle = COL.bld; for (const P2 of buildingTiles(s)) g.fill(P2); }   // outer rings only (courtyards filled)
    g.lineCap = g.lineJoin = 'round'; g.strokeStyle = COL.road;
    [0, 2.2, 1.5, 0.9].forEach((w, k) => { if (!w || (k === 3 && s < 0.2)) return; g.lineWidth = Math.max(w, w * 6 * s) / s; g.stroke(PATH.roads[k]); });
    g.strokeStyle = COL.rail; g.lineWidth = 1.6 / s; g.setLineDash([6 / s, 4 / s]); g.stroke(PATH.rail); g.setLineDash([]);
    // the view: eye, field of view, target
    const cam = camOf(c), e = cam.eye, hf = 2 * Math.atan(Math.tan(cam.fovY / 2) * cam.aspect) / 2, dx = c.tx - e[0], dz = c.tz - e[2], L = Math.hypot(dx, dz) || 1, far = Math.max(L * 2.2, 3000);
    const dir = Math.atan2(dz, dx), p1 = [e[0] + Math.cos(dir - hf) * far, e[2] + Math.sin(dir - hf) * far], p2 = [e[0] + Math.cos(dir + hf) * far, e[2] + Math.sin(dir + hf) * far];
    g.fillStyle = COL.view; g.beginPath(); g.moveTo(e[0], e[2]); g.lineTo(...p1); g.lineTo(...p2); g.closePath(); g.fill();
    g.strokeStyle = COL.viewLine; g.lineWidth = 2 / s; g.beginPath(); g.moveTo(...p1); g.lineTo(e[0], e[2]); g.lineTo(...p2); g.stroke();
    g.beginPath(); g.arc(e[0], e[2], 5 / s, 0, 7); g.fillStyle = COL.viewLine; g.fill();
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const [tx, ty] = toScreen(c.tx, c.tz); g.strokeStyle = COL.text; g.lineWidth = 2; g.beginPath(); g.moveTo(tx - 7, ty); g.lineTo(tx + 7, ty); g.moveTo(tx, ty - 7); g.lineTo(tx, ty + 7); g.stroke();
    // names: the ranks first, no overlap (a 1-px grid of boxes is too slow on a phone: a list of the boxes drawn)
    const boxes = [[0, H - 22, 250, H]], maxN = s > 0.5 ? 160 : s > 0.15 ? 90 : 40; let n = 0;
    g.font = '13px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = COL.halo;
    for (const p of LBL) { if (n >= maxN) break; if (p.k === 'building' && s < 0.3) continue; const [x, y] = toScreen(p.x, p.z); if (x < 0 || y < 0 || x > W || y > H) continue;
      const w = g.measureText(p.name).width + 6, b = [x - w / 2, y - 9, x + w / 2, y + 9]; if (b[0] < 2 || b[2] > W - 2 || b[1] < 2 || boxes.some(q => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1])) continue;
      boxes.push(b); n++; g.fillStyle = p.k === 'water' ? '#bfe0ff' : p.k === 'park' ? '#cdeccd' : COL.text; g.strokeText(p.name, x, y); g.fillText(p.name, x, y); }
    g.textAlign = 'left'; g.font = '11px system-ui,sans-serif'; g.fillStyle = COL.text; g.strokeText('N ↑   © OpenStreetMap contributors', 8, H - 10); g.fillText('N ↑   © OpenStreetMap contributors', 8, H - 10);
    const d = Math.max(300, Math.round(W / s / 100) * 100);
    cv.setAttribute('aria-label', `2D map, north up, about ${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : d + ' m'} across, centred near ${(I.places.reduce((m, p) => { const k = Math.hypot(p.x - c.tx, p.z - c.tz); return !m || k < m[1] ? [p, k] : m; }, null) || [{ name: 'the model' }])[0].name}. The text view below lists what is in view.`);
    const tt = state(); timeIn.value = wall(tt.time);
  }
  changed = () => { fromState(); draw(); };
  // moves: drag, wheel, keys, buttons; the address (and the text) follows when the move ends
  let settleT = 0;
  function settle() { clearTimeout(settleT); settleT = setTimeout(async () => { const { c } = state(); write({ ...c, tx: M.cx, tz: M.cz, ty: I.ground(M.cx, M.cz), dist: clamp(Math.min(W, H) / M.s / 1.6, 30, 16000), hfov: null, vw: null }); await refresh(); draw(); }, 350); }
  function pan(dx, dy) { M.cx -= dx / M.s; M.cz -= dy / M.s; draw(); settle(); }
  function zoom(k, sx = W / 2, sy = H / 2) { const x = M.cx + (sx - W / 2) / M.s, z = M.cz + (sy - H / 2) / M.s; M.s = clamp(M.s * k, 0.02, 6); M.cx = x - (sx - W / 2) / M.s; M.cz = z - (sy - H / 2) / M.s; draw(); settle(); }
  const ptr = new Map(); let moved0 = 0, pinch = 0;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); moved0 = 0; if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  cv.addEventListener('pointermove', e => { const p = ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p[0], dy = e.clientY - p[1]; ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoom(d / pinch); pinch = d; return; }
    moved0 += Math.abs(dx) + Math.abs(dy); if (moved0 > 3) pan(dx, dy); });
  const up = e => { const was = ptr.has(e.pointerId); ptr.delete(e.pointerId); if (ptr.size < 2) pinch = 0;
    if (was && e.type === 'pointerup' && moved0 <= 3) { const r = cv.getBoundingClientRect(), x = M.cx + (e.clientX - r.left - W / 2) / M.s, z = M.cz + (e.clientY - r.top - H / 2) / M.s, [lon, lat] = ad.toLonLat(x, z); featuresAt(lon, lat).then(f => { at.textContent = f.text; }); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  cv.addEventListener('keydown', e => { const k = e.key, step = Math.min(W, H) * 0.2;
    if (k === 'ArrowLeft') pan(step, 0); else if (k === 'ArrowRight') pan(-step, 0); else if (k === 'ArrowUp') pan(0, step); else if (k === 'ArrowDown') pan(0, -step);
    else if (k === '+' || k === '=') zoom(1.5); else if (k === '-' || k === '_') zoom(1 / 1.5);
    else if (k === 'Enter') { featuresAt().then(f => { at.textContent = f.text; }); } else return; e.preventDefault(); });
  mapBox.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => zoom(b.dataset.z === '-1' ? 1.5 : 1 / 1.5)));
  timeIn.addEventListener('change', () => { if (timeIn.value) setTime(timeIn.value).catch(e => { at.textContent = e.message; }); });
  mapBox.querySelector('#map2dNow').addEventListener('click', () => setTime('now'));
  addEventListener('resize', () => { W = 0; draw(); });
  timing.paths = Math.round(performance.now() - T0);
  size(); fromState(); draw(); timing.draw = Math.round(performance.now() - T0);

  const api = { version: API_VERSION, no3d: true, mode: 'no3d', no3dVersion: NO3D_VERSION, describeVersion: DESCRIBE_VERSION, reason: (globalThis.__docklandsNo3d && globalThis.__docklandsNo3d.error) || null,
    locale: { adapter: ad.id, timeZone: TZ, heightDatum: ad.heightDatum, bbox: ad.bbox },
    goTo, getView, setTime, listLayers, setLayer, featuresAt, describeView, findPlaces, listViews, shareLink,
    tools: TOOLS.map(({ name, description, inputSchema, readOnly }) => ({ name, description, inputSchema, readOnly })), callTool, webmcp,
    openTextView: () => globalThis.__docklandsText && globalThis.__docklandsText.open(), ready: Promise.resolve(true), timing, map: { draw, state: () => ({ ...M, width: W, height: H }) },
    help: 'Docklands page API (no 3D: text view and 2D map): https://github.com/danbri/londat/blob/main/docklands/README.md#page-api' };
  globalThis.docklands = api; timing.ready = Math.round(performance.now() - T0);
  dispatchEvent(new CustomEvent('docklands-api-ready', { detail: { version: API_VERSION, no3d: true } }));
  // building names after the first answer, as the 3D page has them: the OSM keys (building-keys.json, 2.6 MB; main.js keys())
  // and the registry index (atlas.json, 2.1 MB; layers/registry.js), which findPlaces also searches. Then the text again.
  const A0 = A.buildings[0].p, A1 = A.buildings.at(-1).p, MFP = `${A.buildings.length}:${Array.from(A0.slice(0, 6)).join('.')}:${Array.from(A1.slice(0, 6)).join('.')}`;
  const get = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
  api.keys = Promise.all([get('../cwplans/docklands/data/building-keys.json'), get('../cwplans/atlas/data/atlas.json')]).then(([K, AT]) => {
    let n = 0; if (K && !(K.model && K.model.fp !== MFP)) { K.ids = K.ids.split(','); I.setKeys(K); n++; } if (AT && AT.buildings) { I.setAtlas(AT); n++; }
    if (n) { refresh(); draw(); } return n === 2; });
  // the deep link ?place=<name> (?ll= and ?view= are read by the text view itself)
  const pl = new URLSearchParams(location.search).get('place'); if (pl) goTo(pl).catch(e => { at.textContent = e.message; });
  return api;
}
