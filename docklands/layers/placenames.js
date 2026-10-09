// Layer "placenames" of the Three.js port (docklands/): the WebGL page's station, district and water labels that main.js
// (area.js places only) does not draw. Ported from cwplans/docklands/index.html "labels" (the U.pois of kind station: bold
// orange; kind place: italic districts such as Limehouse, Poplar, Westferry, Shadwell; the named docks, basins and creeks at
// the mean of their outline points, light blue), placeLabels (8 m over the point, greedy overlap culling, highest priority
// first: stations 3, water 2, districts 1; at most 60) and showInfo (the tap card: Wikidata, OSM, ground or water level).
// Data: ../cwplans/docklands/data/under.js (U.pois, loaded here if the below-ground layer has not) and area.js A.water.
// A name that main.js already draws (an area.js place) is left out. Hidden with Layers > City > Place names unticked and
// while the model is cut away (as main.js). Labels are kept clear of main.js labels already on the screen.
// Test hook: __docklands3.layers.placenames.api.state. Skill: docklands-3d-page, "Three.js port".
const CSS = `.pnl{position:absolute;left:0;top:0;font:11px system-ui,sans-serif;white-space:nowrap;padding:2px 3px;border:0;background:none;color:#e8ecef;pointer-events:auto;cursor:pointer;text-shadow:0 0 2px #000,0 0 3px #000,0 1px 4px #000c;will-change:transform}
.pnl.st{font-size:12px;font-weight:600;color:#ffd9bf}.pnl.pl{font-style:italic;color:#d7dce0}.pnl.wt{color:#bfe3ff}`;
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(src + ' did not load')); document.head.appendChild(s); });

export default {
  id: 'placenames', label: 'Station, district and dock names', on: true, menu: 'layers/city', reveal: false,
  async init(ctx, on) {
    const { THREE, camera, A, U, dec, esc, draw } = ctx;
    if (!globalThis.DOCKLANDS_UNDER) await loadScript(ctx.WEBGL + 'data/under.js').catch(e => console.warn('placenames: under.js', e));
    const UD = globalThis.DOCKLANDS_UNDER || { pois: [] };
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const have = new Set(A.places.filter(p => p.name).map(p => p.name.toLowerCase())), seen = new Set(), L = [];
    for (const p of UD.pois) if ((p.kind === 'station' || p.kind === 'place') && p.name && !seen.has(p.kind + p.name) && !have.has(p.name.toLowerCase())) { seen.add(p.kind + p.name); L.push({ ...p, y: p.g, pri: p.kind === 'station' ? 3 : 1, cls: p.kind === 'station' ? 'st' : 'pl' }); }
    for (const w of A.water) if (w.n && !seen.has('w' + w.n) && !have.has(w.n.toLowerCase()) && !/Pond|Fountain|Lake|Times Square|Stairs/.test(w.n)) {
      seen.add('w' + w.n); const f = dec(w.p); let x = 0, z = 0; const n = f.length / 2; for (let i = 0; i < n; i++) { x += f[2 * i]; z += f[2 * i + 1]; }
      L.push({ name: w.n, x: x / n, z: z / n, y: w.level, pri: 2, cls: 'wt', water: w }); }
    L.sort((a, b) => b.pri - a.pri);
    const host = document.getElementById('labels') || document.body;
    for (const l of L) { const el = document.createElement('button'); el.type = 'button'; el.className = 'pnl ' + l.cls; el.textContent = l.name; el.hidden = true; el.onclick = () => card(l); host.appendChild(el); l.el = el; l.v = new THREE.Vector3(l.x, l.y + 8, l.z); }
    function card(l) {
      ctx.showCard(`<h2>${esc(l.name)}</h2><p class="small">${l.cls === 'st' ? 'Station' : l.cls === 'pl' ? 'Place (district or estate)' : 'Named water'}${l.water ? ` · water surface ${l.water.level} m OD in the LiDAR pass${l.water.tidal ? ' (tidal: one tide state)' : ''}` : ` · ground ${l.y} m OD (LiDAR)`}</p>` +
        `<p class="small">${l.wd ? `<a href="https://www.wikidata.org/wiki/${esc(l.wd)}" target="_blank" rel="noopener">Wikidata ${esc(l.wd)}</a>` : ''}${l.osm ? `${l.wd ? ' · ' : ''}<a href="https://www.openstreetmap.org/${esc(l.osm)}" target="_blank" rel="noopener">OpenStreetMap ${esc(l.osm)}</a>` : ''}</p>`);
    }
    let visible = on, key = '', shown = 0;
    const tv = new THREE.Vector3();
    function place() {
      const show = visible && document.getElementById('showLabels')?.checked !== false && U.cut.value >= 250, W = innerWidth, H = innerHeight;
      const k = `${show}|${camera.position.toArray().map(v => v.toFixed(1))}|${camera.quaternion.toArray().map(v => v.toFixed(4))}|${camera.fov}|${W}x${H}`; if (k === key) return; key = k;
      const placed = []; shown = 0;
      if (show) for (const e of document.querySelectorAll('#labels .lab:not([hidden])')) { const r = e.getBoundingClientRect(); if (r.width) placed.push([r.left, r.top, r.right, r.bottom]); }
      camera.updateMatrixWorld();
      for (const l of L) {
        let vis = false;
        if (show && shown < 60 && l.v.distanceToSquared(camera.position) < 9000 * 9000) { tv.copy(l.v).project(camera);
          if (tv.z < 1) { const sx = (tv.x + 1) / 2 * W, sy = (1 - tv.y) / 2 * H, bw = l.name.length * 6.2 + 12, r = [sx - bw / 2, sy - 18, sx + bw / 2, sy];
            if (r[0] >= 2 && r[2] <= W - 2 && sy >= 40 && sy <= H && !placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) { placed.push(r); vis = true; shown++; l.el.style.transform = `translate(${(sx - bw / 2) | 0}px,${(sy - 18) | 0}px)`; } } }
        if (l.el.hidden === vis) l.el.hidden = !vis;
      }
    }
    ctx.onFrame(place);
    document.getElementById('showLabels')?.addEventListener('change', () => { key = ''; draw(); });
    return {
      object: null, setVisible(v) { visible = v; key = ''; draw(); },
      get state() { return { labels: L.length, stations: L.filter(l => l.cls === 'st').length, places: L.filter(l => l.cls === 'pl').length, water: L.filter(l => l.cls === 'wt').length, shown, names: L.filter(l => !l.el.hidden).map(l => l.name) }; },
    };
  },
};
