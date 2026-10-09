// The time wheels of the Three.js port (docklands/): two looping strips at the top of the screen. The upper one is the time
// of day (24 h; it wraps from 23:59 to 00:00 on the same date; night shading and sunrise and sunset from Astronomy Engine),
// the lower one the day of the year (it wraps from 31 December to 1 January of the same year; month ticks, moon phases,
// and the daily tide range from the tide layer's harmonic prediction, with spring and neap tides marked). Drag or flick
// (with inertia; it snaps to 15 minutes, 5 on a wide screen, or to a day), tap a point to go there, or use the arrow
// keys. "Now" returns to the time now. Owner, 2026-10-09: "Include a looping carousel at top for time of day, time of year."
// Each strip is a canvas drawn only when the clock or the size changes. Skill: docklands-3d-page, "Three.js port".
const AE = globalThis.Astronomy;
const DAY = 864e5, MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
export function londonParts(t) { const p = {}; for (const x of fmt.formatToParts(new Date(t))) p[x.type] = x.value; return { Y: +p.year, M: +p.month, D: +p.day, min: +p.hour * 60 + +p.minute }; }
const pad = n => String(n).padStart(2, '0');
const hhmm = m => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.floor(m % 60))}`;
const yearLen = Y => (Y % 4 === 0 && Y % 100 !== 0) || Y % 400 === 0 ? 366 : 365;
const doyOf = (Y, M, D) => Math.round((Date.UTC(Y, M - 1, D) - Date.UTC(Y, 0, 1)) / DAY);
const dateOf = (Y, doy) => { const d = new Date(Date.UTC(Y, 0, 1) + doy * DAY); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const mod = (a, n) => ((a % n) + n) % n;

const CSS = `#wheels{position:fixed;left:10px;right:10px;top:calc(60px + env(safe-area-inset-top,0px));max-width:760px;margin:0 auto;height:64px;z-index:4;display:flex;gap:4px;user-select:none;-webkit-user-select:none}
#wheels[hidden]{display:none}
#wheels .strips{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
#wheels canvas{flex:1;width:100%;min-height:0;border-radius:8px;touch-action:none;cursor:grab;display:block}
#wheels canvas:focus-visible{outline:2px solid #2cc3b5}
#wheels .side{flex:none;width:46px;display:flex;flex-direction:column;gap:2px}
#wheels .side button{flex:1;border:0;border-radius:8px;background:rgba(16,20,24,.92);color:#e8ecef;font:600 12px system-ui,sans-serif;padding:0;cursor:pointer}
#wheels .side button[aria-pressed=true]{color:#2cc3b5}
body.wheels #rtPanel,body.wheels #findBox,body.wheels #locMsg{top:calc(132px + env(safe-area-inset-top,0px))}
body.wheels #drBar{top:calc(132px + env(safe-area-inset-top,0px))}
body.wheels #isoBtns{margin-top:72px}`;

export function initCarousel(C) {   // C: { clock(), setClock(t), now(), fromLondon, A, tide() -> harmonics | null, predict, flag }
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const box = document.createElement('div'); box.id = 'wheels'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Time wheels');
  box.innerHTML = '<div class="strips"><canvas id="wDay" tabindex="0" role="slider" aria-label="Time of day (London)"></canvas><canvas id="wYear" tabindex="0" role="slider" aria-label="Day of the year"></canvas></div>' +
    '<div class="side"><button type="button" id="wNow" title="Return to the time now">Now</button><button type="button" id="wHide" aria-label="Hide the time wheels" title="Hide the time wheels (Menu > Time shows them again)">&times;</button></div>';
  document.body.appendChild(box);
  const cvD = box.querySelector('#wDay'), cvY = box.querySelector('#wYear');
  const obs = AE ? new AE.Observer(C.A.meta.geo.lat0 + 0.03, C.A.meta.geo.lon0 + 0.07, 10) : null;   // sky3.js: about the middle of the model

  // ---------- sky and tide data, cached by date and by year
  const sunCache = new Map();
  function sunDay(date) {   // altitude every 10 minutes of the London day, sunrise and sunset (minutes)
    if (sunCache.has(date)) return sunCache.get(date);
    const t0 = C.fromLondon(date + 'T00:00'), alt = [];
    if (obs) for (let k = 0; k <= 144; k++) { const tm = AE.MakeTime(new Date(t0 + k * 6e5)), eq = AE.Equator(AE.Body.Sun, tm, obs, true, true); alt.push(AE.Horizon(tm, obs, eq.ra, eq.dec, 'normal').altitude); }
    let rise = null, set = null;
    for (let k = 1; k < alt.length; k++) { const a = alt[k - 1] + 0.833, b = alt[k] + 0.833; if ((a < 0) !== (b < 0)) { const m = (k - 1 + a / (a - b)) * 10; if (b > a) rise ??= m; else set = m; } }
    const r = { alt, rise, set }; if (sunCache.size > 400) sunCache.clear(); sunCache.set(date, r); return r;
  }
  const yearCache = new Map();
  function yearData(Y) {
    if (yearCache.has(Y)) return yearCache.get(Y);
    const r = { moons: [], range: null, spring: [], neap: [] };
    if (AE) { try { let q = AE.SearchMoonQuarter(new Date(Date.UTC(Y, 0, 1) - 8 * DAY)); for (let k = 0; k < 60 && q.time.date.getTime() < Date.UTC(Y + 1, 0, 9); k++) { { const t = q.time.date.getTime(); if (t >= Date.UTC(Y, 0, 1) && t < Date.UTC(Y + 1, 0, 1)) r.moons.push({ q: q.quarter, t }); } q = AE.NextMoonQuarter(q); } } catch (e) { console.warn('wheels: moon', e); } }
    yearCache.set(Y, r); tideYear(Y, r); return r;
  }
  function tideYear(Y, r) {   // the daily range (hourly samples over 25 h), a few weeks at a time so the page stays smooth
    const H = C.tide && C.tide(); if (!H || !C.predict) { if ((r.tries = (r.tries || 0) + 1) < 30) setTimeout(() => tideYear(Y, r), 4000); return; }
    const n = yearLen(Y), range = new Float32Array(n); let d = 0;
    const step = () => { const end = Math.min(n, d + 30);
      for (; d < end; d++) { const t0 = Date.UTC(Y, 0, 1) + d * DAY; let lo = 1e9, hi = -1e9; for (let h = 0; h <= 25; h++) { const v = C.predict(H, t0 + h * 36e5); lo = Math.min(lo, v); hi = Math.max(hi, v); } range[d] = hi - lo; }
      if (d < n) { setTimeout(step, 0); return; }
      r.range = range; const w = 4;
      for (let i = 0; i < n; i++) { let mx = true, mn = true; for (let j = -w; j <= w; j++) { if (!j) continue; const v = range[mod(i + j, n)]; if (v > range[i]) mx = false; if (v < range[i]) mn = false; } if (mx) r.spring.push(i); if (mn) r.neap.push(i); }
      draw(true); };
    setTimeout(step, 0);
  }

  // ---------- state: the value shown (minutes of the day, day of the year, year); during a drag it leads the clock
  let S = null, drag = null, raf = 0, pendingT = null;
  const fromClock = () => { const p = londonParts(C.clock()); S = { Y: p.Y, doy: doyOf(p.Y, p.M, p.D), min: p.min }; };
  const valueT = () => C.fromLondon(`${dateOf(S.Y, Math.round(mod(S.doy, yearLen(S.Y))))}T${hhmm(mod(Math.round(S.min), 1440))}`);
  // the clock follows at most every 60 ms while a finger moves (setClock redraws the sky and the layers); a timer, not a
  // frame callback, so a slow frame cannot apply a stale value late
  let lastSet = 0;
  function apply() { pendingT = valueT(); const now = performance.now(), go = () => { raf = 0; lastSet = performance.now(); if (pendingT != null && isFinite(pendingT)) C.setClock(pendingT); pendingT = null; };
    if (now - lastSet > 60) { clearTimeout(raf); go(); } else if (!raf) raf = setTimeout(go, 60 - (now - lastSet)); }

  // ---------- drawing
  const geom = cv => { const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); } const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return { g, w, h }; };
  const pxHour = w => Math.max(40, Math.min(90, w / 8)), pxDay = w => Math.max(3, Math.min(8, w / 90));
  const skyCol = a => a > 0 ? '#3a5a74' : a > -6 ? '#2b3c55' : a > -12 ? '#1e2739' : '#12161d';
  function pill(g, x, y, text) { g.font = '600 11px system-ui,sans-serif'; const w = g.measureText(text).width + 10; g.fillStyle = '#2cc3b5'; g.beginPath(); g.roundRect(x - w / 2, y, w, 15, 7); g.fill(); g.fillStyle = '#0d1114'; g.textAlign = 'center'; g.fillText(text, x, y + 11); }
  function drawDay() {
    const { g, w, h } = geom(cvD); if (!w) return; const k = pxHour(w) / 60, c = w / 2, date = dateOf(S.Y, mod(Math.round(S.doy), yearLen(S.Y))), sun = sunDay(date), m0 = S.min;
    const at = x => mod(m0 + (x - c) / k, 1440);
    // night shading: one rect per 10-minute bin, drawn in screen space so the wrap needs no special case
    for (let x = 0; x < w;) { const m = at(x), bin = Math.floor(m / 10), next = Math.min(w, x + ((bin + 1) * 10 - m) * k + 0.01); g.fillStyle = sun.alt.length ? skyCol(sun.alt[bin]) : '#1e2739'; g.fillRect(Math.floor(x), 0, Math.ceil(next - x) + 1, h); x = next; }
    g.strokeStyle = '#c9d3db88'; g.fillStyle = '#d9e1e8'; g.font = '10px system-ui,sans-serif'; g.textAlign = 'center'; g.lineWidth = 1;
    const first = Math.floor((m0 - c / k) / 15) * 15;
    for (let m = first; (m - m0) * k + c < w + 15; m += 15) { const x = Math.round((m - m0) * k + c) + .5, hr = mod(m, 1440) % 60 === 0; g.beginPath(); g.moveTo(x, h); g.lineTo(x, h - (hr ? 9 : 4)); g.stroke(); if (hr) g.fillText(pad(mod(m, 1440) / 60), x, 11); }
    g.fillStyle = '#ffb84d'; g.strokeStyle = '#ffb84d';
    g.font = '9px system-ui,sans-serif';
    for (const [m, up] of [[sun.rise, true], [sun.set, false]]) { if (m == null) continue; for (const off of [-1440, 0, 1440]) { const x = (m + off - m0) * k + c; if (x < -30 || x > w + 30) continue;
      g.beginPath(); if (up) { g.moveTo(x - 4, h - 1); g.lineTo(x + 4, h - 1); g.lineTo(x, h - 7); } else { g.moveTo(x - 4, h - 7); g.lineTo(x + 4, h - 7); g.lineTo(x, h - 1); } g.fill(); g.fillText(hhmm(m), x, h - 10); } }
    g.fillStyle = '#2cc3b5'; g.fillRect(Math.round(c) - 1, 0, 2, h); pill(g, c, h - 16, hhmm(mod(Math.round(m0), 1440)));
    cvD.setAttribute('aria-valuetext', `${hhmm(mod(Math.round(m0), 1440))} London${sun.rise != null ? `, sunrise ${hhmm(sun.rise)}, sunset ${hhmm(sun.set ?? 0)}` : ''}`);
  }
  function drawYear() {
    const { g, w, h } = geom(cvY); if (!w) return; const k = pxDay(w), c = w / 2, n = yearLen(S.Y), d0 = S.doy + S.min / 1440, Yd = yearData(S.Y);
    const dx = d => { let v = mod(d - d0 + n / 2, n) - n / 2; return v * k + c; };   // the nearest copy of day d on the loop
    g.fillStyle = '#161c23'; g.fillRect(0, 0, w, h);
    for (let mo = 0; mo < 12; mo++) { const a = doyOf(S.Y, mo + 1, 1), b = mo < 11 ? doyOf(S.Y, mo + 2, 1) : n; if (mo % 2) continue; for (const s of [-n, 0, n]) { const x0 = (a + s - d0) * k + c, x1 = (b + s - d0) * k + c; if (x1 < 0 || x0 > w) continue; g.fillStyle = '#1d242c'; g.fillRect(x0, 0, x1 - x0, h); } }
    if (Yd.range) { let lo = 1e9, hi = -1e9; for (const v of Yd.range) { lo = Math.min(lo, v); hi = Math.max(hi, v); } g.fillStyle = '#2f6f8f99'; for (let d = 0; d < n; d++) { const x = dx(d); if (x < -k || x > w) continue; const bh = 3 + 7 * (Yd.range[d] - lo) / Math.max(.01, hi - lo); g.fillRect(x, h - bh, Math.max(1, k - 1), bh); }
      g.font = '700 9px system-ui,sans-serif'; g.textAlign = 'center'; for (const [list, txt, col] of [[Yd.spring, 'S', '#bfe8ff'], [Yd.neap, 'N', '#9fb0c0']]) { g.fillStyle = col; for (const d of list) { const x = dx(d) + k / 2; if (x > 0 && x < w) g.fillText(txt, x, h - 2); } } }
    g.strokeStyle = '#c9d3db88'; g.fillStyle = '#d9e1e8'; g.font = '10px system-ui,sans-serif'; g.textAlign = 'left';
    for (let mo = 0; mo < 12; mo++) { const x = dx(doyOf(S.Y, mo + 1, 1)); if (x < -40 || x > w) continue; g.beginPath(); g.moveTo(Math.round(x) + .5, 0); g.lineTo(Math.round(x) + .5, h); g.stroke(); g.fillText(MONTHS[mo], x + 3, 11); }
    for (const q of Yd.moons) { const d = (q.t - Date.UTC(S.Y, 0, 1)) / DAY, x = dx(d), y = 17, r = 4; if (x < -6 || x > w + 6) continue;
      g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fillStyle = q.q === 2 ? '#f3efe0' : '#161c23'; g.fill(); g.strokeStyle = '#f3efe0'; g.lineWidth = 1; g.stroke();
      if (q.q === 1 || q.q === 3) { g.beginPath(); g.arc(x, y, r, -Math.PI / 2, Math.PI / 2, q.q === 3); g.closePath(); g.fillStyle = '#f3efe0'; g.fill(); } }
    const day = mod(Math.round(S.doy), n), dd = new Date(Date.UTC(S.Y, 0, 1) + day * DAY), label = `${dd.getUTCDate()} ${MONTHS[dd.getUTCMonth()]} ${S.Y}`;
    g.fillStyle = '#2cc3b5'; g.fillRect(Math.round(c) - 1, 0, 2, h); pill(g, c, h - 16, label);
    cvY.setAttribute('aria-valuetext', `${label} ${S.Y}`);
  }
  // the sky note in Menu > Time: sunrise, sunset, moon
  function note() {
    const el = document.getElementById('skyNote'); if (!el || !S) return;
    const sun = sunDay(dateOf(S.Y, mod(Math.round(S.doy), yearLen(S.Y)))); let moon = '';
    if (AE) { try { const ill = AE.Illumination(AE.Body.Moon, new Date(C.clock())), ph = AE.MoonPhase(new Date(C.clock())); moon = `Moon ${Math.round(ill.phase_fraction * 100)}% lit, ${ph < 180 ? 'waxing' : 'waning'}.`; } catch { /* no moon */ } }
    el.textContent = `${sun.rise != null ? `Sunrise ${hhmm(sun.rise)}, sunset ${sun.set != null ? hhmm(sun.set) : '?'} (London time). ` : ''}${moon}`;
  }
  let shown = '';
  function draw(force) { if (!drag || force) fromClock(); const key = `${S.Y}/${S.doy}/${S.min}/${cvD.clientWidth}`; if (!force && key === shown) return; shown = key; note(); if (box.hidden) return; drawDay(); drawYear(); }

  // ---------- input: drag and flick with inertia, tap to jump, arrow keys
  const ROWS = { day: { cv: cvD, unit: () => pxHour(cvD.clientWidth) / 60, snap: () => pxHour(cvD.clientWidth) >= 80 ? 5 : 15 }, year: { cv: cvY, unit: () => pxDay(cvY.clientWidth), snap: () => 1 } };
  function shift(row, d) { if (row === 'day') S.min = mod(S.min + d, 1440); else S.doy = mod(S.doy + d, yearLen(S.Y)); }
  function snap(row) { const s = ROWS[row].snap(); if (row === 'day') S.min = mod(Math.round(S.min / s) * s, 1440); else S.doy = mod(Math.round(S.doy), yearLen(S.Y)); }
  function render() { shown = ''; drawDay(); drawYear(); note(); }
  for (const [row, R] of Object.entries(ROWS)) {
    const cv = R.cv;
    cv.addEventListener('pointerdown', e => { cancelAnimationFrame(drag && drag.coast); fromClock(); drag = { row, id: e.pointerId, x: e.clientX, x0: e.clientX, t0: performance.now(), v: 0, lt: performance.now(), moved: 0 }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; e.preventDefault(); });
    cv.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const now = performance.now(), dx = e.clientX - drag.x; drag.x = e.clientX; drag.moved += Math.abs(dx);
      const dt = Math.max(1, now - drag.lt); drag.v = 0.7 * (dx / dt) + 0.3 * drag.v; drag.lt = now; shift(row, -dx / R.unit()); render(); apply(); });
    const up = e => { if (!drag || drag.id !== e.pointerId) return; cv.style.cursor = ''; const d = drag;
      if (d.moved < 6 && performance.now() - d.t0 < 400) { const r = cv.getBoundingClientRect(); shift(row, (e.clientX - r.left - r.width / 2) / R.unit()); snap(row); render(); apply(); drag = null; return; }
      let v = performance.now() - d.lt > 80 ? 0 : d.v, last = performance.now();
      if (!v) { snap(row); render(); apply(); drag = null; return; }
      const coast = () => { const now = performance.now(), dt = now - last; last = now; v *= Math.exp(-dt / 325);
        if (Math.abs(v) < 0.03) { snap(row); render(); apply(); drag = null; return; }
        shift(row, -(v * dt) / R.unit()); render(); apply(); d.coast = requestAnimationFrame(coast); };
      d.coast = requestAnimationFrame(coast); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('keydown', e => { const s = { ArrowLeft: -1, ArrowRight: 1, PageDown: -4, PageUp: 4 }[e.key]; if (!s) return; e.preventDefault(); e.stopPropagation(); fromClock(); shift(row, s * (row === 'day' ? (e.shiftKey ? 60 : 15) : (e.shiftKey ? 7 : 1))); snap(row); render(); apply(); });
  }
  box.querySelector('#wNow').onclick = () => { drag = null; C.now(); };
  const chk = document.getElementById('wheelsChk');
  function show(on) { box.hidden = !on; document.body.classList.toggle('wheels', on); if (chk) chk.checked = on; try { localStorage.setItem('d3.wheels', on ? '1' : '0'); } catch { /* no storage */ } if (on) draw(true); }
  box.querySelector('#wHide').onclick = () => show(false);
  if (chk) chk.onchange = () => show(chk.checked);
  let saved = null; try { saved = localStorage.getItem('d3.wheels'); } catch { /* no storage */ }
  show(C.flag('wheels', saved !== '0'));
  new ResizeObserver(() => draw(true)).observe(cvD);
  draw(true);
  return { draw, show, get state() { return S && { ...S, date: dateOf(S.Y, mod(Math.round(S.doy), yearLen(S.Y))), time: hhmm(mod(Math.round(S.min), 1440)) }; }, sunDay, yearData, get hidden() { return box.hidden; } };
}
