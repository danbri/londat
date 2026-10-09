// Model settings (layer "model") of the Three.js port: controls of the WebGL page's Layers pane that had no place in the
// port (README "Menu map", rows that said "WebGL only"), ported from https://danbri.github.io/londat/cwplans/docklands/ :
//  - Buildings: Solid, See-through, Hidden (index.html bmodeR / #bmode: 'ghost' draws them at a low alpha with no depth
//    write, 'off' leaves them out); see-through goes through ctx.setBuildingMode, so Floors keeps working.
//  - Show: Detailed models and Roof shapes (index.html buildBld useM, useR): off draws the plain extrusion in place of the
//    glTF model, or a flat roof in place of the roof shape (rebuild of the tiles with ctx.buildOpts).
//  - Ground: Satellite 2026 (index.html setGround 's2'): data/imagery.js, one Sentinel-2 colour per 20 m terrain point,
//    resampled on a canvas into the box of data/tex/textures.json, so the terrain material's ground image shows it;
//    the greens are hidden while it shows (index.html: !satOn).
//  - Show: Windows (index.html showWindows, the facade program's uniform win): materials.js U.win; off leaves the plain wall
//    colour by day (no Map window grid, no Realistic walls) and no lit windows or shopfronts by night; photo facades and
//    the crowns stay.
//  - Vertical exaggeration (index.html Model settings vz, 1 to 5): main.js setVz (a y scale in the camera's world matrix;
//    the scene stays in model metres, so picking, labels and the share hash keep model heights).
//  - Key to colours (index.html <details> "Key to colours"), with the colours of build.js, layers/under.js, walls.js and
//    riverbed.js (the same values as the WebGL page's :root).
// URL: ?bmode=solid|ghost|off, ?models=0, ?roofshapes=0, ?windows=0, ?vz=2, ?ground=s2. Skill: docklands-3d-page, "Three.js port".
import { MFP } from '../build.js';

const KEY = [['#b9bec4', 'Building, LiDAR height (Map look)'], ['#e0b25a', 'Building, OSM levels or newer than LiDAR (Map look)'],
  ['#b05cff', 'Basement (storeys × height)'], ['#e7d6ff', 'Indoor corridor / steps'], ['#d8c49a', 'Outdoor path or steps with a level (decks, bridges)'],
  ['#ff5fa2', 'Shops, rooms, points with a level'], ['#ff8a3d', 'Platform'], ['#c9ced6', 'Jubilee'], ['#9b6cff', 'Elizabeth line'], ['#2cc3b5', 'DLR'],
  ['#ff8a3d', 'Other Overground / rail'], ['#e6e08a', 'Road and foot tunnels'], ['#f9c75a', 'Published slab levels (Crossrail Place)'], ['#3f8fc0', 'Water'],
  ['#e07a3f', 'Tidal flood walls to their crest level (EA)'], ['#2a4a6b', 'Thames riverbed, UKHO soundings in m OD']];

export default {
  id: 'model', label: null, on: true, menu: 'look', reveal: false,
  async init(ctx) {
    const { THREE, qs, meshes: M, buildOpts: O } = ctx, $ = id => document.getElementById(id), S = { bmode: 'solid', models: true, roofs: true, windows: true, ground: null };

    // ---------- Buildings: solid, see-through, hidden
    ctx.ui.section('Buildings');
    const radios = document.createElement('div'); radios.className = 'row'; radios.setAttribute('role', 'radiogroup'); radios.setAttribute('aria-label', 'Buildings');
    for (const [v, t] of [['solid', 'Solid'], ['ghost', 'See-through'], ['off', 'Hidden']]) {
      const l = document.createElement('label'), r = document.createElement('input'); r.type = 'radio'; r.name = 'bmode3'; r.value = v; r.id = 'bmode3-' + v;
      r.onchange = () => setBmode(v); l.append(r, ' ' + t); l.style.marginRight = '10px'; radios.appendChild(l);
    }
    ctx.ui.host().appendChild(radios);
    function setBmode(v) {
      if (!['solid', 'ghost', 'off'].includes(v)) v = 'solid'; S.bmode = v; const r = $('bmode3-' + v); if (r) r.checked = true;
      ctx.setBuildingMode(v === 'ghost' ? 'ghost' : 'solid', 'model');
      M.buildings.visible = v !== 'off'; M.models.visible = v !== 'off' && S.models; ctx.draw();
    }

    // ---------- Show: detailed models, roof shapes (a rebuild of the tiles; buildOpts keys restored as they were)
    let modelIdx = null;
    const loadModels = () => modelIdx || (modelIdx = ctx.loadJSON(ctx.DATA + 'building-models.json').then(J => {
      const s = new Set(); for (const m of Object.values(J.models || {})) if (m.model_fp === MFP && m.mi) for (const i of m.mi) s.add(i); return s;
    }).catch(() => new Set()));
    // the page skips a building drawn by its glTF model (main.js skip); a layer that sets buildOpts.skip (piers) replaces that
    // set, so this wrapper adds the model buildings back while the models show, and leaves them in when they do not
    const prevSkip = O.skip, mi = await loadModels();
    O.skip = { has: i => (S.models && mi.has(i)) || !!(prevSkip && prevSkip.has(i)), get size() { return (S.models ? mi.size : 0) + (prevSkip ? prevSkip.size : 0); } };
    const roofsSaved = { had: 'roofs' in O, v: O.roofs };
    const tModels = ctx.ui.toggle('Detailed models (glTF)', true, v => { S.models = v; M.models.visible = v && S.bmode !== 'off'; ctx.rebuildBuildings(); });
    const tRoofs = ctx.ui.toggle('Roof shapes', true, v => { S.roofs = v; if (v) { if (roofsSaved.had) O.roofs = roofsSaved.v; else delete O.roofs; } else O.roofs = null; ctx.rebuildBuildings(); });
    // Windows (a uniform: no rebuild)
    const setWindows = v => { S.windows = !!v; ctx.U.win.value = v ? 1 : 0; tWin.checked = !!v; ctx.draw(); };
    const tWin = ctx.ui.toggle('Windows', true, v => setWindows(v)); tWin.id = 'showWindows3';

    // ---------- Ground: Satellite 2026 (data/imagery.js), an option of Look > Ground
    const sel = $('ground'), credit = document.createElement('span');
    $('credit')?.appendChild(credit);
    let satTex = null, satNote = null;
    async function satellite() {
      if (satTex) return satTex;
      if (!globalThis.DOCKLANDS_IMAGERY) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = ctx.WEBGL + 'data/imagery.js'; s.onload = ok; s.onerror = () => no(new Error('data/imagery.js did not load')); document.head.appendChild(s); });
      const I = globalThis.DOCKLANDS_IMAGERY, T = ctx.A.terrain, rgb = Uint8Array.from(atob(I.rgb), c => c.charCodeAt(0));
      const box = (await ctx.loadJSON(ctx.DATA + 'tex/textures.json').catch(() => null))?.box;
      // the canvas covers the ground image box (the terrain uv); each pixel takes the bilinear colour of the four grid points round it
      const B = box && box.x1 > box.x0 ? box : { x0: T.x0, z0: T.z0, x1: T.x0 + (T.nx - 1) * T.cell, z1: T.z0 + (T.nz - 1) * T.cell };
      const W = 1504, H = Math.round(W * (B.z1 - B.z0) / (B.x1 - B.x0)), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d'), im = g.createImageData(W, H), d = im.data, nx = I.nx || T.nx, nz = I.nz || T.nz, cell = I.cell || T.cell;
      for (let y = 0; y < H; y++) { const z = B.z0 + (y + .5) / H * (B.z1 - B.z0), fj = Math.max(0, Math.min(nz - 1.001, (z - T.z0) / cell)), j = Math.floor(fj), tj = fj - j;
        for (let x = 0; x < W; x++) { const X = B.x0 + (x + .5) / W * (B.x1 - B.x0), fi = Math.max(0, Math.min(nx - 1.001, (X - T.x0) / cell)), i = Math.floor(fi), ti = fi - i, o = 4 * (y * W + x);
          for (let c = 0; c < 3; c++) { const a = rgb[3 * (j * nx + i) + c], b = rgb[3 * (j * nx + i + 1) + c], e = rgb[3 * ((j + 1) * nx + i) + c], f = rgb[3 * ((j + 1) * nx + i + 1) + c];
            d[o + c] = (a * (1 - ti) + b * ti) * (1 - tj) + (e * (1 - ti) + f * ti) * tj; }
          d[o + 3] = 255; } }
      g.putImageData(im, 0, 0);
      satTex = new THREE.CanvasTexture(cv); satTex.colorSpace = THREE.SRGBColorSpace; satTex.anisotropy = 8; satTex.userData.attribution = I.attribution; satTex.userData.date = I.date;
      return satTex;
    }
    function groundNote(t) { if (!satNote) { satNote = document.createElement('p'); satNote.className = 'small'; sel.closest('label')?.after(satNote); } satNote.textContent = t; satNote.hidden = !t; }
    if (sel) {
      const o = document.createElement('option'); o.value = 's2'; o.textContent = 'Satellite 2026'; sel.appendChild(o);
      const prev = sel.onchange;   // main.js setGround for the other images
      sel.onchange = async e => {
        if (sel.value !== 's2') { S.ground = null; M.greens.visible = true; credit.textContent = ''; groundNote(''); return prev && prev.call(sel, e); }
        try { const t = await satellite(); if (sel.value !== 's2') return; M.terrain.material.setGround(t); S.ground = 's2'; M.greens.visible = false;
          credit.textContent = ' · Sentinel-2 ' + t.userData.date; groundNote(t.userData.attribution + '. One colour per 20 m terrain point.'); ctx.draw(); }
        catch (err) { console.warn('satellite', err); groundNote('The satellite colours did not load: ' + err.message); sel.value = 'none'; prev && prev.call(sel, e); }
      };
    }

    // ---------- Key to colours
    ctx.ui.note('<details><summary>Key to colours</summary>' + KEY.map(([c, t]) => `<span style="display:inline-flex;align-items:center;gap:6px;margin:2px 12px 2px 0"><i style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${c}"></i>${t}</span>`).join('') +
      '<br>The Realistic look (on by default) colours the buildings by their materials; Look > Colour buildings by puts a data colour on them.</details>');

    // ---------- Model settings: vertical exaggeration (index.html #vz: "for the terrain; buildings are measured")
    ctx.ui.section('Model settings');
    const vzOut = v => `Vertical exaggeration: ${v}× (for the terrain; buildings are measured)`;
    const vz = ctx.ui.slider(vzOut(1), 1, 5, 0.5, 1, (v, t) => { t.textContent = vzOut(v); ctx.setVz(v); });
    vz.input.id = 'vz3'; vz.input.setAttribute('aria-label', 'Vertical exaggeration');
    const syncVz = () => { const v = ctx.vz || 1; vz.input.value = v; vz.label.textContent = vzOut(v); };

    // ---------- start state from the URL
    if (qs.get('models') === '0') { tModels.checked = false; S.models = false; M.models.visible = false; }
    if (qs.get('roofshapes') === '0') { tRoofs.checked = false; S.roofs = false; O.roofs = null; }
    if (/^(0|off|no|false)$/i.test(qs.get('windows') || '')) setWindows(false);
    syncVz();   // main.js has applied ?vz= before the layers load
    if (!S.models || !S.roofs) ctx.rebuildBuildings();
    setBmode(qs.get('bmode') || 'solid');
    if (qs.get('ground') === 's2' && sel) { sel.value = 's2'; sel.onchange(new Event('change')); }

    const api = { ownUi: true, get state() { return { ...S, vz: ctx.vz }; }, setBmode, setWindows, setVz: v => { ctx.setVz(v); syncVz(); }, satellite, stats: { modelBuildings: mi.size } };
    globalThis.__docklandsModel = api;
    return api;
  },
};
