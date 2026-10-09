// Music (layer "music") of the Three.js port: the buildings as a visualiser, ported from the WebGL page (index.html AUD,
// vizBands, the facade vertex shader's viz branch). A Web Audio analyser gives 24 log-spaced bands (40 Hz to 14 kHz, slow
// automatic gain per band); each building follows the band of its centre's x across the estate box (A.meta.focus; west
// bass, east treble; fading out 150 to 700 m outside the box): it stretches up from its base, turns about its own centre
// and sways (stretch, swirl, noise). The vertex offset is a TSL positionNode (vizPosition below) on the building material,
// from the vertex attribute gk = [centre x, centre z, base m OD, kind] of build.js; shadows follow it. The WebGL page moves
// the splat towers in its map style and the buildings in pixel art; the port has no splats, so the buildings move.
// Sources: the three CC BY 3.0 tracks of ../cwplans/docklands/data/music.json (Wikimedia Commons, credit shown while it
// plays), the visitor's own file (plays only in the browser), or the microphone (nothing recorded or sent).
// Phones: the AudioContext is made and resumed, and play() called, inside the tap handler before any await; the file
// button unlocks sound in its own tap; iOS: navigator.audioSession.type = 'playback'.
// Test hook: __docklands3.layers.music.api (start(source), stop(), bands, state, setBands(array)).
// Skill: docklands-3d-page, "Music and phone audio" and "Three.js port".
import * as THREE from 'three/webgpu';
import { Fn, attribute, positionLocal, uniform, uniformArray, float, int, vec2, vec3, clamp, max, smoothstep, sin, cos, time } from 'three/tsl';

const NB = 24, SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=', F = globalThis.DOCKLANDS_AREA.meta.focus;
export const MU = {
  viz: uniform(0),                                          // 0: off (the identity), 1: on
  bands: uniformArray(new Array(NB).fill(0), 'float'),      // 0 to 1, west (bass) to east (treble)
  box: uniform(new THREE.Vector4(F.x0, F.x1, F.z0, F.z1)),  // the estate box (A.meta.focus): x0, x1, z0, z1
  k: uniform(new THREE.Vector3(0.8, 0.35, 0.5)),            // stretch, noise, swirl (the WebGL page's defaults)
};

// the facade vertex shader's viz branch (index.html fvs), in TSL: a position in model metres (the building tiles sit at
// the origin, so local = world)
export const vizPosition = () => Fn(() => {
  const p = positionLocal, g = attribute('gk', 'vec4'), B = MU.box, K = MU.k;
  const bi = int(clamp(g.x.sub(B.x).div(B.y.sub(B.x)), 0, 0.9999).mul(NB));
  const o = max(max(B.x.sub(g.x), g.x.sub(B.y)), max(B.z.sub(g.y), g.y.sub(B.w)));
  const b = MU.bands.element(bi).mul(float(1).sub(smoothstep(150, 700, o))).mul(MU.viz);
  const h = max(0, p.y.sub(g.z)), qy = g.z.add(h.mul(float(1).add(K.x.mul(1.6).mul(b))));
  const an = K.z.mul(b).mul(h).div(140), cs = cos(an), sn = sin(an), d = p.xz.sub(g.xy);
  const dr = vec2(cs.mul(d.x).sub(sn.mul(d.y)), sn.mul(d.x).add(cs.mul(d.y)));
  const w = K.y.mul(b).mul(h).mul(0.03).mul(sin(time.mul(3).add(g.x.mul(0.05)).add(h.mul(0.06))));
  const q = g.xy.add(dr).add(vec2(w, w.mul(0.6)));
  return vec3(q.x, qy, q.y);
})();

export default {
  id: 'music', label: null, on: true, reveal: false,
  async init(ctx) {
    const { camera, controls, ui, draw, esc } = ctx, $ = id => document.getElementById(id);
    // the vertex offset on the building material (one material for every tile, main.js bmat); identity while MU.viz is 0
    const bmat = ctx.meshes.buildings.children[0]?.material;
    if (bmat && !bmat.positionNode) { bmat.positionNode = vizPosition(); bmat.needsUpdate = true; }
    const VIZ = { on: false, bands: new Float32Array(NB), peak: new Float32Array(NB).fill(.3), orbit: true };
    const AUD = { ctx: null, an: null, el: null, src: null, mic: null, data: null, list: null, state: null, title: '', tk: 0 };
    ctx.loadJSON(ctx.DATA + 'music.json').then(m => { AUD.list = m.tracks; sel.innerHTML = m.tracks.map((t, i) => `<option value="${i}">${esc(t.title)} (${esc(t.artist)})</option>`).join('') + '<option value="mic">Microphone</option>'; })
      .catch(() => { sel.innerHTML = '<option value="mic">Microphone</option>'; });

    function vizBands() {
      const an = AUD.an, d = AUD.data, sr = AUD.ctx.sampleRate, nb = d.length, hz = i => i * sr / 2 / nb; an.getByteFrequencyData(d);
      for (let k = 0; k < NB; k++) {
        const f0 = 40 * Math.pow(14000 / 40, k / NB), f1 = 40 * Math.pow(14000 / 40, (k + 1) / NB); let s = 0, c = 0;
        for (let i = Math.floor(f0 / hz(1)); i <= Math.ceil(f1 / hz(1)) && i < nb; i++) { s += d[i]; c++; }
        const v = c ? s / c / 255 : 0; VIZ.peak[k] = Math.max(v, VIZ.peak[k] * .995, .12);
        VIZ.bands[k] = VIZ.bands[k] * .45 + .55 * Math.pow(Math.min(1, v / VIZ.peak[k]), 1.6);
      }
      MU.bands.array.splice(0, NB, ...VIZ.bands);
    }
    // each frame while it plays: the bands, the time in the mini bar, a slow orbit of the camera (not while the drone flies)
    ctx.onFrame(() => {
      if (!VIZ.on) return;
      // a style that swaps the building material (styles.js pixel art, line drawing) gets the offset too, once
      const cm = ctx.meshes.buildings.children[0]?.material; if (cm && !cm.positionNode && !cm.isShadowMaterial) { cm.positionNode = vizPosition(); cm.needsUpdate = true; }
      if (AUD.an && !VIZ.hold) vizBands();
      if (AUD.state === 'playing' && AUD.el && !AUD.mic && ++AUD.tk % 30 === 0) { const t = AUD.el.currentTime | 0; miniT.textContent = `♫ ${AUD.title} · ${t / 60 | 0}:${String(t % 60).padStart(2, '0')}`; }
      if (VIZ.orbit && controls.enabled) { const o = camera.position.clone().sub(controls.target); o.applyAxisAngle(new ctx.THREE.Vector3(0, 1, 0), .0016); camera.position.copy(controls.target).add(o); camera.lookAt(controls.target); }
      draw();
    });
    // Phones allow sound only as the direct result of a tap: make and resume the context and call play() in the tap handler
    function audioCtx() {
      if (!AUD.ctx) { try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* not supported */ }
        AUD.ctx = new (window.AudioContext || window.webkitAudioContext)(); AUD.an = AUD.ctx.createAnalyser(); AUD.an.fftSize = 2048; AUD.an.smoothingTimeConstant = .7; AUD.data = new Uint8Array(AUD.an.frequencyBinCount); AUD.an.connect(AUD.ctx.destination);
        AUD.el = new Audio(); AUD.el.crossOrigin = 'anonymous'; AUD.el.loop = true; AUD.el.playsInline = true; AUD.ctx.createMediaElementSource(AUD.el).connect(AUD.an); }
      if (AUD.ctx.state !== 'running') AUD.ctx.resume().catch(() => {});
      return AUD.ctx;
    }
    function mini(state, title) {
      if (!state) { bar.style.display = 'none'; AUD.state = null; return; } bar.style.display = 'flex'; if (title != null) AUD.title = title;
      miniB.textContent = state === 'blocked' ? '▶' : '■'; miniB.setAttribute('aria-label', state === 'blocked' ? 'Play the sound' : 'Stop the music');
      miniT.textContent = state === 'blocked' ? `♫ ${AUD.title}: tap ▶ for sound` : state === 'loading' ? `♫ ${AUD.title} · loading…` : `♫ ${AUD.title}`; AUD.state = state;
    }
    function playEl(url, title, credit) {   // inside a tap
      audioCtx(); stopSources(); AUD.el.src = url; AUD.el.currentTime = 0;
      const p = AUD.el.play(); mini('loading', title);
      note.innerHTML = credit || 'Your file plays only in this browser; nothing is uploaded.';
      return p.then(() => { if (VIZ.on) mini('playing'); return true; }, () => { mini('blocked'); return false; });
    }
    function stopSources() { if (AUD.mic) { AUD.mic.getTracks().forEach(t => t.stop()); AUD.mic = null; } if (AUD.src) { AUD.src.disconnect(); AUD.src = null; } }
    // a source: a track index, 'mic', or (tests) an AudioNode to analyse, e.g. an OscillatorNode
    async function start(v = sel.value) {
      audioCtx(); VIZ.hold = false;
      // as the WebGL page: in the map style the splat towers follow the bands, so music switches splats to "only" (pixel art moves the buildings
      // instead); after audioCtx(), so the phone rule (context made in the tap, before any await) holds
      { const SP = globalThis.__docklands3 && __docklands3.layers && __docklands3.layers.splats && __docklands3.layers.splats.api, st = new URLSearchParams(location.search).get('style');
        if (SP && SP.setMode && SP.mode !== 'only' && st !== 'pixel') SP.setMode('only'); }
      if (v === 'mic') { stopSources(); if (AUD.el) AUD.el.pause(); mini('loading', 'Microphone'); AUD.mic = await navigator.mediaDevices.getUserMedia({ audio: true }); AUD.src = AUD.ctx.createMediaStreamSource(AUD.mic); AUD.src.connect(AUD.an); AUD.an.disconnect(); note.textContent = 'Listening to the microphone (nothing is recorded or sent).'; }
      else if (v && typeof v === 'object' && v.connect) { stopSources(); if (AUD.el) AUD.el.pause(); AUD.src = v; v.connect(AUD.an); AUD.an.disconnect(); mini('loading', 'Test tone'); }
      else { const t = AUD.list && AUD.list[+v]; if (!t) throw new Error('no track list'); AUD.an.disconnect(); AUD.an.connect(AUD.ctx.destination); playEl(t.url, t.title, `“${esc(t.title)}” by ${esc(t.artist)}, ${esc(t.licence)}, <a href="${esc(t.page)}" target="_blank" rel="noopener">${esc(t.source)}</a>.`); }
      on();
    }
    function on() {
      VIZ.on = true; MU.viz.value = 1; go.textContent = '■ Stop'; if (AUD.state === 'loading' && (AUD.mic || AUD.src || (AUD.el && !AUD.el.paused))) mini('playing');
      const D = globalThis.__docklands3; if (D && controls.enabled && camera.position.distanceTo(controls.target) > 2500) D.setView('cw'); draw();
    }
    function stop() { VIZ.on = false; VIZ.bands.fill(0); MU.bands.array.fill(0); MU.viz.value = 0; if (AUD.el) AUD.el.pause(); stopSources(); if (AUD.an && AUD.ctx) { AUD.an.disconnect(); AUD.an.connect(AUD.ctx.destination); } go.textContent = '▶ Play'; mini(null); draw(); }

    // ---------- UI: a few controls in the menu, and the mini bar (title, time, stop) on the map while it plays
    ui.section('Music');
    const row = document.createElement('label'); row.className = 'row';
    const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Track'); sel.innerHTML = '<option value="">Loading the track list…</option>'; sel.style.flex = '1';
    const go = document.createElement('button'); go.type = 'button'; go.textContent = '▶ Play'; Object.assign(go.style, { flex: 'none', border: '1px solid #33404a', background: '#1b2229', color: 'inherit', borderRadius: '6px', padding: '5px 9px', cursor: 'pointer' });
    row.append(sel, go); ui.host().appendChild(row);
    const frow = document.createElement('label'); frow.className = 'row'; frow.style.cursor = 'pointer';
    const file = document.createElement('input'); file.type = 'file'; file.accept = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac'; file.hidden = true;
    frow.append('♫ Play your own file…', file); ui.host().appendChild(frow);
    const sl = (name, i, v) => ui.slider(name, 0, 2, .05, v, x => { MU.k.value.setComponent(i, x); });
    sl('Stretch', 0, .8); sl('Noise', 1, .35); sl('Swirl', 2, .5);
    ui.toggle('Orbit the camera', true, v => { VIZ.orbit = v; });
    const note = ui.note('Each building follows one of 24 frequency bands, west (bass) to east (treble): it stretches, turns and sways.');
    const bar = document.createElement('div'), miniT = document.createElement('span'), miniB = document.createElement('button');
    Object.assign(bar.style, { position: 'fixed', left: '50%', transform: 'translateX(-50%)', top: 'calc(14px + env(safe-area-inset-top,0px))', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16,20,24,.92)', borderRadius: '18px', padding: '4px 6px 4px 12px', zIndex: 5, fontSize: '12px', maxWidth: 'calc(100vw - 140px)', whiteSpace: 'nowrap', overflow: 'hidden' });
    Object.assign(miniB.style, { width: '30px', height: '30px', borderRadius: '50%', border: 0, background: '#2a3138', color: '#e8ecef', cursor: 'pointer', flex: 'none' });
    miniB.type = 'button'; bar.append(miniT, miniB); bar.style.display = 'none'; bar.setAttribute('role', 'status'); document.body.appendChild(bar);
    miniB.onclick = () => { if (AUD.state === 'blocked') { audioCtx(); AUD.el.play().then(() => mini(VIZ.on ? 'playing' : 'loading'), () => mini('blocked')); } else stop(); };
    go.onclick = () => VIZ.on ? stop() : start().catch(e => { console.warn('music', e); note.textContent = 'Music did not start: ' + e.message; stop(); });
    // the file button: unlock sound in the tap that opens the picker; the choice arrives later, outside the tap
    frow.addEventListener('click', () => { audioCtx(); if (AUD.el.paused && !AUD.el.src) { AUD.el.src = SILENT; AUD.el.play().then(() => AUD.el.pause(), () => {}); } });
    file.onchange = () => { const f = file.files[0]; file.value = ''; if (!f) return; audioCtx(); AUD.an.disconnect(); AUD.an.connect(AUD.ctx.destination); playEl(URL.createObjectURL(f), f.name.replace(/\.[a-z0-9]+$/i, '')); on(); };

    return {
      ownUi: true, start, stop, MU,
      setBands(a) { VIZ.on = true; VIZ.hold = true; MU.viz.value = 1; for (let k = 0; k < NB; k++) MU.bands.array[k] = a[k] ?? 0; draw(); },
      get bands() { return Array.from(VIZ.bands, x => +x.toFixed(3)); }, get on() { return VIZ.on; },
      get state() { return AUD.ctx ? { ctx: AUD.ctx.state, paused: AUD.el ? AUD.el.paused : null, t: AUD.el ? +AUD.el.currentTime.toFixed(1) : 0, state: AUD.state } : null; },
      get audio() { return AUD.ctx; },
    };
  },
};
