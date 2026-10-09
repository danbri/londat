// Below ground (layer "under") of the Three.js port: tunnels at the modelled level (portals, open cuts and published
// station levels; the gradient, dip and depth parameters), basements (storeys x storey height), indoor floors and ways
// by level, points with a level as cubes, the published slabs of Crossrail Place, the North Dock water volume, and the
// cut-away: a depth gauge at the right edge (60 to -40 m OD; top tenth = off) that sets U.cut. With the cut on, the
// ground, the greens and the water of main.js are drawn faint (opacity 0.14, 0.2, 0.35), as in the WebGL page; by night
// a fill light and a lighter backdrop stand for the WebGL page's dim 0.6 of the cut view.
// Station cut-outs: while the station models are shown (layers/stations.js sets ctx.stationCut and calls ctx.under.rebuild),
// the OSM indoor floors and points inside each station rectangle are left out and the tunnels are cut at its faces.
// The yellow labels of published levels (A.meta.sourced, the structures) and a tap card for tunnels (line, modelled level
// and depth), indoor floors, basements, points with a level and the slabs (ctx.addPick, ctx.showCard).
// Port of index.html tunnelY, buildTunnels, buildUnder, L.dockVol, the labels with cls 'src', showInfo, the gauge and
// render() (cut branch). URL: ?layers=under, ?cut=<m OD> (off at 250 or more), ?view=under (cut 2 m OD, as the WebGL page's view).
// Skill: docklands-3d-page, "Three.js port" and "Station models".
import { attribute, sRGBTransferEOTF, mix, vec3 } from 'three/tsl';
import { A, Mesh, flat, dec, earcut, lineColour, C as BC } from '../build.js';

const hex = v => [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16) / 255);
// index.html :root colours of the below-ground layers
const C = { ...BC, ...Object.fromEntries(Object.entries({ base: '#b05cff', corr: '#e7d6ff', path: '#d8c49a', plat: '#ff8a3d', room: '#ff5fa2', tun: '#e6e08a' }).map(([k, v]) => [k, hex(v)])) };
const tunColour = l => (l.k === 'road' || l.k === 'foot') ? C.tun : lineColour(l);
const indoorCol = k => k === 'platform' ? C.plat : k === 'room' ? C.room : k === 'area' ? C.room.map(c => c * .8) : C.corr;
const G_TOP = 60, G_BOT = -40, OFF = 250;
const gVal = t => t < .1 ? OFF : Math.round(G_TOP + (G_BOT - G_TOP) * (t - .1) / .9);
const gPos = v => v >= OFF ? 0 : .1 + .9 * (G_TOP - Math.max(G_BOT, Math.min(G_TOP, v))) / (G_TOP - G_BOT);

// ---------- geometry (port winding: tops counter-clockwise from above, as build.js flat)
function prism(M, o, y0, y1, col, bottom) {
  const f = dec(o.p), holes = o.holes || [], nv = f.length / 2, tris = earcut(f, holes.length ? holes : undefined, 2), top = col.map(c => Math.min(1, c * 1.05)), base = M.n;
  for (let i = 0; i < nv; i++) M.v(f[2 * i], y1, f[2 * i + 1], top);
  for (let k = 0; k < tris.length; k += 3) M.tri(base + tris[k], base + tris[k + 2], base + tris[k + 1]);
  if (bottom) { const b2 = M.n, bs = col.map(c => c * .6); for (let i = 0; i < nv; i++) M.v(f[2 * i], y0, f[2 * i + 1], bs); for (let k = 0; k < tris.length; k += 3) M.tri(b2 + tris[k], b2 + tris[k + 1], b2 + tris[k + 2]); }
  const starts = [0, ...holes, nv], s = col.map(c => c * .9);
  for (let r = 0; r < starts.length - 1; r++) for (let k = starts[r]; k < starts[r + 1]; k++) {
    const k2 = k + 1 < starts[r + 1] ? k + 1 : starts[r], x0 = f[2 * k], z0 = f[2 * k + 1], x1 = f[2 * k2], z1 = f[2 * k2 + 1];
    const i = M.v(x0, y0, z0, s), j = M.v(x1, y0, z1, s), kk = M.v(x1, y1, z1, s), l = M.v(x0, y1, z0, s); M.tri(i, j, kk); M.tri(i, kk, l);
  }
}
function beam(M, a, b, w, h, col) {   // build.js beam (not exported)
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, ox = -dz / l * w / 2, oz = dx / l * w / 2, H = h / 2;
  const P = (q, sx, sy) => [q[0] + ox * sx, q[1] + H * sy, q[2] + oz * sx];
  const a00 = P(a, -1, -1), a10 = P(a, 1, -1), a11 = P(a, 1, 1), a01 = P(a, -1, 1), b00 = P(b, -1, -1), b10 = P(b, 1, -1), b11 = P(b, 1, 1), b01 = P(b, -1, 1);
  M.quad(a01, b01, b11, a11, col); M.quad(a00, a10, b10, b00, col.map(c => c * .7)); M.quad(a00, b00, b01, a01, col); M.quad(a10, a11, b11, b10, col);
}
const cube = (M, x, y, z, s, col) => { const h = s / 2; prism(M, { p: [Math.round((x - h) * 10), Math.round((z - h) * 10), s * 10, 0, 0, s * 10, -s * 10, 0] }, y - h, y + h, col, true); };

// ---------- tunnel model (index.html; cwplans/docklands/README.md "Tunnel model"): controls [s, level, kind] per chain
const CTL = new Map();
for (const l of A.lines) if (l.tunnel) {
  const c = []; if (l.ends[0] != null) c.push([0, l.ends[0], 'portal']);
  for (const p of l.pts) if (p[4] != null) c.push([p[3], p[4], 'cut']);
  if (l.ends[1] != null) c.push([l.len, l.ends[1], 'portal']);
  for (const s of l.src || []) c.push([s[0], s[1], 'src', s[2]]);   // published level (data/sourced-levels.json)
  c.sort((a, b) => a[0] - b[0]); CTL.set(l, c);
}
function tunnelY(l, p, P) {
  if (p[4] != null) return p[4];
  const s = p[3], n = P.grad; let a = null, b = null;
  for (const c of CTL.get(l)) { if (c[0] <= s) a = c; else { b = c; break; } }
  if (!a && !b) return p[2] - (l.k === 'foot' || l.k === 'road' ? Math.min(P.ddeep, 15) : P.ddeep);
  const dip = l.k === 'road' || l.k === 'foot' ? Math.min(P.dmax, 12) : P.dmax;
  if (a && b) return a[1] + (b[1] - a[1]) * (s - a[0]) / Math.max(1, b[0] - a[0]) - Math.min(dip, (s - a[0]) / n, (b[0] - s) / n);
  const c = a || b;   // one control: a published station level holds flat; a portal or cut descends at the gradient
  return c[2] === 'src' ? c[1] : c[1] - Math.min(P.ddeep, Math.abs(s - c[0]) / n);
}
// ST: the station models' cut-outs (layers/stations.js sets ctx.stationCut; null or off: none). items: per triangle range,
// what it belongs to (the tap card): [first triangle, kind, index, ...]
const ntri = M => M.idx.length / 3;
function tunnelsGeometry(P, ST) {
  const M = new Mesh(), items = [], lines = A.lines;
  for (let li = 0; li < lines.length; li++) { const l = lines[li]; if (!l.tunnel) continue; const col = tunColour(l), w = l.k === 'road' ? 9 : l.k === 'foot' ? 3 : 6;
    for (let i = 1; i < l.pts.length; i++) { const a = l.pts[i - 1], b = l.pts[i], ya = tunnelY(l, a, P) + w / 2, yb = tunnelY(l, b, P) + w / 2;
      items.push([ntri(M), 't', li, i]);
      for (const [s, e] of ST ? ST.outside(a[0], a[1], b[0], b[1]) : [[0, 1]]) beam(M, [a[0] + (b[0] - a[0]) * s, ya + (yb - ya) * s, a[1] + (b[1] - a[1]) * s], [a[0] + (b[0] - a[0]) * e, ya + (yb - ya) * e, a[1] + (b[1] - a[1]) * e], w, w, col); } }   // station models cut their boxes out (index.html buildTunnels)
  const G = M.geometry(); G.userData.items = items; return G;
}
function underGeometry(U, P, ST) {
  const M = new Mesh(), items = [];
  U.basements.forEach((b, k) => { items.push([ntri(M), 'b', k]); prism(M, b, b.b - b.n * P.storey, b.b - .3, C.base, true); });
  U.indoor.forEach((o, k) => {
    if (ST && ST.inside(...dec(o.p || o.line).slice(0, 2))) return;   // station models: OSM floors inside a box are drawn by the model at measured levels
    items.push([ntri(M), 'i', k]);
    for (const lv of o.lv) {
      const y = o.g + lv * P.storey + .2, col = o.out ? C.path : indoorCol(o.kind);
      if (o.p) flat(M, o, y, col);
      else { const f = dec(o.line); for (let i = 2; i < f.length; i += 2) beam(M, [f[i - 2], y, f[i - 1]], [f[i], y, f[i + 1]], o.kind === 'steps' ? 2 : 3, .6, col); }
    }
  });
  U.pois.forEach((p, k) => { if (p.lv && p.kind === 'poi' && !(ST && ST.inside(p.x, p.z))) { items.push([ntri(M), 'p', k]); cube(M, p.x, p.g + Math.min(...p.lv) * P.storey + 1.5, p.z, 3, C.room); } });
  (U.structures || []).forEach((st, k) => { if (st.slabs) { items.push([ntri(M), 's', k]); for (const [, y] of st.slabs) prism(M, st, y - .4, y, [.98, .78, .35], true); } });   // Crossrail Place slabs (Arup)
  const G = M.geometry(); G.userData.items = items; return G;
}
const itemAt = (G, f) => { const it = G.userData.items; if (!it || !it.length) return null; let lo = 0, hi = it.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (it[m][0] <= f) lo = m; else hi = m - 1; } return it[lo][0] <= f ? it[lo] : null; };
function dockGeometry(U) { const M = new Mesh(); for (const st of U.structures || []) if (st.bed != null) prism(M, st, st.bed, st.water, C.water.map(c => c * .8), true); return M.geometry(); }

const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(src + ' did not load')); document.head.appendChild(s); });
const tris = G => G.index ? G.index.count / 3 : 0;

export default {
  id: 'under', label: 'Below ground', on: true,
  async init(ctx, on) {
    const { THREE, scene, U: UN, qs, ui, draw, groundAt } = ctx, esc = ctx.esc || (v => String(v));
    if (!globalThis.DOCKLANDS_UNDER) await loadScript(ctx.WEBGL + 'data/under.js');
    const DU = globalThis.DOCKLANDS_UNDER || { basements: [], indoor: [], pois: [], structures: [] };
    const num = (k, d, lo, hi) => { const v = parseFloat(qs.get(k)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
    const P = { storey: num('storey', 4, 2.5, 6), dmax: num('dmax', 10, 0, 30), grad: num('grad', 40, 20, 100), ddeep: num('ddeep', 25, 5, 45) };
    const stats = {};

    // materials: vertex colours, cut above U.cut; by night a little own light (the WebGL page dims the cut view to 0.6, not 0.12)
    const glow = m => { m.emissiveNode = sRGBTransferEOTF(attribute('color', 'vec3')).mul(UN.night).mul(0.35); return m; };
    const mat = glow(ctx.materials.vertexColourMaterial());
    const dockMat = ctx.materials.vertexColourMaterial({ cut: false, transparent: true, opacity: 0.3, depthWrite: false });
    const group = new THREE.Group(); group.name = 'under';
    const tunnels = new THREE.Mesh(new THREE.BufferGeometry(), mat), under = new THREE.Mesh(new THREE.BufferGeometry(), mat), dock = new THREE.Mesh(dockGeometry(DU), dockMat);
    tunnels.name = 'under:tunnels'; under.name = 'under:levels'; dock.name = 'under:dockVol'; dock.renderOrder = 3;
    // backdrop with the cut on: an unlit plane 60 m below OD over the model box, in the WebGL page's background grey-blue
    // (measured there: sRGB about 134, 148, 162 through the faint ground); without it the day sky shows white through the ground
    const ex = A.meta.extent, back = new THREE.Mesh(new THREE.PlaneGeometry(ex.x1 - ex.x0 + 4000, ex.z1 - ex.z0 + 4000), new THREE.MeshBasicNodeMaterial());
    back.material.colorNode = mix(sRGBTransferEOTF(vec3(0.5, 0.56, 0.62)), sRGBTransferEOTF(vec3(0.165, 0.152, 0.136)), UN.night);   // by night: the WebGL page's night clear colour seen through its faint ground at dim 0.6 (measured there: sRGB about 37, 34, 30; this input gives about that after AgX)
    back.rotation.x = -Math.PI / 2; back.position.set((ex.x0 + ex.x1) / 2, -60, (ex.z0 + ex.z1) / 2); back.name = 'under:backdrop';
    group.add(tunnels, under, dock, back);
    const ST = () => { const c = ctx.stationCut; return c && c.on() ? c : null; };   // layers/stations.js, while its layer is shown
    const rebuildTunnels = () => { const t0 = performance.now(), st = ST(); tunnels.geometry.dispose(); tunnels.geometry = tunnelsGeometry(P, st); stats.tunnels = { chains: CTL.size, triangles: tris(tunnels.geometry), cutOuts: !!st, ms: Math.round(performance.now() - t0) }; draw(); };
    const rebuildUnder = () => { const t0 = performance.now(), st = ST(); under.geometry.dispose(); under.geometry = underGeometry(DU, P, st); stats.under = { basements: DU.basements.length, indoor: DU.indoor.length, indoorInStations: st ? DU.indoor.filter(o => st.inside(...dec(o.p || o.line).slice(0, 2))).length : 0, triangles: tris(under.geometry), ms: Math.round(performance.now() - t0) }; draw(); };
    ctx.under = { rebuild() { rebuildTunnels(); rebuildUnder(); } };   // stations.js calls it when its cut-outs change
    rebuildTunnels(); rebuildUnder(); stats.dockVol = { triangles: tris(dock.geometry) };
    let tq = 0, uq = 0;   // slider moves: rebuild at most every 120 ms
    const later = (fn, which) => { if (which === 't') { clearTimeout(tq); tq = setTimeout(fn, 120); } else { clearTimeout(uq); uq = setTimeout(fn, 120); } };

    // the faint context with the cut on: main.js's terrain, water and greens (ctx.meshes)
    const { terrain, water, greens } = ctx.meshes || {};
    const faintOf = [[terrain, 0.14], [water, 0.35], [greens, 0.2]].filter(x => x[0]);
    const saved = new Map(faintOf.map(([o]) => [o, { transparent: o.material.transparent, opacity: o.material.opacity, depthWrite: o.material.depthWrite }]));
    stats.faint = faintOf.map(([o]) => o === terrain ? 'terrain' : o === water ? 'water' : 'greens');
    function faint(onCut) {
      for (const [o, a] of faintOf) { const m = o.material, s = saved.get(o), want = onCut ? { transparent: true, opacity: a, depthWrite: false } : s;
        if (m.transparent !== want.transparent || m.opacity !== want.opacity || m.depthWrite !== want.depthWrite) { Object.assign(m, want); m.needsUpdate = true; } }
    }

    // by night with the cut on, the WebGL page draws the whole scene at dim 0.6 (by night otherwise 0.12; index.html render(),
    // nDim), so the faint ground and the levels stay readable in the cut-away. Here: a hemisphere light that lifts the
    // night fill (sky3.js: 0.18 by night, 1.18 by day) to about 0.6 of the day's, while the cut is on. It joins the scene
    // the first time the cut is on (one shader rebuild then) and stays, at intensity 0 when not needed.
    const nightFill = new THREE.HemisphereLight(0xc8d6ec, 0x5a4c3c, 0); nightFill.name = 'under:nightFill';
    const syncNight = () => { const k = CUT < OFF && group.visible ? 0.55 * UN.night.value : 0; if (k > 0 && !nightFill.parent) scene.add(nightFill); if (nightFill.intensity !== k) { nightFill.intensity = k; draw(); } };
    ctx.onFrame(syncNight);

    // ---------- the yellow labels of published levels (index.html labels with cls 'src'): station levels from
    // data/sourced-levels.json (A.meta.sourced) and the structures of under.js (Crossrail Place slabs, North Dock bed),
    // at their level; a tap opens the source and its words (index.html showInfo, l.pub / l.st)
    const fmt = s => esc(String(s));
    function srcCard(o, pub, st) {
      const rows = st && st.slabs ? '<table>' + st.slabs.map(([n, y]) => `<tr><td>${fmt(n)}</td><td>${y} m OD</td></tr>`).join('') + '</table>' : '';
      const what = pub ? `${fmt(o.what)}: <b>${o.level} m OD</b>${o.ground != null ? ` (LiDAR ground ${o.ground} m OD)` : ''}`
        : st.bed != null ? `Water ${st.water} m OD (full impound), bed ${st.bed} m OD; the LiDAR saw the surface at ${st.lidarLevel} m OD`
        : 'Structural slab levels, OD = mATD - 100 m (datum inferred from the dock water level in the same figure)';
      ctx.showCard(`<h2>${fmt(o.place)}</h2><p class="small">published level</p><p>${what}</p>${rows}<p class="small">Source: <a href="${fmt(o.source)}" target="_blank" rel="noopener">${fmt(o.source.replace(/^https?:\/\//, '').slice(0, 70))}…</a> — "${fmt(o.quote)}"</p>`);
    }
    const srcLabels = [];
    for (const c of A.meta.sourced || []) srcLabels.push({ name: `${c.place.replace(/ station$/, '')}: ${c.level} m OD`, x: c.x, z: c.z, y: c.level, open: () => srcCard(c, true) });
    for (const st of DU.structures || []) { const f = dec(st.p); srcLabels.push({ name: st.slabs ? `${st.place.split(' / ').pop()}: ${st.slabs.length} published slab levels` : `${st.place}: bed ${st.bed} m OD`, x: f[0], z: f[1], y: st.slabs ? st.slabs[0][1] : st.bed, open: () => srcCard(st, false, st) }); }
    const labelBox = document.getElementById('labels'), lv = new THREE.Vector3();
    for (const l of srcLabels) {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'lab src'; el.textContent = l.name; el.hidden = true;
      Object.assign(el.style, { pointerEvents: 'auto', cursor: 'pointer', border: '1px solid #ffd26f', color: '#ffe7a8', font: 'inherit', fontSize: '12px' });
      el.onclick = e => { e.stopPropagation(); l.open(); }; labelBox?.appendChild(el); l.el = el; l.v = new THREE.Vector3(l.x, l.y + 8, l.z);
    }
    ctx.onFrame(() => {   // placed after main.js placeLabels; greedy overlap culling among themselves (index.html placeLabels)
      const show = group.visible && document.getElementById('showLabels')?.checked !== false, W = innerWidth, Hh = innerHeight, placed = [];
      for (const l of srcLabels) {
        let vis = false;
        if (show) { lv.copy(l.v).project(ctx.camera); const x = (lv.x + 1) / 2 * W, y = (1 - lv.y) / 2 * Hh, bw = l.name.length * 6.6 + 14, r = [x - bw / 2, y - 22, x + bw / 2, y];
          vis = lv.z < 1 && r[0] > 2 && r[2] < W - 2 && y > 40 && y < Hh && !placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
          if (vis) { placed.push(r); l.el.style.transform = `translate(${x | 0}px,${y | 0}px) translate(-50%,-100%)`; } }
        if (l.el.hidden === vis) l.el.hidden = !vis;
      }
      stats.srcLabels = placed.length;
    });

    // ---------- the tap card of a tunnel, an indoor level, a basement, a point with a level, the slabs (ctx.addPick):
    // with the cut on, only what is not cut away; with it off, only what stands above the ground (the rest is hidden by it)
    function tunnelCard(li, seg, hit) {
      const l = A.lines[li], a = l.pts[seg - 1], b = l.pts[seg], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((hit.x - a[0]) * dx + (hit.z - a[1]) * dz) / L2)), x = a[0] + dx * t, z = a[1] + dz * t;
      const y = tunnelY(l, a, P) + (tunnelY(l, b, P) - tunnelY(l, a, P)) * t, g = groundAt(x, z), s = a[3] + (b[3] - a[3]) * t;
      const ctl = CTL.get(l) || [], kinds = { portal: 'portal', cut: 'open cut (LiDAR)', src: 'published level' };
      const known = ctl.map(c => `${kinds[c[2]]} ${c[1].toFixed(1)} m OD at ${Math.round(c[0])} m`).join('; ');
      const kind = { rail: 'Railway tunnel', road: 'Road tunnel', foot: 'Foot tunnel' }[l.k] || 'Tunnel';
      ctx.showCard(`<h2>${fmt(l.name || kind)}</h2><p class="small">${kind} · below ground (modelled)</p>` +
        `<table><tr><td>Track or deck level here</td><td>${y.toFixed(1)} m OD</td></tr><tr><td>Ground above (LiDAR)</td><td>${g.toFixed(1)} m OD</td></tr>` +
        `<tr><td>Depth below the ground</td><td>${(g - y).toFixed(1)} m</td></tr><tr><td>Along the chain</td><td>${Math.round(s)} of ${Math.round(l.len)} m</td></tr>` +
        `${l.layer != null ? `<tr><td>OSM layer</td><td>${l.layer}</td></tr>` : ''}</table>` +
        `<p class="small">Known levels on this chain: ${known ? fmt(known) : 'none (the depth of tunnels with no measured point: ' + P.ddeep + ' m)'}. Between them the level is modelled: ` +
        `a dip of at most ${P.dmax} m, a gradient of at most 1 in ${P.grad}. <a href="https://github.com/danbri/londat/blob/main/cwplans/docklands/README.md" target="_blank" rel="noopener">README, "Tunnel model"</a></p>`);
    }
    function itemCard(it) {
      const [, k, i] = it, wd = q => q ? ` · <a href="https://www.wikidata.org/wiki/${fmt(q)}" target="_blank" rel="noopener">Wikidata ${fmt(q)}</a>` : '';
      if (k === 'b') { const b = DU.basements[i];
        return ctx.showCard(`<h2>${fmt(b.name || 'Basement')}</h2><p class="small">basement (modelled)</p><table><tr><td>Storeys below ground</td><td>${b.n}</td></tr>` +
          `<tr><td>Ground</td><td>${b.b} m OD</td></tr><tr><td>Bottom (storeys × ${P.storey} m)</td><td>${(b.b - b.n * P.storey).toFixed(1)} m OD</td></tr><tr><td>Storey count from</td><td>${fmt(b.src === 'wikidata' ? 'Wikidata (P1139, floors below ground)' : b.src === 'osm' ? 'OpenStreetMap (building:levels:underground)' : b.src)}</td></tr></table>` +
          `<p class="small">The storey height is a model setting (Menu > Below ground).${wd(b.wd)}</p>`); }
      if (k === 'i') { const o = DU.indoor[i], kind = o.out ? 'outdoor path at a level' : o.kind;
        return ctx.showCard(`<h2>${fmt(o.name || (o.kind[0].toUpperCase() + o.kind.slice(1)))}</h2><p class="small">indoor ${fmt(kind)} (OpenStreetMap)</p><table>` +
          `<tr><td>OSM level</td><td>${o.lv.join(', ')}</td></tr><tr><td>Drawn at</td><td>${o.lv.map(v => (o.g + v * P.storey).toFixed(1)).join(', ')} m OD</td></tr><tr><td>Ground (LiDAR)</td><td>${o.g} m OD</td></tr></table>` +
          `<p class="small">Level × storey height (${P.storey} m) from the ground: a model, not a survey. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a></p>`); }
      if (k === 'p') { const p = DU.pois[i];
        return ctx.showCard(`<h2>${fmt(p.name)}</h2><p class="small">${fmt(p.what || 'point')} with a level (OpenStreetMap)</p><table><tr><td>OSM level</td><td>${p.lv.join(', ')}</td></tr>` +
          `<tr><td>Ground (LiDAR)</td><td>${p.g} m OD</td></tr></table><p class="small"><a href="https://www.openstreetmap.org/${fmt(p.osm)}" target="_blank" rel="noopener">OpenStreetMap ${fmt(p.osm)}</a>${wd(p.wd)} · © OpenStreetMap contributors</p>`); }
      if (k === 's') { const st = DU.structures[i]; return srcCard(st, false, st); }
    }
    ctx.addPick(ray => {
      if (!group.visible) return null;
      const objs = [tunnels, under].filter(o => o.visible), cut = UN.cut.value, cutOn = cut < OFF;
      for (const h of ray.intersectObjects(objs, false)) {
        if (cutOn ? h.point.y > cut : h.point.y < groundAt(h.point.x, h.point.z) + 0.3) continue;
        const it = itemAt(h.object.geometry, h.faceIndex); if (!it) continue;
        return { distance: h.distance, open: () => it[1] === 't' ? tunnelCard(it[2], it[3], h.point) : itemCard(it) };
      }
      return null;
    });

    // ---------- cut level, gauge and drawer controls (the gauge starts below the time wheels, carousel.js: top 60 px + 64 px, so its × stays clear of them on a phone)
    let CUT = OFF;
    const gauge = document.createElement('div'), gH = document.createElement('div'), gO = document.createElement('output'), gX = document.createElement('button'), track = document.createElement('div');
    gauge.setAttribute('role', 'slider'); gauge.tabIndex = 0; gauge.setAttribute('aria-label', 'Cut away everything above this level, metres above Ordnance Datum'); gauge.setAttribute('aria-valuemin', String(G_BOT)); gauge.setAttribute('aria-valuemax', String(OFF));
    Object.assign(gauge.style, { position: 'fixed', right: '6px', top: 'calc(178px + env(safe-area-inset-top,0px))', height: 'min(50vh, 420px)', width: '96px', touchAction: 'none', userSelect: 'none', zIndex: 5, font: '12px system-ui,sans-serif', color: '#e8ecef' });
    Object.assign(track.style, { position: 'absolute', right: '20px', top: 0, bottom: 0, width: '6px', borderRadius: '3px', background: 'linear-gradient(#5d7a8f,#5d7a8f 10%,#8a6a4a 48%,#4a3426)' });
    Object.assign(gH.style, { position: 'absolute', right: '8px', width: '30px', height: '30px', marginTop: '-15px', borderRadius: '50%', background: '#e8eaec', border: '3px solid #15191d', boxShadow: '0 1px 4px #000a', boxSizing: 'border-box' });
    Object.assign(gO.style, { position: 'absolute', right: '44px', transform: 'translateY(-50%)', fontWeight: 600, background: 'rgba(17,17,17,.85)', padding: '2px 6px', borderRadius: '6px', whiteSpace: 'nowrap' });
    Object.assign(gX.style, { position: 'absolute', right: '4px', top: '-44px', width: '38px', height: '38px', borderRadius: '50%', border: 0, background: 'rgba(16,20,24,.92)', color: '#e8ecef', fontSize: '20px', cursor: 'pointer' });
    gX.type = 'button'; gX.textContent = '×'; gX.setAttribute('aria-label', 'Close the depth gauge');
    gauge.append(track);
    for (const [v, t] of [[OFF, 'off'], [50, '50'], [5, 'street'], [-15, '−15'], [-30, '−30']]) { const m = document.createElement('span'); m.textContent = t; Object.assign(m.style, { position: 'absolute', right: '30px', top: (gPos(v) * 100) + '%', transform: 'translateY(-50%)', fontSize: '10px', color: '#9aa4ad', textShadow: '0 0 3px #000', whiteSpace: 'nowrap', pointerEvents: 'none' }); gauge.append(m); }
    gauge.append(gH, gO, gX); gauge.hidden = true; document.body.appendChild(gauge);

    ui.section('Below ground');
    const tTun = ui.toggle('Tunnels (modelled levels)', on, v => { tunnels.visible = v; });
    const tUnd = ui.toggle('Basements, indoor levels, slabs', on, v => { under.visible = v; });
    const tGauge = ui.toggle('Depth gauge (right edge)', false, v => showGauge(v));
    const sCut = ui.slider('', -40, OFF, 1, OFF, v => setCut(v >= OFF ? OFF : v));
    const sl = (name, k, lo, hi, step, fmt, re) => ui.slider('', lo, hi, step, P[k], (v, t) => { P[k] = v; t.textContent = name + ': ' + fmt(v); later(re, k === 'storey' ? 'u' : 't'); });
    const sSt = sl('Storey height (basements, indoor levels)', 'storey', 2.5, 6, 0.1, v => v + ' m', rebuildUnder);
    const sDm = sl('Tunnel dip below the line between measured points', 'dmax', 0, 30, 0.5, v => v + ' m', rebuildTunnels);
    const sGr = sl('Max gradient 1 in', 'grad', 20, 100, 5, v => String(v), rebuildTunnels);
    const sDd = sl('Depth of tunnels with no measured point', 'ddeep', 5, 45, 1, v => v + ' m', rebuildTunnels);
    sSt.label.textContent = 'Storey height (basements, indoor levels): ' + P.storey + ' m'; sDm.label.textContent = 'Tunnel dip below the line between measured points: ' + P.dmax + ' m';
    sGr.label.textContent = 'Max gradient 1 in ' + P.grad; sDd.label.textContent = 'Depth of tunnels with no measured point: ' + P.ddeep + ' m';
    ui.note('Tunnel levels are modelled between known levels: portals and open cuts (LiDAR) and published station levels. Basements: OSM and Wikidata storey counts × the storey height. The cut removes everything above the level; ground, greens and water stay faint. <a href="https://github.com/danbri/londat/blob/main/cwplans/docklands/README.md">README, "Tunnel model"</a>');

    function setCut(v, from) {
      CUT = v >= OFF ? OFF : Math.max(G_BOT, Math.round(v)); const cutOn = CUT < OFF;
      UN.cut.value = cutOn ? CUT : 1e9; faint(cutOn); dock.visible = back.visible = cutOn;
      const t = gPos(CUT); gH.style.top = gO.style.top = (t * 100) + '%'; gO.textContent = cutOn ? `${CUT} m OD` : 'cut off';
      gauge.setAttribute('aria-valuenow', String(CUT)); gauge.setAttribute('aria-valuetext', gO.textContent);
      if (from !== 'slider') sCut.input.value = CUT; sCut.label.textContent = 'Cut away above: ' + (cutOn ? CUT + ' m OD' : 'off');
      stats.cut = cutOn ? CUT : null; syncNight(); draw();
    }
    function showGauge(v) { gauge.hidden = !v; tGauge.checked = v; if (!v && CUT < OFF) setCut(OFF); draw(); }
    sCut.input.oninput = () => { setCut(+sCut.input.value, 'slider'); if (CUT < OFF && gauge.hidden) showGauge(true); };
    const gaugeTo = e => { const r = gauge.getBoundingClientRect(), t = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); setCut(gVal(t)); };
    gauge.addEventListener('pointerdown', e => { if (e.target === gX) return; gauge.setPointerCapture(e.pointerId); gaugeTo(e); e.stopPropagation(); });
    gauge.addEventListener('pointermove', e => { if (gauge.hasPointerCapture(e.pointerId)) gaugeTo(e); });
    gauge.addEventListener('keydown', e => { const d = { ArrowUp: 2, ArrowDown: -2, PageUp: 10, PageDown: -10 }[e.key]; if (d == null) return; e.preventDefault(); let v = CUT; v = v >= OFF ? (d < 0 ? G_TOP : OFF) : v + d; setCut(v > G_TOP ? OFF : Math.max(G_BOT, v)); });
    gX.addEventListener('pointerdown', e => e.stopPropagation());
    gX.onclick = e => { e.stopPropagation(); showGauge(false); };

    // the "Underground" view: a button beside main.js's views (main.js VIEWS.under sets no cut), and the cut of each
    // view as on the WebGL page (under: 2 m OD; every other view: off)
    const views = document.querySelector('#drawer .views');
    if (views && !views.querySelector('[data-view=under]')) { const b = document.createElement('button'); b.dataset.view = 'under'; b.textContent = 'Underground'; b.setAttribute('aria-pressed', 'false'); b.onclick = () => globalThis.__docklands3?.setView('under'); views.insertBefore(b, views.children[2] || null); }
    document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-view]'); if (!b) return; const u = b.dataset.view === 'under'; setCut(u ? 2 : OFF); showGauge(u); });

    // start: ?cut= wins; else ?view=under gives 2 m OD
    const qc = parseFloat(qs.get('cut'));
    if (isFinite(qc) && qc < OFF) { setCut(qc); showGauge(true); } else if (qs.get('view') === 'under') { setCut(2); showGauge(true); } else setCut(OFF);
    tunnels.visible = tTun.checked; under.visible = tUnd.checked;

    return {
      object: group, ownUi: true, stats, setCut, showGauge, cutLevel: () => CUT, gaugeOn: () => !gauge.hidden,   // main.js spreads this object: no getters
      setVisible(v) { group.visible = v; draw(); },
    };
  },
};
