// The menu of the Three.js port (docklands/): the drawer with six tabs (Views, Look, Layers, Go, Time, About), the layer
// controls API (ctx.ui) with a place for each control, and the corner credit. Owner, 2026-10-09: "Ensure all functionality
// we had in original menus is available but through more intuitive structure." Where each control went: the "Menu map" in
// docklands/README.md. Skill: docklands-3d-page, "Three.js port".
// The drawer is open while it has no `hidden` attribute (layers/search.js, kml.js and drone.js close it that way).
const $ = id => document.getElementById(id);
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* no storage */ } } };

// ---------- ctx.ui: a control goes to the current place ('look', 'go', 'time', 'about', 'layers/<group>'); loadLayers
// sets the place of each layer before its init. ui.tab(place) switches (returns the previous place); every method also
// takes an optional last argument { tab: place } for one control.
export const GROUPS = ['city', 'below', 'water', 'live', 'sim', 'overlays', 'kml'];
export function makeUi(draw) {
  let place = 'layers/city';
  const hostOf = p => { const [pane, g] = String(p || '').split('/');
    if (pane === 'layers') return document.querySelector(`#paneLayers .grp[data-g="${GROUPS.includes(g) ? g : 'city'}"] .gb`);
    return $('ext-' + pane) || hostOf('layers/city'); };
  const H = o => o && o.tab ? hostOf(o.tab) : ui.host();
  const ui = {
    get place() { return place; },
    tab(p) { const prev = place; if (p) place = p; return prev; },
    host: () => hostOf(place),
    section(title, p) { if (typeof p === 'string') place = p; const h = document.createElement('h3'); h.textContent = title; ui.host().appendChild(h); return h; },
    toggle(label, on, cb, o) { const l = document.createElement('label'); l.className = 'row'; const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!on; i.onchange = () => { cb(i.checked); draw(); }; l.append(i, ' ' + label); H(o).appendChild(l); return i; },
    slider(label, min, max, step, value, cb, o) { const l = document.createElement('label'); l.className = 'row'; l.style.flexWrap = 'wrap'; const t = document.createElement('span'); t.textContent = label; t.style.width = '100%'; const i = document.createElement('input'); i.type = 'range'; Object.assign(i, { min, max, step, value }); i.oninput = () => { cb(+i.value, t); draw(); }; l.append(t, i); H(o).appendChild(l); return { input: i, label: t }; },
    note(html, o) { const p = document.createElement('p'); p.className = 'small'; p.innerHTML = html; H(o).appendChild(p); return p; },
  };
  return ui;
}

// ---------- the drawer
export function initMenu(M) {   // M: { setView, layers: () => LAYERS }
  const drawer = $('drawer'), scrim = $('scrim'), tabs = [...document.querySelectorAll('#dtabs [data-pane]')];
  const wide = () => innerWidth >= 900;
  const isOpen = () => !drawer.hidden;
  // body.drawerOpen: on a wide screen (map not dimmed) the time wheels (carousel.js) move to the right of the drawer
  const sync = () => { const on = isOpen(); scrim.hidden = !on || wide() || OFF < 0; $('menu').setAttribute('aria-expanded', String(on)); document.body.classList.toggle('drawerOpen', on); };
  new MutationObserver(sync).observe(drawer, { attributes: true, attributeFilter: ['hidden'] });
  addEventListener('resize', sync);
  // slid in by any amount (owner, 2026-10-09: "allow those menus to be slid in by any amount, and to be toggled closed by
  // tapping their header too. Give some more translucency too when they are only partially open"): OFF is the offset in
  // px (0 = fully open, negative = slid out to the left); the drawer keeps it after a drag; the less it shows, the more
  // translucent it is (and the map is not dimmed). Closing or opening by a button resets it to fully open.
  let OFF = 0;
  const dw = () => drawer.getBoundingClientRect().width || 400;
  function setOff(v) {
    OFF = Math.max(-(dw() - 56), Math.min(0, v)); const f = 1 + OFF / dw();
    drawer.style.transform = OFF ? `translateX(${OFF}px)` : '';
    drawer.style.background = OFF ? `rgba(16,20,24,${(.35 + .6 * f * f).toFixed(3)})` : '';
    drawer.style.backdropFilter = drawer.style.webkitBackdropFilter = OFF ? 'blur(3px)' : '';
    scrim.hidden = !isOpen() || wide() || OFF < 0;   // a menu slid out by any amount leaves the map free to use
    document.body.style.setProperty('--dwv', Math.round(dw() + OFF) + 'px');
  }
  function open(on) { drawer.hidden = !on; if (on || OFF) setOff(0); sync(); }
  let pane = store.get('d3.pane') || 'paneViews'; if (!$(pane)) pane = 'paneViews';
  function openPane(id) {
    pane = id; store.set('d3.pane', id);
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.pane === id)));
    document.querySelectorAll('#drawer .pane').forEach(p => p.classList.toggle('on', p.id === id));
    $('drawerBody').scrollTop = 0; open(true);
  }
  tabs.forEach(t => t.onclick = () => openPane(t.dataset.pane));
  $('menu').onclick = () => isOpen() ? open(false) : openPane(pane);
  $('drawerX').onclick = scrim.onclick = () => open(false);
  addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) open(false); });
  // drag sideways (not from a field or a slider) to slide it by any amount; let go with less than 15 % showing: closed;
  // a quick flick: all the way. A tap on the header (not its buttons or the search box): closed.
  { let x0 = null, y0 = 0, o0 = 0, t0 = 0, moved = false;
    drawer.addEventListener('pointerdown', e => { if (!e.isPrimary || (e.pointerType === 'mouse' && !e.target.closest('#dHead')) || e.target.closest('input,select,textarea')) { x0 = null; return; } x0 = e.clientX; y0 = e.clientY; o0 = OFF; t0 = performance.now(); moved = false; });
    drawer.addEventListener('pointermove', e => { if (x0 == null) return; const dx = e.clientX - x0; if (!moved && Math.abs(e.clientY - y0) > 30 && Math.abs(dx) < 20) { x0 = null; return; } if (moved || Math.abs(dx) > 12) { moved = true; drawer.classList.add('drag'); setOff(o0 + dx); } });
    const up = e => { if (x0 == null) return; const v = (e.clientX - x0) / Math.max(1, performance.now() - t0); x0 = null; drawer.classList.remove('drag'); if (!moved) return;
      if (v < -1.2 || 1 + OFF / dw() < .15) open(false); else if (v > 1.2) setOff(0); };
    drawer.addEventListener('pointerup', up); drawer.addEventListener('pointercancel', up);
    $('dHead').addEventListener('click', e => { if (moved || e.target.closest('button,input,a')) return; open(false); });
    $('dHead').style.cursor = 'pointer'; $('dHead').title = 'Tap to close; drag sideways to slide the menu';
    // a tap on a tab of a slid-out menu brings it fully back
    tabs.forEach(t => t.addEventListener('click', () => { if (OFF) setOff(0); })); }
  // a view button closes the drawer on a phone, so the view shows
  drawer.addEventListener('click', e => { if (e.target.closest('[data-view]') && !wide()) open(false); });
  openPane(pane); open(false);
  drawer.addEventListener('click', e => { const p = e.target.closest('p.small'); if (p && !e.target.closest('a') && (p.classList.contains('clamp') || p.dataset.clamp)) { p.dataset.clamp = '1'; p.classList.toggle('clamp'); } });

  // ---------- credits: the corner line folds to (i) after 5 s or at the first touch or wheel on the map
  function openCredits() { openPane('paneAbout'); requestAnimationFrame(() => $('credits').scrollIntoView({ block: 'start' })); }
  { const line = $('credit'), btn = $('attribI'); let t = 0;
    const fold = () => { if (line.classList.contains('off')) return; clearTimeout(t); line.classList.add('off'); line.setAttribute('aria-hidden', 'true'); btn.hidden = false; };
    M.creditsStart = () => { clearTimeout(t); t = setTimeout(fold, 5000); };
    $('view').addEventListener('pointerdown', fold); $('view').addEventListener('wheel', fold, { passive: true });
    btn.onclick = openCredits;
    document.querySelectorAll('[data-credits]').forEach(a => a.onclick = e => { e.preventDefault(); openCredits(); }); }

  // ---------- Look > Style: the same choice as the selector at the top right (styles.js #styleSel)
  { const px = $('styleProxy');
    const hook = () => { const s = $('styleSel'); if (!s) return false;
      px.innerHTML = s.innerHTML; px.value = s.value;
      px.onchange = () => { s.value = px.value; s.dispatchEvent(new Event('change')); };
      s.addEventListener('change', () => { px.value = s.value; }); return true; };
    if (!hook()) { const mo = new MutationObserver(() => { if (hook()) mo.disconnect(); }); mo.observe(document.body, { childList: true }); setTimeout(() => mo.disconnect(), 60000); } }

  // ---------- Go: proxies for the round buttons of the layers, and the route finder (layers/routes.js api)
  const L = id => { const l = M.layers()[id]; return l && l.api; };
  const clickIf = (id, close = true) => { const b = $(id); if (!b) return false; if (close && !wide()) open(false); b.click(); return true; };
  $('goSearch').onclick = () => clickIf('findBtn', false);   // the search box is at the top of this menu
  $('goLocate').onclick = () => clickIf('locBtn');
  $('goXr').onclick = () => clickIf('xrBtn');
  const out = $('rOut');
  let placesLoaded = false;
  const loadPlaces = async () => { if (placesLoaded) return; const R = L('routes'); if (!R) return; try { const N = await R.loadNet(); placesLoaded = true; const dl = $('rPlaces'); dl.innerHTML = ''; const seen = new Set();
    for (const p of N.P) { if (seen.has(p.label)) continue; seen.add(p.label); const o = document.createElement('option'); o.value = p.label; dl.appendChild(o); } } catch (e) { out.textContent = 'The walking network did not load: ' + e.message; } };
  $('rFrom').addEventListener('focus', loadPlaces); $('rTo').addEventListener('focus', loadPlaces);
  $('rSwap').onclick = () => { const a = $('rFrom').value; $('rFrom').value = $('rTo').value; $('rTo').value = a; };
  $('rClear').onclick = () => { $('rFrom').value = $('rTo').value = ''; const R = L('routes'); if (R) R.clear(); out.textContent = 'Route cleared.'; };
  $('rGo').onclick = async () => {
    const R = L('routes'); if (!R) { out.textContent = 'The route layer did not load.'; return; }
    const a = $('rFrom').value.trim(), b = $('rTo').value.trim(); if (!a || !b) { out.textContent = 'Type or pick a start and an end.'; return; }
    out.textContent = 'Finding the route…';
    let r = null; try { r = await R.route(a, b, { stepFree: $('rStepFree').checked }); } catch (e) { out.textContent = e.message; return; }
    if (!r) { out.textContent = `No place found for "${!R.NET || !R.NET.P.some(p => p.label === a || p.name.toLowerCase().includes(a.toLowerCase())) ? a : b}". Pick one from the list.`; return; }
    out.textContent = r.metres != null ? `${r.metres} m, about ${r.minutes} min. The steps are in the panel on the map.` : 'No route on the mapped network.';
    if (!wide()) open(false);
  };

  // after the layers have loaded: hide what is missing, and empty groups
  M.finish = () => {
    // long layer notes: two lines until tapped (a tap on a link inside still follows it)
    for (const p of document.querySelectorAll('#drawer .gb p.small, #drawer .ext p.small')) if (p.textContent.length > 160 && !p.querySelector('br') && !p.closest('#credits')) p.classList.add('clamp');   // not a status note with lines
    $('goSearch').hidden = !$('findBtn'); $('goLocate').hidden = !$('locBtn');
    const xr = $('xrBtn'); $('goXr').disabled = !xr; $('goXr').title = xr ? 'Open the headset menu' : 'This browser has no WebXR';
    if (!L('routes')) { for (const id of ['rGo', 'rSwap', 'rClear', 'rFrom', 'rTo']) $(id).disabled = true; out.textContent = 'The route layer is not loaded.'; }
    for (const g of document.querySelectorAll('#paneLayers .grp')) { const gb = g.querySelector('.gb'); g.hidden = ![...gb.children].some(c => c.tagName !== 'P'); }
  };
  return Object.assign(M, { open, openPane, openCredits, isOpen });
}
