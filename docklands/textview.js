// The text view of the Three.js port (docklands/): a plain HTML section that says what is in view and lists the places
// with links, for screen readers, keyboards, text browsers in effect, and devices with neither WebGPU nor WebGL 2 (OKR
// KR3.2 first step, KR3.3). Opens with ?text=1, Menu > Views > Access > Text view, the key T, and by itself when main.js
// cannot start a renderer (event docklands-no3d). Without the 3D page it works from the data alone: area.js (a classic
// script of index.html), describe.js and the camera of the link (?ll=lat,lon[,alt], ?view=, the share hash #v=1&c=).
// With the 3D page it asks window.docklands (api.js), so the live counts and the page clock are included, and a link
// moves the 3D view (goTo) and refreshes the description. Skill: docklands-3d-page, "page API, WebMCP and non-visual access".
import { makeIndex, describeView, findPlaces, distText, parseTime } from './describe.js';
import { ukAdapter } from './adapters/uk.js';
import { VIEWS, VIEW_LABELS } from './views.js';

const qs = new URLSearchParams(location.search), D = Math.PI / 180;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let I = null, NO3D = false, sec = null, lastFocus = null;
const A = () => globalThis.DOCKLANDS_AREA;
const index = () => I || (I = makeIndex(A(), { adapter: ukAdapter(A()), under: globalThis.DOCKLANDS_UNDER || null }));
const api = () => globalThis.docklands;

const CSS = `#textView{position:fixed;inset:0;z-index:30;overflow:auto;background:var(--bg,#0f1215);color:var(--fg,#e8ecef);padding:16px max(16px,env(safe-area-inset-left)) 40px;font:16px/1.5 system-ui,sans-serif;-webkit-user-select:text;user-select:text}
#textView[hidden]{display:none}#textView .tvw{max-width:760px;margin:0 auto}#textView h1{font-size:22px;margin:4px 0 8px}#textView h2{font-size:18px;margin:22px 0 6px}
#textView a{color:var(--acc,#2cc3b5)}#textView button,#textView input{font:inherit;min-height:44px;border-radius:8px;border:1px solid #33404a;background:#1b2229;color:inherit;padding:6px 12px}
#textView input{width:100%}#textView ul{padding-left:20px}#textView li{margin:4px 0}#textView .note{color:var(--mut,#9aa4ad);font-size:14px}#textView details summary{cursor:pointer;min-height:36px}`;

// the camera of the link when there is no 3D page: ?ll=, the share hash c=, ?view=, else Canary Wharf
function linkCamera() {
  const ad = index().adapter, asp = innerWidth / Math.max(1, innerHeight), h = {}; for (const p of location.hash.replace(/^#/, '').split('&')) { const i = p.indexOf('='); if (i > 0) try { h[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1)); } catch { /* bad escape */ } }
  const qs = new URLSearchParams(location.search);   // read again: the 2D map (no3d.js) moves the view by rewriting the address
  let c = null; const ll = (qs.get('ll') || '').split(',').map(Number), hc = (h.c || '').split(',').map(Number);
  if (ll.length >= 2 && ll.slice(0, 2).every(isFinite)) { const [x, z] = ad.fromLonLat(ll[1], ll[0]); c = { tx: x, tz: z, ty: index().ground(x, z), dist: ll[2] ? ll[2] / Math.sin(0.5) : 900, yaw: 0.7, pitch: 0.5 }; }   // ll[2]: the eye's height above the point (m)
  else if (hc.length >= 6 && hc.every(isFinite)) c = { tx: hc[0], tz: hc[1], ty: hc[2], dist: hc[3], yaw: hc[4], pitch: hc[5], hfov: /^h[\d.]+$/.test(h.f || '') ? +h.f.slice(1) : null };
  else c = VIEWS[qs.get('view')] || VIEWS[h.vw] || VIEWS.cw;
  const ce = Math.cos(c.pitch), eye = [c.tx + c.dist * Math.sin(c.yaw) * ce, (c.ty || 0) + c.dist * Math.sin(c.pitch), c.tz + c.dist * Math.cos(c.yaw) * ce];
  const fovY = c.hfov ? 2 * Math.atan(Math.tan(c.hfov / 2) / asp) : 45.8 * D;
  return { cam: { eye, target: [c.tx, c.ty || 0, c.tz], fovY, aspect: asp, yaw: c.yaw }, time: h.t || new URLSearchParams(location.search).get('t'), c: { ...c, ty: c.ty || 0 } };
}
function sunAt(t, lon, lat) {   // astronomy-engine (loaded by index.html as a classic script)
  const AE = globalThis.Astronomy; if (!AE) return null;
  try { const d = new Date(t), o = new AE.Observer(lat, lon, 10), e = AE.Equator('Sun', d, o, true, true), hz = AE.Horizon(d, o, e.ra, e.dec, 'normal'); return { alt: hz.altitude, az: hz.azimuth }; } catch { return null; }
}
async function current() {
  if (api() && !NO3D) return api().describeView();
  const { cam, time } = linkCamera(), ad = index().adapter, t = time ? parseTime(time, ad.timeZone) : Date.now(), [lon, lat] = ad.toLonLat(cam.target[0], cam.target[2]);
  return describeView(index(), cam, { time: isFinite(t) ? t : Date.now(), sun: sunAt(isFinite(t) ? t : Date.now(), lon, lat), share: location.href, view: new URLSearchParams(location.search).get('view') || null });
}
const href = (p, range) => `?ll=${p.lat.toFixed(6)},${p.lon.toFixed(6)}${range ? ',' + range : ''}${NO3D ? '&text=1' : ''}`;
const placeLink = (p, range) => `<a href="${href(p, range)}" data-lat="${p.lat}" data-lon="${p.lon}" data-range="${range || ''}">${esc(p.name)}</a>`;
const li = (r, extra = '') => `<li>${placeLink(r, 700)}${extra}, ${distText(r.distance_m)} ${esc(r.side)} (${esc(r.direction)})</li>`;

async function render() {
  const d = await current(), ix = index(), live = api() && !NO3D;
  const iv = d.in_view;
  const kinds = new Map(); for (const p of ix.places) { if (!kinds.has(p.kind)) kinds.set(p.kind, []); kinds.get(p.kind).push(p); }
  const ad = ix.adapter, ll = p => { const [lon, lat] = ad.toLonLat(p.x, p.z); return { name: p.name, lon, lat }; };
  sec.querySelector('.tvw').innerHTML = `
<h1 id="tvH">Docklands: text view</h1>
<p class="note">${NO3D ? esc(no3dWhy()) + ' This page works from the data alone: the 2D map, this text and the page API (window.docklands). ' : ''}A plain list of what is in view and of the places in the model, London Bridge to Cody Dock. Links move the view.</p>
<p>${live ? '<button type="button" id="tvClose">Back to the 3D view</button> ' : ''}<a href="${esc(d.share || location.href)}">Link to this view</a> · <a href="../llms.txt">For machines: llms.txt</a></p>
<h2 id="tvNow">What is in view</h2>
<p id="tvText" aria-live="polite">${esc(d.text)}</p>
<p class="note">Eye ${d.eye.lat.toFixed(5)}, ${d.eye.lon.toFixed(5)}, ${Math.round(d.eye.height_m)} m (${esc(d.height_datum)}); looking ${esc(d.heading_name)} (${Math.round(d.heading_deg)}°), ${Math.round(-d.pitch_deg)}° down; field ${Math.round(d.fov_deg.horizontal)}° across.</p>
${iv.buildings.some(b => b.name) ? `<h3>Tallest buildings in view</h3><ul>${iv.buildings.filter(b => b.name).slice(0, 10).map(b => li(b, `, ${Math.round(b.height_m)} m tall`)).join('')}</ul>` : ''}
${iv.places.length ? `<h3>Places in view</h3><ul>${iv.places.slice(0, 20).map(r => li(r, ` (${esc(r.kind)})`)).join('')}</ul>` : ''}
${iv.water.length ? `<h3>Water in view</h3><ul>${iv.water.map(r => li(r)).join('')}</ul>` : ''}
${iv.parks.length ? `<h3>Parks in view</h3><ul>${iv.parks.map(r => li(r)).join('')}</ul>` : ''}
<h2>Find a place</h2>
<label for="tvFind">Name of a place, building, station or dock</label><input id="tvFind" type="search" autocomplete="off"><ul id="tvRes" aria-live="polite"></ul>
<h2>Views</h2>
<ul>${Object.keys(VIEWS).map(k => `<li><a href="?view=${k}${NO3D ? '&text=1' : ''}" data-view="${k}">${esc(VIEW_LABELS[k] || k)}</a></li>`).join('')}</ul>
<h2>All places, by kind</h2>
${[...kinds].sort((a, b) => b[1].length - a[1].length).map(([k, L]) => `<details><summary>${esc(k)} (${L.length})</summary><ul>${L.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => `<li>${placeLink(ll(p), 700)}</li>`).join('')}</ul></details>`).join('')}
<p class="note">Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> (ODbL); names and facts from Wikidata (CC0); ground and heights from Environment Agency LiDAR (OGL v3.0). Every source: <a href="https://github.com/danbri/londat/blob/main/cwplans/DATA-REGISTER.md">data register</a>.</p>`;
  const close = sec.querySelector('#tvClose'); if (close) close.onclick = closeTextView;
  const q = sec.querySelector('#tvFind'), res = sec.querySelector('#tvRes');
  q.oninput = () => { const L = q.value.trim().length < 2 ? [] : findPlaces(ix, q.value, 12); res.innerHTML = L.map(p => `<li>${placeLink(p, p.kind === 'building' ? 600 : 900)} (${esc(p.kind)})</li>`).join(''); };
  sec.dataset.ready = '1'; return d;
}
// with the 3D page a link moves the view (goTo) and the description is refreshed in place
function onClick(e) {
  const a = e.target.closest('a[data-lat],a[data-view]'); if (!a || !api() || (NO3D && !api().no3d)) return; e.preventDefault();   // without 3D: the data-only API of no3d.js
  const go = a.dataset.view ? api().goTo(a.dataset.view) : api().goTo({ lat: +a.dataset.lat, lon: +a.dataset.lon, range_m: +a.dataset.range || undefined });
  go.then(() => NO3D ? null : render()).then(() => sec.querySelector('#tvNow')?.focus()).catch(err => { sec.querySelector('#tvText').textContent = err.message; });
}
export async function openTextView() {
  if (!A()) return;
  if (!sec) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    sec = document.createElement('section'); sec.id = 'textView'; sec.setAttribute('aria-labelledby', 'tvH'); sec.tabIndex = -1; sec.innerHTML = '<div class="tvw"><h1 id="tvH">Docklands: text view</h1><p>Loading…</p></div>';
    document.body.appendChild(sec); sec.addEventListener('click', onClick);
    sec.addEventListener('keydown', e => { if (e.key === 'Escape' && api() && !NO3D) { e.stopPropagation(); closeTextView(); } });
  }
  lastFocus = document.activeElement; sec.hidden = false;
  if (!$d('drawer')?.hidden && api() && !NO3D) $d('drawerX')?.click();
  await render(); sec.querySelector('h1').tabIndex = -1; sec.querySelector('#tvNow').tabIndex = -1; sec.querySelector('h1').focus();
}
const $d = id => document.getElementById(id);
export function closeTextView() { if (!sec) return; sec.hidden = true; (lastFocus && lastFocus.isConnected ? lastFocus : $d('menu'))?.focus(); }
export const textViewState = () => ({ open: !!sec && !sec.hidden, ready: !!sec && sec.dataset.ready === '1', no3d: NO3D });
globalThis.__docklandsText = { open: openTextView, close: closeTextView, state: textViewState };

export const refreshTextView = () => sec && !sec.hidden ? render() : Promise.resolve(null);
const no3dWhy = () => (globalThis.__docklandsNo3d && globalThis.__docklandsNo3d.error) || 'This browser shows no 3D view (it has neither WebGPU nor WebGL 2).';
// no 3D: the text view, then the 2D map and the data-only page API (no3d.js; OKR KR3.2)
async function startNo3d() {
  if (NO3D) return; NO3D = true;
  const boot = document.getElementById('boot'); if (boot) { boot.hidden = true; boot.style.display = 'none'; }   // "Starting the 3D view..." (index.html) would cover the page
  await openTextView();
  try { (await import('./no3d.js')).initNo3d({ index, linkCamera, section: sec, refresh: refreshTextView }); }
  catch (e) { console.warn('no3d', e); }
}
globalThis.__docklandsText.no3d = startNo3d;

// start: ?text=1, or no renderer (the event, or the flag main.js set before this module ran)
addEventListener('docklands-no3d', startNo3d);
if (globalThis.__docklandsNo3d) startNo3d();
else if (/^(1|true|on|yes)$/i.test(qs.get('text') || '')) {
  if (globalThis.docklands) openTextView();
  else { let done = false; const go = () => { if (!done) { done = true; openTextView(); } };
    addEventListener('docklands-api-ready', go); setTimeout(go, 1500); }   // the text first; it refreshes from the page API on the next open
}
