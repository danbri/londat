// Plotter SVG (layer "plotter") of the Three.js port: an SVG of the current view for a pen plotter (the owner's iDraw 2.0
// A3), lines only, hidden lines removed, one numbered pen layer per kind of line, mm on A4/A3/A2 paper, the credit in
// single-stroke text. The method is the WebGL page's own file, ../cwplans/docklands/plotter-svg.js, loaded unchanged: it
// rebuilds the edges from area.js and towers.json and removes hidden lines with a CPU z-buffer of the same solids. This
// module gives it its context (DocklandsPlotCtx): the three.js camera as a WebGL-convention MVP (clip z from -w to w,
// also on the WebGPU backend), the tower records, the skyline heights (ctx.buildOpts.heightOf), the cut of
// layers/under.js and the tunnel model (drone.js tunnelY). Menu: "Plotter SVG of this view" + paper. Test hook:
// globalThis.DocklandsPlot.make({ paper, minMm }) -> { svg, stats, ms, raster, occluders, paper }.
// Skill: docklands-3d-page, "Plotter SVG" and "Three.js port".
import { tunnelY, parOf } from './drone.js';

const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(src + ' did not load')); document.head.appendChild(s); });

export default {
  id: 'plotter', label: null, on: true, reveal: false,
  async init(ctx) {
    const { THREE, camera, renderer, A, qs, ui } = ctx, $ = id => document.getElementById(id);
    // plotter-svg.js measures the canvas #c (its CSS size sets the raster); the port's canvas has no id
    if (!$('c')) renderer.domElement.id = 'c';
    let TOWERS = null, towerOf = new Map();
    if (ctx.flag('towers', true)) await ctx.loadJSON(ctx.DATA + 'towers.json').then(T => { TOWERS = Object.values(T.buildings).filter(t => t.tiers && t.tiers.length && t.status === 'fitted'); for (const t of TOWERS) for (const mi of t.model_buildings) towerOf.set(mi, t); }).catch(e => console.warn('plotter: towers', e));
    const layer = id => globalThis.__docklands3?.layers?.[id];
    const cutLevel = () => { const L = layer('under'); return L && L.api && L.api.cutLevel ? L.api.cutLevel() : 250; };
    // the camera in the WebGL convention (the WebGL page's MVP): a copy with the WebGL coordinate system
    const cam2 = new THREE.PerspectiveCamera(), mvp = new THREE.Matrix4();
    function MVP() {
      camera.updateMatrixWorld(); cam2.copy(camera); cam2.coordinateSystem = THREE.WebGLCoordinateSystem; cam2.updateProjectionMatrix();
      return mvp.multiplyMatrices(cam2.projectionMatrix, camera.matrixWorldInverse).elements;
    }
    // paths with a level (layer 6) and station edges (layer 7) follow these switches in plotter-svg.js: mirror the port's layers
    const hidden = id => { let i = $(id); if (!i) { i = document.createElement('input'); i.type = 'checkbox'; i.id = id; i.hidden = true; document.body.appendChild(i); } return i; };
    const syncSwitches = () => { const U = layer('under'), St = layer('stations'); hidden('showUnder').checked = !!(U && U.on && U.api?.object?.visible !== false); hidden('showStations').checked = !!(St && St.on); };
    let toastT = 0; const toastEl = document.createElement('div');
    Object.assign(toastEl.style, { position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(64px + env(safe-area-inset-bottom,0px))', maxWidth: 'calc(100vw - 32px)', background: 'rgba(16,20,24,.95)', color: '#e8ecef', borderRadius: '8px', padding: '8px 12px', zIndex: 8, fontSize: '13px' });
    toastEl.hidden = true; document.body.appendChild(toastEl);
    const toast = t => { toastEl.textContent = t; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, 4000); };
    const PC = {
      A, dec: ctx.dec, earcut: globalThis.earcut && (globalThis.earcut.default || globalThis.earcut), groundAt: ctx.groundAt, tunnelY, toast,
      heightOf: (b, i) => ctx.buildOpts.heightOf ? ctx.buildOpts.heightOf(b, i) : b.h,
      get towerOf() { return towerOf; },
      par: () => ({ ...parOf(qs), cut: cutLevel() }),
      MVP, VZ: () => 1, CAM: () => ({ eye: camera.position.toArray() }),
      TOWERS: () => ('towers' in ctx.buildOpts && !ctx.buildOpts.towers) ? null : TOWERS,   // the skyline years turn the towers off
    };
    globalThis.DocklandsPlotCtx = PC;
    if (!globalThis.DocklandsPlot) await loadScript(ctx.WEBGL + 'plotter-svg.js');
    const P = globalThis.DocklandsPlot; P.init(PC);
    document.querySelectorAll('#plotRow').forEach(r => r.remove());   // plotter-svg.js puts its own row after #shareOut (twice: at load and at init); the port's row is in Share > More
    // its share link: plotter-svg.js asks DocklandsNav.shareUrl(); the port's view link instead
    if (!globalThis.DocklandsNav) globalThis.DocklandsNav = { shareUrl: () => ({ url: location.origin + location.pathname + location.search.replace(/[?&]animate=0/, '') + (globalThis.__docklands3?.shareHash?.() || '') }) };
    const make0 = P.make, make = opts => { syncSwitches(); return make0(opts); };
    P.make = make;   // the test hook (DocklandsPlot.make) syncs the switches too

    // in Views > Share > More (owner, 2026-10-09: "a low profile feature ... submenus under Share for url copy vs export vs print")
    const host = document.getElementById('plotHost') || ui.host();
    const row = document.createElement('label'); row.className = 'row';
    row.innerHTML = '<button type="button" id="plotBtn" style="flex:none;border:1px solid #33404a;background:#1b2229;color:inherit;border-radius:6px;padding:5px 9px;cursor:pointer">Plotter SVG of this view</button><select id="plotPaper" aria-label="Paper size" style="width:auto"><option>A4</option><option selected>A3</option><option value="A2">A2 (larger than an A3 plotter)</option></select>';
    host.appendChild(row);
    $('plotBtn').onclick = () => {
      const paper = $('plotPaper').value || 'A3'; toast('Drawing the plot…');
      setTimeout(() => { try { const r = make({ paper }), url = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' })), a = document.createElement('a');
        a.href = url; a.download = `docklands-plot-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${paper}.svg`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast(`Plotter SVG saved (${paper}, ${Object.values(r.stats).reduce((x, y) => x + y, 0).toLocaleString()} lines, ${(r.svg.length / 1024).toFixed(0)} kB).`);
      } catch (e) { toast('Plot failed: ' + e.message); console.warn('plot', e); } }, 30);
    };
    const pn = document.createElement('p'); pn.className = 'small'; pn.textContent = 'Plotter SVG: lines only, hidden lines removed, one numbered pen layer per kind of line (Inkscape layers "1 Buildings and credit" to "7 Underground"), for the iDraw 2.0 or AxiDraw extension. The orientation follows the screen.'; host.appendChild(pn);
    return { ownUi: true, make, toast };
  },
};
