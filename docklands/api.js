// The page API of the Three.js port (docklands/): window.docklands, a documented and versioned interface for scripts,
// assistive technology and agents (OKR O3, KR3.3 and KR3.4: https://github.com/danbri/londat/issues/8), the same
// functions as WebMCP tools where the browser offers them, the spoken description of the view (an ARIA live region), the
// keys V (describe) and T (text view), and the locale-free deep links ?ll=lat,lon[,range] and ?place=<name>.
// The interface speaks WGS84 longitude and latitude, metres, degrees from true north and ISO 8601 times; the model frame,
// the height datum and the time zone stay inside (adapters/uk.js). The descriptions come from describe.js, which the text
// view (textview.js) and the MCP server (tools/view-mcp/server.mjs) use too, so all three say the same.
// Loaded by main.js after the layers, with the test hook (__docklands3) as its handle on the page.
// Reference: https://github.com/danbri/londat/blob/main/docklands/README.md "Page API" and https://danbri.github.io/londat/llms.txt
// Skill: docklands-3d-page, "Three.js port: page API, WebMCP and non-visual access (2026-10-11)".
import { makeIndex, describeView as describeCore, featuresAt as featuresCore, findPlaces as findCore, viewGeo, timeOf, bearing, parseTime, DESCRIBE_VERSION } from './describe.js';
import { ukAdapter } from './adapters/uk.js';
import { VIEW_LABELS } from './views.js';

export const API_VERSION = '1.0.0';
const D = Math.PI / 180, $ = id => document.getElementById(id);
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* no storage */ } } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function init(H) {
  const { THREE, camera, controls, ctx } = H, A = ctx.A, qs = new URLSearchParams(location.search);
  const adapter = ukAdapter(A), TZ = adapter.timeZone;
  const I = makeIndex(A, { adapter, under: globalThis.DOCKLANDS_UNDER || null });
  // building names: the OSM keys (building-keys.json) and the registry index (atlas.json), loaded by the page anyway
  const extras = Promise.all([H.keys().then(K => { if (K) I.setKeys(K); }), (ctx.registry?.ready || Promise.resolve(null)).then(AT => { if (AT) I.setAtlas(AT); })]).catch(e => console.warn('api: extras', e));

  // ---------- the camera in model metres (the eye from matrixWorld, which holds the vertical exaggeration)
  function camOf() {
    camera.updateMatrixWorld(); const e = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld), d = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld);
    const dist = camera.position.distanceTo(controls.target), t = e.clone().addScaledVector(d, dist);
    return { eye: [e.x, e.y, e.z], target: [t.x, t.y, t.z], fovY: camera.fov * D, aspect: camera.aspect, yaw: H.camState().yaw };
  }
  const GL = () => H.globe || null, onGlobe = () => !!(H.globe && H.globe.mode === 'globe');   // the globe (globe/globe.js), when the page has it
  const shareLink = () => onGlobe() ? H.globe.shareLink() : location.origin + location.pathname + location.search + H.shareHash();
  const sunNow = () => { const s = H.sky.state && H.sky.state.sun; return s ? { alt: s.alt, az: s.az, altGeo: s.altGeo } : null; };
  function getView() {
    if (onGlobe()) return { api_version: API_VERSION, ...H.globe.getView(), time: timeOf(H.clock, TZ), view: 'globe', share: shareLink() };
    const G = viewGeo(I, camOf()); delete G.frame; delete G.elon; delete G.elat; const s = sunNow();
    return { api_version: API_VERSION, ...G, time: timeOf(H.clock, TZ), sun: s ? { altitude_deg: Math.round(s.alt * 10) / 10, azimuth_deg: Math.round(s.az * 10) / 10 } : null, night: H.night, view: H.viewName || null, share: shareLink() };
  }
  const listViews = () => Object.keys(H.VIEWS).map(id => ({ id, label: VIEW_LABELS[id] || id }));
  const settle = () => new Promise(ok => requestAnimationFrame(() => ok()));

  // ---------- goTo: a named view, a place name, or a WGS84 point { lon, lat, range_m?, alt_m?, heading_deg?, pitch_deg? }
  async function goTo(t, o = {}) {
    let found = null;
    if (t && typeof t === 'object' && t.view) t = String(t.view);
    if (t && typeof t === 'object' && t.place) { o = { ...t, ...o }; t = String(t.place); }
    if (typeof t === 'string') {
      const s = t.trim(), sl = s.toLowerCase(), vk = Object.keys(H.VIEWS).find(k => k === sl || (VIEW_LABELS[k] || '').toLowerCase() === sl);
      if (vk && o.lon == null) { H.setView(vk); await settle(); return { ...getView(), found: { name: VIEW_LABELS[vk] || vk, kind: 'view' } }; }
      await extras; found = findCore(I, s, 1)[0];
      // not in the model: the world (countries, regions, seas, cities; region configs; later the UK skeleton) on the globe
      if (!found && GL()) { await GL().gazetteer(); const w = (await GL().searchAll(s, 3))[0];
        if (w) { await new Promise(ok => GL().flyToEntry(w, { ms: o.animate ? undefined : 0, done: ok })); await settle(); return { ...getView(), found: { name: w.name, kind: w.kind, country: w.country || undefined, lon: w.lon, lat: w.lat } }; } }
      if (!found) throw new Error(`No place called "${s}". Try findPlaces("${s.slice(0, 3)}") or listViews().`);
      t = { lon: found.lon, lat: found.lat, range_m: o.range_m ?? (found.kind === 'building' ? 600 : found.kind === 'water' ? 1200 : 900), heading_deg: o.heading_deg, pitch_deg: o.pitch_deg };
    }
    const lon = +t.lon, lat = +t.lat; if (!isFinite(lon) || !isFinite(lat)) throw new Error('goTo needs a place name, a view id, or { lon, lat } in WGS84 degrees');
    const [x, z] = adapter.fromLonLat(lon, lat);
    // anywhere else on earth, or high above the model (over 36 km): the globe
    const high = +(t.alt_m ?? t.alt ?? 0) > 36000 || +(t.range_m ?? t.range ?? 0) > 36000;
    if (GL() && (!adapter.inBox(x, z, 500) || high)) { await GL().goTo(t, { animate: !!o.animate }); await settle(); return { ...getView(), found: found ? { name: found.name, kind: found.kind } : undefined }; }
    if (!adapter.inBox(x, z, 500)) throw new Error(`(${lat}, ${lon}) is outside the model area (west ${adapter.bbox[0].toFixed(4)}, south ${adapter.bbox[1].toFixed(4)}, east ${adapter.bbox[2].toFixed(4)}, north ${adapter.bbox[3].toFixed(4)}). Other places are not modelled yet (OKR O1).`);
    const s0 = H.camState(), pitch = t.pitch_deg != null ? clamp(+t.pitch_deg, 2, 89.5) * D : clamp(s0.pitch, 0.2, 1.3);
    const range = clamp(+(t.range_m ?? t.range ?? (t.alt_m ?? t.alt) / Math.sin(Math.max(0.1, pitch))) || clamp(s0.dist, 250, 2000), 10, H.nav.NV.DMAX);
    let yaw = s0.yaw;
    if (t.heading_deg != null) {   // true heading of the view direction; the model's grid north differs from true north by the convergence
      const [l2, b2] = adapter.toLonLat(x, z - 100), conv = ((bearing(lon, lat, l2, b2) + 540) % 360) - 180; yaw = -((+t.heading_deg - conv) * D);
    }
    if (onGlobe()) { GL().stopFlight(); GL().enterModel(); }   // (the model view below)
    H.setCam({ tx: x, ty: I.ground(x, z), tz: z, dist: range, yaw, pitch, hfov: null, fov: null, roll: 0 });
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    if (found && found.mi != null) H.selectModel(found.mi);
    await settle();
    return { ...getView(), found: found ? { name: found.name, kind: found.kind } : undefined };
  }

  // ---------- time
  function setTime(v) {
    const t = parseTime(v, TZ); if (!isFinite(t)) throw new Error('setTime needs an ISO 8601 time (with Z or an offset, or a wall-clock time of the place), a number of ms, or "now"');
    if (v == null || /^now$/i.test(String(v))) H.setClockUser(Date.now(), true); else H.setClockUser(t);
    const s = sunNow(); return { time: timeOf(H.clock, TZ), night: H.night, sun: s ? { altitude_deg: Math.round(s.alt * 10) / 10, azimuth_deg: Math.round(s.az * 10) / 10 } : null };
  }

  // ---------- layers: the page settings with a switch, and the layer modules
  const BUILTIN = [['labels', 'Labels, notes and credits on the map', 'showLabels'], ['roads', 'Roads', 'showRoads'], ['shadows', 'Sun shadows', 'shadows'], ['bloom', 'Bloom by night', 'bloom']];
  function listLayers() {
    const out = BUILTIN.filter(b => $(b[2])).map(([id, label, el]) => ({ id, label, on: $(el).checked, kind: 'setting' }));
    for (const [id, L] of Object.entries(H.layers)) out.push({ id, label: L.mod.label || id, on: !!L.on, kind: 'layer', menu: L.mod.menu || null, switchable: !!(L.input || L.api.setVisible || L.api.object) });
    return out;
  }
  function setLayer(id, on) {
    on = on === undefined ? true : !!on && !/^(0|false|off|no)$/i.test(String(on));
    const b = BUILTIN.find(x => x[0] === id);
    if (b) { const el = $(b[2]); if (el && el.checked !== on) { el.checked = on; el.dispatchEvent(new Event('change')); } }
    else { const L = H.layers[id]; if (!L) throw new Error(`No layer "${id}". listLayers() gives the ids.`);
      if (L.input) { if (L.input.checked !== on) { L.input.checked = on; L.input.dispatchEvent(new Event('change')); } }
      else { if (L.api.setVisible) L.api.setVisible(on); else if (L.api.object) L.api.object.visible = on; else throw new Error(`Layer "${id}" has no switch`); L.on = on; } }
    H.draw(); return listLayers().find(l => l.id === id);
  }

  // ---------- what is at a point, or at the centre of the screen
  let REG = null;
  const reg = () => REG || (REG = ctx.loadJSON(ctx.WEBGL.replace(/docklands\/$/, '') + 'registry/buildings.json').then(d => new Map(d.buildings.map(b => [b.id, b]))).catch(() => new Map()));
  function centrePoint() {
    camera.updateMatrixWorld(); const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(0, 0), camera);
    const o = r.ray.origin, d = r.ray.direction, gB = H.nav.groundB; let s = null;
    for (let k = 0.5; k <= 12000; k += k < 50 ? 0.5 : k < 400 ? 2 : 8) if (o.y + d.y * k <= gB(o.x + d.x * k, o.z + d.z * k)) { s = k; break; }
    const hit = r.intersectObjects([...ctx.meshes.buildings.children, ...ctx.meshes.models.children], true).find(h => ctx.U.cut.value >= 250 || h.point.y <= ctx.U.cut.value);
    if (hit && (s == null || hit.distance < s)) s = hit.distance;
    if (s == null) return null; const p = o.clone().addScaledVector(d, s); return { x: p.x, z: p.z, range: s, building: H.pickAt(innerWidth / 2, innerHeight / 2) };
  }
  async function featuresAt(lon, lat) {
    if (GL() && (onGlobe() && lon == null || lon != null && !adapter.inBox(...adapter.fromLonLat(+lon, +lat), 0))) {   // outside the model: the world's answer
      if (lon == null) { const g = GL().pick(innerWidth / 2, innerHeight / 2); if (!g) return { text: 'Only sky or space at the centre of the view.', sky: true }; lon = g.lon; lat = g.lat; }
      const r = await GL().featuresAt(+lon, +lat); r.text = [r.name, r.region, r.country].filter((v, i, a) => v && a.indexOf(v) === i).join(', ') + (r.nearest[0] ? `; nearest place ${r.nearest[0].name}, ${Math.round(r.nearest[0].dist_m / 1000)} km ${r.nearest[0].direction}` : ''); return r; }
    await extras; let x, z, bi = -1, range = null;
    if (lon == null || lat == null) { const c = centrePoint(); if (!c) return { text: 'Only sky at the centre of the view.', sky: true }; ({ x, z, range } = c); bi = c.building; }
    else { if (!isFinite(+lon) || !isFinite(+lat)) throw new Error('featuresAt needs lon and lat in WGS84 degrees, or no arguments for the centre of the view'); [x, z] = adapter.fromLonLat(+lon, +lat); }
    const r = featuresCore(I, x, z, { building: bi });
    if (range != null) r.range_m = Math.round(range);
    const rg = r.building && r.building.registry;
    if (rg) { const b = (await reg()).get(rg.id); if (b) { rg.occupant_names = (b.occupants || []).map(o => o.name).filter(Boolean).slice(0, 30); rg.atlas = new URL(ctx.WEBGL.replace(/docklands\/$/, '') + 'atlas/#map/b/' + rg.id, location.href).href; } }
    return r;
  }

  // ---------- what is in view
  async function describeView(o = {}) {
    if (onGlobe()) { const d = await GL().describe({ maxItems: o.maxItems || 8, time: timeOf(H.clock, TZ).local + ' (' + TZ + ')' }); return { ...d, api_version: API_VERSION, share: shareLink() }; }
    await extras;
    const L = H.layers, W = ctx.stats.weather && ctx.stats.weather.now, Wn = ctx.weather && ctx.weather.now;
    const live = { aircraft: L.planes && L.planes.on ? L.planes.api.flights : null, ships: L.ships && L.ships.on ? L.ships.api.vessels : null };
    const weather = W ? { cloud_pct: W.cover != null ? Math.round(W.cover <= 1 && W.cover > 0 ? W.cover * 100 : W.cover) : null, visibility_m: W.vis ?? null, precipitation_mm: W.precip ?? null, temperature_c: Wn && Wn.temp != null ? Math.round(Wn.temp * 10) / 10 : null, source: W.source || null } : null;
    const occ = H.occ && H.occ();
    const dsc = describeCore(I, camOf(), { time: H.clock, sun: sunNow(), weather, live, share: shareLink(), view: H.viewName || null, maxItems: o.maxItems || 8, maxDistance: o.maxDistance,
      occluded: occ ? (k, x, y, z) => occ.test(k, x, y, z) : null });
    // the wider place (a skeleton set's district, county, country) at the target, when the globe has one
    if (GL() && dsc.target) { try { const m = await GL().whereMore(dsc.target.lon, dsc.target.lat); if (m && (m.district || m.country)) { dsc.context = m;
      dsc.text += ` Area: ${[...new Set([m.district, m.county, m.region, m.country].filter(Boolean))].join(', ')} (${m.source}).`; } } catch (e) { console.warn('api: context', e); } }
    return dsc;
  }
  async function findPlaces(q, limit = 10) {
    await extras; const out = findCore(I, q, limit).map(({ name, kind, lon, lat, id }) => ({ name, kind, lon, lat, id }));
    if (GL() && out.length < limit) { await GL().gazetteer(); for (const w of await GL().searchAll(q, limit - out.length)) out.push({ name: w.name, kind: w.kind, lon: w.lon, lat: w.lat, id: w.id, country: w.country || undefined, region: w.region || undefined, local_name: w.local_name }); }
    return out; }

  // ---------- the tools (one list: window.docklands.tools, WebMCP, and the MCP server's page_call)
  const P = (type, description, extra = {}) => ({ type, description, ...extra });
  const TOOLS = [
    { name: 'go_to', description: 'Move the 3D view to a place (a name such as "Greenland Dock", "One Canada Square", "Tokyo" or "France"), a named view (list_views), or a WGS84 point anywhere on Earth (outside the Docklands model or above 36 km the globe shows it). Returns the new view.', readOnly: false,
      inputSchema: { type: 'object', properties: { place: P('string', 'A place or building name, or a view id'), view: P('string', 'A named view id', { enum: Object.keys(H.VIEWS) }), lon: P('number', 'Longitude, WGS84 degrees'), lat: P('number', 'Latitude, WGS84 degrees'), range_m: P('number', 'Distance from the eye to the point, metres'), alt_m: P('number', 'Eye height above the point, metres (used when range_m is absent); up to 40,000 km on the globe'), heading_deg: P('number', 'View direction, degrees clockwise from true north'), pitch_deg: P('number', 'Look-down angle, degrees (2 to 89.5)') } },
      run: a => a.view ? goTo({ view: a.view }) : a.place ? goTo(a.place, a) : goTo(a) },
    { name: 'get_view', description: 'The current view: eye and target (lon, lat, height in metres), true heading, pitch, field of view, range, page time and time zone, sun, and the share link.', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: () => getView() },
    { name: 'describe_view', description: 'Describe what is in view: a short paragraph (text) and structured lists of the tallest buildings, named places, water and parks with distance and direction, the time of day, sun, weather, aircraft and ships in view, and the share link. On the globe: the country, region, sea and nearest places at the centre, the countries, water and large places in view.', readOnly: true,
      inputSchema: { type: 'object', properties: { maxItems: P('number', 'Places named in the paragraph (default 8)') } }, run: a => describeView(a) },
    { name: 'features_at', description: 'What is at a WGS84 point (or at the centre of the view when lon and lat are absent): the building (name, OpenStreetMap id, height, registry record and occupants where known), water, park, ground height and the nearest named places.', readOnly: true,
      inputSchema: { type: 'object', properties: { lon: P('number', 'Longitude, WGS84 degrees'), lat: P('number', 'Latitude, WGS84 degrees') } }, run: a => featuresAt(a.lon, a.lat) },
    { name: 'set_time', description: 'Set the page clock (sun, sky, night lights, tide, recorded aircraft and ships). ISO 8601 with Z or an offset; a time without an offset is the wall-clock time of the place; "now" for live.', readOnly: false,
      inputSchema: { type: 'object', properties: { time: P('string', 'e.g. 2026-10-11T21:30 or 2026-10-11T20:30Z or now') }, required: ['time'] }, run: a => setTime(a.time) },
    { name: 'list_layers', description: 'The layers and display settings with their ids and on/off state.', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: () => listLayers() },
    { name: 'set_layer', description: 'Turn a layer or display setting on or off (ids from list_layers).', readOnly: false,
      inputSchema: { type: 'object', properties: { id: P('string', 'Layer id'), on: P('boolean', 'true for on') }, required: ['id', 'on'] }, run: a => setLayer(a.id, a.on) },
    { name: 'find_places', description: 'Search the named places, water and buildings of the model, then the world (countries, regions, seas, lakes, rivers, cities) by name; returns names, kinds and WGS84 positions.', readOnly: true,
      inputSchema: { type: 'object', properties: { query: P('string', 'Two or more letters'), limit: P('number', 'At most this many (default 10)') }, required: ['query'] }, run: a => findPlaces(a.query, a.limit || 10) },
    { name: 'list_views', description: 'The named views (Canary Wharf, Greenwich, the photo views ...) with their ids for go_to.', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: () => listViews() },
    { name: 'share_link', description: 'A link that opens this page at the current view, time and selected building.', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: () => ({ url: shareLink() }) },
  ];
  async function callTool(name, args) { const t = TOOLS.find(x => x.name === name); if (!t) throw new Error('unknown tool ' + name); return t.run(args || {}); }

  // ---------- WebMCP (W3C Web Machine Learning CG explainer, https://github.com/webmachinelearning/webmcp): the explainer of
  // October 2026 has document.modelContext.registerTool(tool, { signal }); earlier drafts and the MCP-B polyfill have
  // navigator.modelContext with registerTool or provideContext({ tools }). Feature-detected; nothing happens without it.
  const webmcp = { api: null, registered: [], errors: [] };
  function registerWebMCP() {
    const mc = (typeof document !== 'undefined' && document.modelContext) || navigator.modelContext; if (!mc) return;
    webmcp.api = document.modelContext ? 'document.modelContext' : 'navigator.modelContext';
    const tools = TOOLS.map(t => ({ name: t.name, description: t.description + ' (Docklands 3D page API ' + API_VERSION + ')', inputSchema: t.inputSchema, annotations: { readOnlyHint: t.readOnly, title: t.name.replace(/_/g, ' ') },
      execute: async input => { try { const r = await t.run(input || {}); return { content: [{ type: 'text', text: JSON.stringify(r) }], structuredContent: Array.isArray(r) ? { items: r } : r }; } catch (e) { return { content: [{ type: 'text', text: 'Error: ' + (e && e.message || e) }], isError: true }; } } }));
    webmcp.controller = typeof AbortController === 'function' ? new AbortController() : null;
    try {
      if (typeof mc.registerTool === 'function') for (const t of tools) { try { const r = mc.registerTool(t, webmcp.controller ? { signal: webmcp.controller.signal } : undefined); if (r && typeof r.catch === 'function') r.catch(e => webmcp.errors.push(t.name + ': ' + e)); webmcp.registered.push(t.name); } catch (e) { webmcp.errors.push(t.name + ': ' + e); } }
      else if (typeof mc.provideContext === 'function') { mc.provideContext({ tools }); webmcp.registered = tools.map(t => t.name); }
    } catch (e) { webmcp.errors.push(String(e)); }
  }
  registerWebMCP();

  // ---------- the spoken view: a polite live region, spoken when the view or clock has settled (1.5 s), when the switch is on
  const css = document.createElement('style');
  css.textContent = `.srOnly{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important}
#view canvas:focus-visible{outline:3px solid var(--acc);outline-offset:-3px}`;
  document.head.appendChild(css);
  const live = document.createElement('div'); live.id = 'a11yLive'; live.className = 'srOnly'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true'); document.body.appendChild(live);
  const spoken = []; let sayTimer = 0;
  function speak(text) { clearTimeout(sayTimer); live.textContent = ''; sayTimer = setTimeout(() => { live.textContent = text; spoken.push({ t: Date.now(), text }); if (spoken.length > 20) spoken.shift(); }, 60); }
  let describeOn = qs.has('describe') ? !/^(0|false|off|no)$/i.test(qs.get('describe')) : store.get('d3.describe') === '1';
  const SETTLE_MS = 1500; let sig = '', stableAt = 0, lastSaid = '';
  async function sayView(force) { try { const d = await describeView({ maxItems: 4 }); if (force || d.text !== lastSaid) { lastSaid = d.text; speak(d.text); } dispatchEvent(new CustomEvent('docklands-view-described', { detail: d })); } catch (e) { console.warn('api: describe', e); } }
  setInterval(() => {
    const c = H.camState(), k = [c.tx, c.tz, c.ty, c.dist, c.yaw * 100, c.pitch * 100].map(v => Math.round(v)).join() + '|' + Math.floor(H.clock / 60000);
    if (k !== sig) { sig = k; stableAt = performance.now(); return; }
    if (stableAt && performance.now() - stableAt > SETTLE_MS) { stableAt = 0; dispatchEvent(new CustomEvent('docklands-view-settled')); if (describeOn) sayView(false); }
  }, 250);

  // ---------- Menu > Views > Access: the switch, Describe now, Text view; the map canvas as a keyboard target
  const pane = $('paneViews'), anchor = $('shareMore');
  if (pane) {
    const box = document.createElement('div'); box.id = 'accessBox';
    box.innerHTML = `<h3 id="accessH">Access</h3><label class="row"><input type="checkbox" id="describeChk"> Describe the view (screen reader)</label>
<div class="btnrow"><button type="button" id="sayBtn">Describe now</button><button type="button" id="textBtn">Text view</button></div>
<p class="small">Keys: Tab to the map, then the arrow keys move, + and − zoom, V describes the view, T opens the text view, Escape closes the menu. Scripts and agents: <code>window.docklands</code> (page API ${API_VERSION}), WebMCP tools where the browser has them, and <a href="../llms.txt">llms.txt</a>.</p>`;
    if (anchor && anchor.parentNode === pane) anchor.after(box); else pane.prepend(box);
    const chk = $('describeChk'); chk.checked = describeOn;
    chk.onchange = () => { describeOn = chk.checked; store.set('d3.describe', describeOn ? '1' : '0'); if (describeOn) sayView(true); else speak('View descriptions off.'); };
    $('sayBtn').onclick = () => sayView(true);
    $('textBtn').onclick = () => openText();
  }
  const cv = H.renderer.domElement;
  cv.tabIndex = 0; cv.setAttribute('role', 'application'); cv.setAttribute('aria-roledescription', '3D map');
  cv.setAttribute('aria-label', 'Docklands 3D view. Arrow keys move, plus and minus zoom, V describes the view, T opens the text view. Menu: the button after this map.');
  const openText = () => import('./textview.js').then(m => m.openTextView()).catch(e => console.warn('textview', e));
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof Element && e.target.closest('input,select,textarea,[contenteditable],#textView'))) return;
    if (e.key === 'v' || e.key === 'V') { e.preventDefault(); sayView(true); }
    else if (e.key === 't' || e.key === 'T') { e.preventDefault(); openText(); }
  });
  // a record card that opens (a tap, a search, goTo a building) is spoken when the switch is on
  const card = $('card');
  if (card) { card.setAttribute('role', 'region'); card.setAttribute('aria-label', 'Record'); $('cardX')?.setAttribute('aria-label', 'Close the record');
    let lastCard = '';
    new MutationObserver(() => { if (card.hidden) { lastCard = ''; return; } if (!describeOn) return; const h = card.querySelector('h2'), t = 'Record: ' + card.querySelector('#cardBody').innerText.replace(/\s+/g, ' ').slice(0, 400); if (h && !/Loading/.test(card.textContent) && t !== lastCard) { lastCard = t; speak(t); } })
      .observe(card, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true }); }

  // ---------- the API object
  const api = {
    version: API_VERSION, describeVersion: DESCRIBE_VERSION, locale: { adapter: adapter.id, timeZone: TZ, heightDatum: adapter.heightDatum, bbox: adapter.bbox },
    goTo, getView, setTime, listLayers, setLayer, featuresAt, describeView, findPlaces, listViews, shareLink,
    tools: TOOLS.map(({ name, description, inputSchema, readOnly }) => ({ name, description, inputSchema, readOnly })), callTool,
    webmcp, speak, get describing() { return describeOn; }, set describing(v) { const c = $('describeChk'); if (c) { c.checked = !!v; c.onchange(); } else describeOn = !!v; },
    spoken, openTextView: openText, ready: extras.then(() => true),
    // frame times (perf.js, all styles; OKR KR3.1): median and 95th percentile over the last 2 s, frames a second, the style
    // and its tier (Painted: full, lite or low, auto or fixed, moving or still, the auto tier's last steps), and a sentence
    perf() { const P = H.perf; if (!P) return null; const s = P.stats(), St = globalThis.__docklandsStyles;
      if (St && St.mode === 'paint') s.paint = { tier: St.paintTier, mode: St.paintMode, moving: St.paintMoving, steps: St.paint.log.slice(-5) };
      return s; },
    help: 'Docklands 3D page API: https://github.com/danbri/londat/blob/main/docklands/README.md#page-api',
  };
  globalThis.docklands = api;
  dispatchEvent(new CustomEvent('docklands-api-ready', { detail: { version: API_VERSION } }));

  // ---------- locale-free deep links: ?ll=lat,lon[,range_m] and ?place=<name> (after the share hash and ?view= of main.js)
  const ll = (qs.get('ll') || '').split(',').map(Number);
  // ?ll=lat,lon[,alt]: alt is the eye's height above the point in metres (the globe above 36 km or outside the model);
  // &ht=heading,tilt (degrees; tilt from straight down) on the globe
  const ht = (qs.get('ht') || '').split(',').map(Number);
  if (ll.length >= 2 && ll.slice(0, 2).every(isFinite)) goTo({ lat: ll[0], lon: ll[1], alt_m: ll[2] || undefined, heading_deg: isFinite(ht[0]) ? ht[0] : undefined, tilt_deg: isFinite(ht[1]) && ht.length > 1 ? ht[1] : undefined }).catch(e => console.warn('api: ?ll=', e.message));
  else if (qs.get('place')) goTo(qs.get('place')).catch(e => console.warn('api: ?place=', e.message));
  return api;
}
