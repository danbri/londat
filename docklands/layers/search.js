// Search (layer "search", no menu entry) of the Three.js port: the search box at the top of the menu (since 2026-10-09;
// before, a round Search button at the top left, now the Labels button) and its results. The WebGL page's rules (index.html searchItems): two characters or more; buildings with
// registry records (layers/registry.js), labelled places (area.js places, stations and places of under.js, named docks
// and basins, published levels), and every routable place of the walking network (../cwplans/docklands/data/indoor.js,
// loaded when the box gets focus); prefix matches first; at most 14; Enter takes the first. A result flies the camera
// there (600 ms) and opens its card; a place below ground also cuts the model away above its level (under.js setCut).
// Skill: docklands-3d-page, "Interface" and "Three.js port".
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(src + ' did not load')); document.head.appendChild(s); });
const OSM = /^(node|way|relation)\/\d+$/;

export default {
  id: 'search', label: null,
  async init(ctx) {
    const { THREE, A, camera, controls, esc, dec, groundAt, draw } = ctx;
    const D3 = () => globalThis.__docklands3, under = () => D3()?.layers?.under?.api;

    // ---------- the button and the box (built here; index.html is not changed)
    const css = document.createElement('style');
    css.textContent = `#labelsBtn{left:114px;font-size:19px}#findBtn{display:none}#hud{left:168px!important}
#findBox{flex:none;padding:2px 10px 8px;position:relative}
#findBox input{width:100%;height:44px;padding:0 12px;border-radius:10px;border:1px solid #33404a;background:var(--panel);color:var(--fg);font:16px system-ui,sans-serif}
#findBox input:focus{outline:2px solid var(--acc);outline-offset:0}
#findRes{list-style:none;margin:6px 0 0;padding:4px;max-height:min(55vh,480px);overflow:auto;background:#161c22;border-radius:10px}
#labelsBtn[aria-pressed=false]{opacity:.55}
#labelsBtn[aria-pressed=false] .x{display:inline}#labelsBtn .x{display:none}
#findRes:empty{display:none}
#findRes button{display:block;width:100%;min-height:40px;text-align:left;border:0;background:none;color:var(--fg);padding:8px 10px;border-radius:6px;font:14px system-ui,sans-serif;cursor:pointer}
#findRes button:hover,#findRes button:focus{background:#1b2229}
#findRes .k{color:var(--mut);font-size:12px;margin-left:6px}`;
    document.head.appendChild(css);
    // the round button at the top left is now Labels on or off (owner, 2026-10-09: "an easy way to toggle labels by single
    // click icon. It can replace the search option on frontpage, with a search box appearing at top of slide out
    // hamburger'd side menus instead"); #findBtn stays as a hidden button that opens the menu at the search box
    const lb = document.createElement('button'); lb.id = 'labelsBtn'; lb.className = 'btn'; lb.type = 'button'; lb.title = 'Labels on or off'; lb.setAttribute('aria-label', 'Labels');
    lb.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style="vertical-align:middle"><path d="M3 12V4h8l10 10-8 8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="7.5" cy="8.5" r="1.6" fill="currentColor"/><path class="x" d="M3 21L21 3" stroke="currentColor" stroke-width="2.2"/></svg>';
    const showL = document.getElementById('showLabels'), syncL = () => lb.setAttribute('aria-pressed', String(!showL || showL.checked));
    lb.onclick = () => { if (!showL) return; showL.checked = !showL.checked; showL.dispatchEvent(new Event('change')); syncL(); };
    showL?.addEventListener('change', syncL); syncL();
    const btn = document.createElement('button'); btn.id = 'findBtn'; btn.type = 'button'; btn.hidden = true; btn.setAttribute('aria-label', 'Search');
    const box = document.createElement('div'); box.id = 'findBox'; box.hidden = true; box.setAttribute('role', 'search');
    const qIn = document.createElement('input'); qIn.type = 'search'; qIn.placeholder = 'Building, place, station, platform'; qIn.setAttribute('aria-label', 'Search buildings and places'); qIn.autocomplete = 'off'; qIn.enterKeyHint = 'search';
    const qRes = document.createElement('ul'); qRes.id = 'findRes'; qRes.setAttribute('aria-label', 'Results');
    box.hidden = false; box.append(qIn, qRes);
    const night = document.getElementById('nightBtn'); (night || document.body.firstChild).after(lb); lb.after(btn);
    const dHead = document.getElementById('dHead'); if (dHead) dHead.after(box); else btn.after(box);   // the search box: the top of the menu

    // ---------- camera flight: a smooth (smoothstep) tween of the orbit target and the camera, same yaw and pitch
    let flight = 0;
    function flyTo(x, z, dist, ty = 0, ms = 600) {
      const t0 = controls.target.clone(), p0 = camera.position.clone(), off = p0.clone().sub(t0), d0 = off.length(), dir = off.clone().normalize();
      const t1 = new THREE.Vector3(x, ty, z), d1 = dist ?? d0, start = performance.now(), id = ++flight;
      const step = now => {
        if (id !== flight) return; const t = Math.min(1, (now - start) / ms), k = t * t * (3 - 2 * t);
        controls.target.lerpVectors(t0, t1, k); camera.position.copy(controls.target).addScaledVector(dir, d0 + (d1 - d0) * k);
        controls.update(); draw(); if (t < 1) requestAnimationFrame(step); else controls.dispatchEvent({ type: 'change' });
      };
      requestAnimationFrame(step);
    }
    const camDist = () => camera.position.distanceTo(controls.target);

    // ---------- labelled places (index.html labels): area.js places, under.js stations and places, named water, published levels
    const W = globalThis.DOCKLANDS_UNDER, labels = [], seen = new Set();
    for (const p of (W && W.pois) || []) if ((p.kind === 'station' || p.kind === 'place') && p.name && !seen.has(p.kind + p.name)) { seen.add(p.kind + p.name); labels.push({ name: p.name, x: p.x, z: p.z, y: p.g, k: p.kind, osm: p.osm }); }
    for (const p of A.places) if (p.name) labels.push({ name: p.name, x: p.x, z: p.z, y: p.g, k: 'place', place: p });
    for (const w of A.water) if (w.n && !seen.has('w' + w.n) && !/Pond|Fountain|Lake|Times Square|Stairs/.test(w.n)) {
      seen.add('w' + w.n); const f = dec(w.p), n = f.length / 2; let x = 0, z = 0; for (let i = 0; i < n; i++) { x += f[2 * i]; z += f[2 * i + 1]; }
      labels.push({ name: w.n, x: x / n, z: z / n, y: w.level, k: 'water', water: w });
    }
    for (const c of A.meta.sourced || []) labels.push({ name: `${c.place.replace(/ station$/, '')}: ${c.level} m OD`, x: c.x, z: c.z, y: c.level, k: 'published level', pub: c });

    function placeCard(l) {
      if (l.pub) { const o = l.pub; return `<h2>${esc(o.place)}</h2><p>${esc(o.what)}: <b>${o.level} m OD</b>${o.ground != null ? ` (LiDAR ground ${o.ground} m OD)` : ''}</p><p class="small">Source: <a href="${esc(o.source)}" target="_blank" rel="noopener">${esc(o.source.replace(/^https?:\/\//, '').slice(0, 70))}</a>: "${esc(o.quote)}"</p>`; }
      const p = l.place, facts = p && p.facts ? Object.entries(p.facts).map(([k, v]) => `<p><span class="small">${esc(k)}:</span> ${esc([].concat(v).join('; '))}</p>`).join('') : '';
      const links = [p && p.wd ? `<a href="https://www.wikidata.org/wiki/${esc(p.wd)}" target="_blank" rel="noopener">Wikidata ${esc(p.wd)}</a>` : '', p && p.wp ? `<a href="${esc(p.wp)}" target="_blank" rel="noopener">Wikipedia</a>` : '', l.osm && OSM.test(l.osm) ? `<a href="https://www.openstreetmap.org/${esc(l.osm)}" target="_blank" rel="noopener">OSM</a>` : ''].filter(Boolean).join(' · ');
      return `<h2>${esc(l.name)}</h2>${p && p.desc ? `<p class="small">${esc(p.desc)}</p>` : l.k === 'station' ? '<p class="small">station</p>' : ''}${facts}<p class="small">${l.water ? `Water surface ${l.water.level} m OD in the LiDAR pass${l.water.tidal ? ' (tidal: one tide state)' : ''}` : `Ground ${(l.y ?? groundAt(l.x, l.z)).toFixed(1)} m OD (LiDAR)`}</p>${links ? `<p class="small">${links}</p>` : ''}`;
    }
    function showLabel(l) { flyTo(l.x, l.z, Math.max(400, Math.min(camDist(), 1200))); D3()?.selectModel(-1); ctx.showCard(placeCard(l)); }

    // ---------- the walking network (index.html loadNet): places of data/indoor.js, loaded on the first focus
    let NET = null, netLoading = null;
    const loadNet = () => netLoading || (netLoading = (globalThis.DOCKLANDS_INDOOR ? Promise.resolve() : loadScript(ctx.WEBGL + 'data/indoor.js')).then(() => {
      const D = globalThis.DOCKLANDS_INDOOR; NET = { D, P: D.places.map((p, i) => ({ i, name: p[0], kind: p[1], lv: p[2], v: p[3], osm: p[4], d: p[5], same: p[6] })) }; return NET;
    }).catch(e => { console.warn('indoor', e); netLoading = null; return null; }));
    const storey = () => { const v = parseFloat(ctx.qs.get('storey')); return isFinite(v) ? v : 4; };
    function showPlace(p) {
      const N = NET.D.nodes, x = N[4 * p.v], z = N[4 * p.v + 1], lv = N[4 * p.v + 2], g = N[4 * p.v + 3], st = storey(), y = g + lv * st, below = y < g - 3;
      const U = under(); let cut = null;
      if (below && U && U.setCut) { cut = Math.round(y + st + 2); U.setCut(cut); U.showGauge?.(true); }
      flyTo(x, z, 320, below ? y : 0); D3()?.selectModel(-1);
      ctx.showCard(`<h2>${esc(p.name)}</h2><p class="small">${esc(p.kind)}, level ${p.lv}${OSM.test(p.osm || '') ? ` · <a href="https://www.openstreetmap.org/${esc(p.osm)}" target="_blank" rel="noopener">OSM</a>` : ''}</p>${p.same ? '' : `<p class="small">No mapped walkway on its level; routes use the nearest mapped point, ${p.d} m away.</p>`}${cut != null ? `<p class="small">Below ground: the model is cut away above ${cut} m OD to show it. Drag the gauge at the right edge to change.</p>` : ''}`);
    }

    // ---------- search (index.html searchItems, runSearch)
    function searchItems(q) {
      q = q.trim().toLowerCase(); if (q.length < 2) return [];
      const out = [], has = t => t && t.toLowerCase().includes(q), R = ctx.registry, AT = R && R.AT;
      if (AT) AT.buildings.forEach((b, k) => { if ((has(b.n) || b.id === q) && b.mi && b.mi.length) out.push({ t: b.n || b.id, k: 'building', go: () => { flyTo(b.x, b.z, Math.max(350, Math.min(camDist(), 900))); D3()?.selectModel(b.mi[0]); } }); });
      for (const l of labels) if (has(l.name)) out.push({ t: l.name, k: l.k, go: () => showLabel(l) });
      if (NET) for (const p of NET.P) if (has(p.name)) out.push({ t: p.name, k: `${p.kind}, level ${p.lv}`, go: () => showPlace(p) });
      out.sort((a, b) => (a.t.toLowerCase().startsWith(q) ? 0 : 1) - (b.t.toLowerCase().startsWith(q) ? 0 : 1)); return out.slice(0, 14);
    }
    let last = [];
    function runSearch() {
      last = searchItems(qIn.value); qRes.innerHTML = '';
      for (const it of last) { const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.innerHTML = `${esc(it.t)}<span class="k">${esc(it.k)}</span>`; b.onclick = () => pick(it); li.appendChild(b); qRes.appendChild(li); }
    }
    const drawerEl = () => document.getElementById('drawer');
    function pick(it) { qRes.innerHTML = ''; qIn.blur(); if (innerWidth < 900) document.getElementById('drawerX')?.click(); it.go(); }
    function open() { const d = drawerEl(); if (d && d.hidden) document.getElementById('menu')?.click(); qIn.focus(); }
    function close() { qRes.innerHTML = ''; }
    btn.onclick = open;
    qIn.addEventListener('input', runSearch);
    qIn.addEventListener('focus', () => { loadNet().then(() => { if (qIn.value) runSearch(); }); ctx.registry?.ready?.then(() => { if (qIn.value) runSearch(); }); });
    qIn.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); runSearch(); if (last[0]) pick(last[0]); }
      else if (e.key === 'Escape') { close(); qIn.value = ''; }
      else if (e.key === 'ArrowDown') { const b = qRes.querySelector('button'); if (b) { e.preventDefault(); b.focus(); } }
      e.stopPropagation();   // OrbitControls listens to the arrow keys on window
    });
    qRes.addEventListener('keydown', e => { const bs = [...qRes.querySelectorAll('button')], i = bs.indexOf(document.activeElement); if (e.key === 'ArrowDown' && bs[i + 1]) { e.preventDefault(); bs[i + 1].focus(); } if (e.key === 'ArrowUp') { e.preventDefault(); (bs[i - 1] || qIn).focus(); } if (e.key === 'Escape') { close(); btn.focus(); } e.stopPropagation(); });
    ctx.renderer.domElement.addEventListener('pointerdown', () => { qRes.innerHTML = ''; if (document.activeElement === qIn) qIn.blur(); });

    return { searchItems, flyTo, loadNet, open, close, labels: labels.length };
  },
};
