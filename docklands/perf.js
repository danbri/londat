// Frame times of the Three.js port (docklands/), for every style (OKR KR3.1: frame times on phones,
// https://github.com/danbri/londat/blob/main/OKRS.md). main.js calls it from the render loop:
//  - raf(): each animation-loop callback; camera(now): compares the camera's world and projection matrices with the last
//    drawn frame (every mover is covered: gestures, momentum, the wheel, fly-to, the drone, setCam, a resize); drawn(time, ms)
//    after pipe.render(). A frame time is the interval between two drawn frames of consecutive callbacks (a skipped callback
//    breaks the chain, so a page that draws on demand reports only its continuous runs). GPU timer queries are not available
//    everywhere, so this is the requestAnimationFrame interval: it includes the GPU work only when the GPU is the bottleneck.
//  - moving: the camera changed in the last `settleMs` (200 ms). A style can draw a cheaper tier while moving and its full
//    detail once still (styles.js, Painted); `holdMs` lets a style redraw a still view at most that often (Painted: 100 ms).
//  - the readout (?fps=1, Menu > About > "Frame times on the map"; top left under the time wheels, clear of the notes): median and 95th percentile of the frame time over the
//    last 2 s, frames a second, the style and its tier; hidden with the labels off unless ?fps=1 is in the URL. A short
//    text for screen readers (not a live region: it changes twice a second) and the machine interface: stats() here,
//    __docklands3.perf, and docklands.perf() (api.js).
// Skill: docklands-3d-page, "Three.js port: Painted style, snappier (2026-10-12)".
const WIN = 2000;
const q = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null;
const r1 = v => v == null ? null : Math.round(v * 10) / 10;

export function makePerf({ camera, backend, draw, qs }) {
  const rec = [];   // drawn frames of the last WIN ms: { t, dt (null when not consecutive), ms (CPU time to submit), tier, moving }
  let n = 0, drewAt = -1, lastMove = -1e9, lastDraw = -1e9, settleTimer = 0, box = null, sr = null, shown = false, tick = 0;
  const prev = new Float64Array(32); let havePrev = false;
  const P = {
    style: 'map', tier: 'full', settleMs: 200, holdMs: 0, wantSettle: false, changes: 0,
    raf() { n++; },
    // true when the camera changed since the last drawn frame (tolerance 1e-7 of the matrix entries)
    camera(now) {
      const a = camera.matrixWorld.elements, b = camera.projectionMatrix.elements; let moved = !havePrev;
      for (let i = 0; i < 16 && !moved; i++) if (Math.abs(a[i] - prev[i]) > 1e-7 * (1 + Math.abs(a[i])) || Math.abs(b[i] - prev[16 + i]) > 1e-7 * (1 + Math.abs(b[i]))) moved = true;
      if (moved) { for (let i = 0; i < 16; i++) { prev[i] = a[i]; prev[16 + i] = b[i]; } havePrev = true; lastMove = now; P.changes++;
        // a page that draws on demand gets one more frame when the camera has been still for settleMs: the full-detail frame
        if (P.wantSettle) { clearTimeout(settleTimer); settleTimer = setTimeout(draw, P.settleMs + 20); } }
      return moved;
    },
    get moving() { return performance.now() - lastMove < P.settleMs; },
    get stillFor() { return performance.now() - lastMove; },
    // a style's request: while the camera is still, redraw at most every holdMs (draw() requests still draw at once)
    hold(now) { return P.holdMs > 0 && now - lastMove >= P.settleMs && now - lastDraw < P.holdMs; },
    drawn(t, ms, now) {
      const dt = drewAt === n - 1 ? t - P._t : null; drewAt = n; P._t = t; lastDraw = now;
      rec.push({ t, dt, ms, tier: P.tier, moving: now - lastMove < P.settleMs });
      while (rec.length && t - rec[0].t > WIN) rec.shift();
    },
    _t: 0,
    reset() { rec.length = 0; },   // after a tier change: the next measure is of the new tier only
    frames() { return rec.map(r => ({ ...r })); },   // the drawn frames of the last 2 s (tests: paint-check.mjs)
    get lastMove() { return lastMove; },
    // the numbers: frame time (ms) median and 95th percentile over the last 2 s, frames a second from them, the CPU time to
    // submit a frame, the drawn frames a second, the style and tier, moving or still
    stats(o = {}) {
      const since = Math.max(o.since || 0, performance.now() - WIN), R = rec.filter(r => r.t >= since && (o.moving == null || r.moving === o.moving));
      const d = R.map(r => r.dt).filter(v => v != null).sort((x, y) => x - y), c = R.map(r => r.ms).sort((x, y) => x - y);
      const med = q(d, 0.5), p95 = q(d, 0.95), span = R.length > 1 ? R[R.length - 1].t - R[0].t : 0;
      const s = { backend, style: P.style, tier: P.tier, moving: P.moving, window_ms: WIN, samples: d.length,
        frame_ms: { median: r1(med), p95: r1(p95) }, fps: { median: med ? r1(1000 / med) : null, p95: p95 ? r1(1000 / p95) : null },
        drawn_per_s: span > 0 ? r1((R.length - 1) * 1000 / span) : 0, submit_ms: { median: r1(q(c, 0.5)), p95: r1(q(c, 0.95)) }, camera_changes: P.changes };
      s.text = d.length ? `Frame time ${s.frame_ms.median} ms median (${s.fps.median} frames a second), ${s.frame_ms.p95} ms at the 95th percentile, over the last 2 seconds; ${s.style} style, ${s.tier} tier${s.moving ? ', moving' : ''}; ${backend}.`
        : `No continuous frames in the last 2 seconds (the page draws only on a change); ${s.style} style, ${s.tier} tier; ${backend}.`;
      return s;
    },
    get shown() { return shown; },
    show(on) { shown = !!on; ui(); return shown; },
  };
  // ---------- the readout: bottom left, over the frame line; aria-hidden numbers and a screen-reader sentence
  function ui() {
    if (!box) {
      const css = document.createElement('style');
      css.textContent = '#perfBox{position:fixed;left:8px;top:calc(132px + env(safe-area-inset-top,0px));z-index:4;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#e8ecef;background:#0d1013c4;padding:3px 7px;border-radius:5px;pointer-events:none;white-space:pre}' +
        '#perfBox[hidden]{display:none}body.noLabels:not(.perfAsked) #perfBox{display:none}' +
        '#perfSr{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:nowrap!important}';
      document.head.appendChild(css);
      box = document.createElement('div'); box.id = 'perfBox'; box.setAttribute('aria-hidden', 'true'); box.hidden = true;
      sr = document.createElement('p'); sr.id = 'perfSr';
      document.body.append(box, sr);
    }
    box.hidden = !shown; sr.hidden = !shown; clearInterval(tick); if (shown) { paint(); tick = setInterval(paint, 500); }
  }
  function paint() {
    const s = P.stats(), f = s.frame_ms;
    box.textContent = s.samples ? `${f.median} ms  ${s.fps.median} fps  p95 ${f.p95} ms\n${s.style} · ${s.tier}${s.moving ? ' · moving' : ''}` : `still (no redraw)\n${s.style} · ${s.tier}`;
    sr.textContent = s.text;
  }
  // ?fps=1 (asked: shown with the labels off too), else the stored switch (Menu > About)
  const asked = qs.has('fps') && !/^(0|false|off|no)$/i.test(qs.get('fps'));
  let stored = null; try { stored = localStorage.getItem('d3.fps'); } catch { /* no storage */ }
  const chk = document.getElementById('fpsChk');
  if (asked) document.body.classList.add('perfAsked');
  if (chk) { chk.checked = qs.has('fps') ? asked : stored === '1'; chk.onchange = () => { try { localStorage.setItem('d3.fps', chk.checked ? '1' : '0'); } catch { /* no storage */ } P.show(chk.checked); draw(); }; }
  P.show(qs.has('fps') ? asked : stored === '1');
  return P;
}
