// Docklands 3D page: navigation helpers. Momentum after a drag, pinch or twist; the ground limit (a soft wall 1 m from
// the ground or water at the eye, a haptic click and a pass into Below ground when the push goes on); Share this view.
// Loaded after locate.js; talks to the page only through window.__docklands. Why each choice was made and the
// tests: skill docklands-3d-page, "Navigation: momentum, ground limit, share".
(() => {
'use strict';
const D = window.__docklands;
if (!D || !D.cam) return;
const $ = id => document.getElementById(id), cv = $('c'), labelBox = $('labels'), cam = D.cam;
const TAU = .35, T_END = 3.2, PMAX = 1.5695, DMIN = 80, DMAX = 16000;   // decay time constant (s); a fling ends 3.2 s (about 9 TAU) after release
const S = { moving: false, v: null, t0: 0, t: 0, last: null, manual: false, samples: [], ptrs: new Set(), snap: null, flings: 0 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const off = () => !!cam.eye;
const W = 1, PMIN_UNDER = -1.35, PUSH_MS = 600, PUSH_PX = 480;   // wall (m from the surface), pitch limit below ground, push to pass
const followMode = () => { const L = globalThis.DocklandsLocate; return !!(L && L.state && /^(centred|heading|eye)$/.test(L.state.mode)); };
const get = () => ({ tx: cam.tx, tz: cam.tz, ty: cam.ty || 0, yaw: cam.yaw, pitch: cam.pitch, ld: Math.log(cam.dist) });
const put = s => { cam.tx = s.tx; cam.tz = s.tz; cam.ty = s.ty; cam.yaw = s.yaw; cam.pitch = s.pitch; cam.dist = Math.exp(s.ld); };
const isUnder = () => { const g = $('gauge'), c = $('cut'); return !!(g && !g.hidden) || !!(c && +c.value < 250); };
const pitchMin = () => D.PIX.on ? .2 : isUnder() ? PMIN_UNDER : -.6;

// ---------- momentum: release velocity from the last 80 ms of camera motion, exponential decay by time (not by frame)
function stop() { S.moving = false; S.v = null; }
function fling(v, t) {
  if (reduced() || off() || followMode()) return false;
  S.v = { ...v }; S.lastV = { ...v }; S.t0 = S.t = t; S.last = get(); S.moving = true; S.flings++;
  if (!S.manual) requestAnimationFrame(loop);
  return true;
}
// the state at time t is s0 + v TAU (1 - e^(-t/TAU)) for each part, so 2 and 120 frames a second end in the same place
function tick(now) {
  if (!S.moving) return;
  const l = S.last, c = get();
  if (Math.abs(c.tx - l.tx) > 1e-6 || Math.abs(c.tz - l.tz) > 1e-6 || Math.abs(c.yaw - l.yaw) > 1e-9 || Math.abs(c.pitch - l.pitch) > 1e-9 || Math.abs(c.ld - l.ld) > 1e-9 || c.ty !== l.ty) return stop();   // something else moved the camera (a view, a search, a flight, the locate button)
  if (followMode() || off() || document.hidden) return stop();
  const te = Math.min(now, S.t0 + T_END * 1000), dt = Math.max(0, (te - S.t) / 1000); S.t = te;
  if (dt > 0) {
    const e = Math.exp(-dt / TAU), k = TAU * (1 - e), v = S.v;
    const s = { ...c, tx: c.tx + v.tx * k, tz: c.tz + v.tz * k, yaw: c.yaw + v.yaw * k, pitch: c.pitch + v.pitch * k, ld: c.ld + v.ld * k };
    const pm = pitchMin(); if (s.pitch < pm || s.pitch > PMAX) { s.pitch = clamp(s.pitch, pm, PMAX); v.pitch = 0; }
    if (s.ld < Math.log(DMIN) || s.ld > Math.log(DMAX)) { s.ld = clamp(s.ld, Math.log(DMIN), Math.log(DMAX)); v.ld = 0; }
    put(s); NAV.afterStep(c, v);
    for (const key of ['tx', 'tz', 'yaw', 'pitch', 'ld']) v[key] *= e;
    S.last = get(); D.draw();
  }
  if (te >= S.t0 + T_END * 1000) stop();
}
const loop = now => { tick(now); if (S.moving && !S.manual) requestAnimationFrame(loop); };

const sample = t => { S.samples.push({ t, ...get() }); if (S.samples.length > 40) S.samples.shift(); };
function release(tUp) {
  const sm = S.samples; S.samples = [];
  if (sm.length < 2 || off() || followMode()) return;
  const last = sm[sm.length - 1]; if (tUp - last.t > 60) return;   // the finger stopped before it lifted: no momentum
  let a = sm.find(s => s.t >= last.t - 80); if (a === last) a = sm[sm.length - 2];
  const dt = (last.t - a.t) / 1000; if (dt < .008 || dt > .25) return;
  const d = Math.exp(last.ld), v = { tx: (last.tx - a.tx) / dt, tz: (last.tz - a.tz) / dt, yaw: angDiff(last.yaw, a.yaw) / dt, pitch: (last.pitch - a.pitch) / dt, ld: (last.ld - a.ld) / dt };
  // slow parts get none (a careful placement stays put); fast ones are capped (one flick moves at most about one view)
  const ps = Math.hypot(v.tx, v.tz) / d;
  if (ps < .25) { v.tx = v.tz = 0; } else if (ps > 3) { v.tx *= 3 / ps; v.tz *= 3 / ps; }
  if (Math.abs(v.yaw) < .3) v.yaw = 0; else v.yaw = clamp(v.yaw, -5, 5);
  if (Math.abs(v.pitch) < .3) v.pitch = 0; else v.pitch = clamp(v.pitch, -2, 2);
  if (Math.abs(v.ld) < .4) v.ld = 0; else v.ld = clamp(v.ld, -3, 3);
  if (v.tx || v.tz || v.yaw || v.pitch || v.ld) fling(v, tUp);
}

// pointers that start on the model or on a label (the label layer feeds the same gestures)
const mine = e => e.target === cv || (labelBox && labelBox.contains(e.target));
addEventListener('pointerdown', e => { stop(); if (mine(e)) { S.ptrs.add(e.pointerId); S.samples = []; } }, true);   // any touch stops the momentum
addEventListener('pointermove', e => { if (S.ptrs.has(e.pointerId)) S.snap = get(); }, true);
const moved = e => { if (!S.ptrs.has(e.pointerId) || !S.snap) return; const s0 = S.snap; S.snap = null; NAV.afterMove(s0, e); sample(e.timeStamp); };
cv.addEventListener('pointermove', moved); if (labelBox) labelBox.addEventListener('pointermove', moved);   // after the page's own handlers
addEventListener('pointerup', e => { if (!S.ptrs.delete(e.pointerId)) return;
  if (S.ptrs.size) { S.lift = { sm: S.samples, t: e.timeStamp }; S.samples = []; return; }   // one finger of a pinch lifted: keep its motion for a moment
  if (S.samples.length < 2 && S.lift && e.timeStamp - S.lift.t < 80) { S.samples = S.lift.sm; S.lift = null; release(S.samples.length ? Math.min(e.timeStamp, S.samples[S.samples.length - 1].t + 16) : e.timeStamp); return; }   // both fingers lifted together
  S.lift = null; release(e.timeStamp); }, true);
addEventListener('pointercancel', e => { if (S.ptrs.delete(e.pointerId)) S.samples = []; }, true);
addEventListener('wheel', () => stop(), { capture: true, passive: true });
addEventListener('keydown', e => { if (e.key === 'Escape') stop(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });

// ---------- the ground limit: the eye stays 1 m above the ground or water under it (LiDAR DTM, groundAt). Towards
// the surface every move slows down (a soft wall over max(6 m, 2% of the distance)) and stops 1 m from it. A push that
// goes on (0.6 s, or 480 px of finger travel) clicks (vibrate 15 ms where the browser has it, and a visual snap) and
// passes into Below ground: the depth gauge opens and the model is cut at street level. Below ground the same wall
// and click bring the eye back up; there the view may look up from below (pitch to -1.35).
const vz = () => +(($('vz') || {}).value) || 1;
const eyeOf = s => { const d = Math.exp(s.ld), cp = Math.cos(s.pitch); return [s.tx + d * Math.sin(s.yaw) * cp, s.ty + d * Math.sin(s.pitch) / vz(), s.tz + d * Math.cos(s.yaw) * cp]; };
const surf = (x, z) => D.groundAt(x, z);
const clr = s => { const e = eyeOf(s); return e[1] - surf(e[0], e[2]); };
function guard(s0, user, dpx = 0, t = performance.now()) {
  const res = { blocked: false, r: 1 };
  if (off() || D.PIX.on) return res;
  const s1 = get(), under = isUnder(), c0 = clr(s0);
  let sg; if (!under) sg = 1; else if (c0 < 0) sg = -1; else return res;   // Below ground with the eye above the surface: free
  const a0 = sg * c0, a1 = sg * clr(s1), Z = Math.max(6, Math.exp(s0.ld) * .02);
  if (a1 >= a0 - 1e-9 || (a0 >= W + Z && a1 >= W)) { if (user) S.push = null; return res; }   // not towards the surface, or still far from it
  const r = Math.max(.06, Math.min(1, (a0 - W) / Z));
  let s = { ...s1, pitch: s0.pitch, ld: s0.ld };   // the sideways part of the move (pan, turn) keeps going unless it alone runs into rising ground
  if (sg * clr(s) < Math.min(W, a0)) s = { ...s, tx: s0.tx, tz: s0.tz, yaw: s0.yaw, ty: s0.ty };
  const at = k => ({ ...s, pitch: s0.pitch + (s1.pitch - s0.pitch) * k, ld: s0.ld + (s1.ld - s0.ld) * k });
  let k = r;
  if (sg * clr(at(k)) < W) { if (sg * clr(at(0)) < W) k = 0; else { let lo = 0, hi = k; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (sg * clr(at(m)) >= W) lo = m; else hi = m; } k = lo; } }
  put(at(k)); res.r = k; res.blocked = a1 < W; res.sg = sg;
  if (user && res.blocked) push(sg, dpx, t);
  return res;
}
function push(sg, dpx, t) {
  if (t < S.cool) return;
  const P = S.push; if (!P || t - P.last > 350 || P.sg !== sg) S.push = { t0: t, last: t, px: 0, n: 0, sg }; else P.last = t;
  S.push.px += dpx; S.push.n++; S.pushes++;
  cue(sg, Math.min(1, Math.max((t - S.push.t0) / PUSH_MS, S.push.px / PUSH_PX)));
  if ((t - S.push.t0 >= PUSH_MS && S.push.n >= 3) || S.push.px >= PUSH_PX) pass(sg, t);
}
// put the eye at clearance c by turning the pitch towards lim; if the pitch cannot reach it, move the target up or down
function place(c, lim) {
  const s = get(), f = p => clr({ ...s, pitch: p }) - c, f0 = f(s.pitch), fl = f(lim);
  if (Math.sign(f0) === Math.sign(fl)) { s.pitch = lim; s.ty -= fl; } else { let lo = s.pitch, hi = lim; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (Math.sign(f(m)) === Math.sign(f0)) lo = m; else hi = m; } s.pitch = hi; }
  put(s);
}
function pass(sg, t) {
  S.push = null; S.cool = t + 900; S.hold = true; stop(); const cut = $('cut');   // hold: the rest of this gesture does not tilt or zoom on
  if (sg > 0) {   // down: Below ground on, the model cut at street level unless the gauge already has a level
    const e = eyeOf(get()), g = surf(e[0], e[2]);
    if (cut && +cut.value >= 250) { cut.value = String(clamp(Math.round(g) - 1, -40, 60)); cut.dispatchEvent(new Event('input')); }
    if ($('gauge').hidden) $('digBtn').click();
    place(-1.5, PMIN_UNDER);
  } else {   // up: Below ground off (the gauge's cross also takes the cut away)
    if (!$('gauge').hidden) $('gaugeX').click(); else if (cut && +cut.value < 250) { cut.value = '250'; cut.dispatchEvent(new Event('input')); }
    place(1.5, PMAX);
  }
  S.passes++; S.lastPass = sg > 0 ? 'under' : 'above';
  let buzz = false; try { buzz = !!(navigator.vibrate && navigator.vibrate(15)); } catch { /* not allowed */ }
  S.vibrated = buzz; cue(sg, 1, true);
  dispatchEvent(new CustomEvent('docklands-nav-pass', { detail: { to: S.lastPass, vibrated: buzz } }));
  D.draw();
}
// the visual click: a ring that fills while the push lasts and snaps when the eye passes (iOS Safari has no vibrate)
const css = document.createElement('style');
css.textContent = `#navCue{position:absolute;z-index:3;left:50%;top:50%;width:84px;height:84px;margin:-42px 0 0 -42px;border-radius:50%;pointer-events:none;opacity:0;display:grid;place-items:center;
font:600 11px/1.2 system-ui,sans-serif;color:#e8eaec;text-align:center;text-shadow:0 1px 2px #000;background:conic-gradient(#4da3ffcc calc(var(--p,0)*1turn),#4da3ff22 0);-webkit-mask:radial-gradient(circle,transparent 33px,#000 34px);mask:radial-gradient(circle,transparent 33px,#000 34px)}
#navCue.on{opacity:1}#navCue.snap{animation:navSnap .45s ease-out forwards}@keyframes navSnap{0%{opacity:1;transform:scale(1)}40%{transform:scale(1.25)}100%{opacity:0;transform:scale(1.6)}}
#navCueT{position:absolute;z-index:3;left:50%;top:calc(50% + 50px);transform:translateX(-50%);pointer-events:none;font:600 13px/1.2 system-ui,sans-serif;color:#e8eaec;background:#1b2128e6;border-radius:8px;padding:4px 8px;opacity:0;transition:opacity .3s}
#navCueT.on{opacity:1}@media (prefers-reduced-motion: reduce){#navCue.snap{animation:none;opacity:0}}body.capture #navCue,body.capture #navCueT{display:none!important}`;
document.head.appendChild(css);
const cueEl = document.createElement('div'), cueT = document.createElement('div'); cueEl.id = 'navCue'; cueT.id = 'navCueT'; cueT.setAttribute('role', 'status'); cueT.setAttribute('aria-live', 'polite');
($('wrap') || document.body).append(cueEl, cueT);
let cueTimer = 0, cueTT = 0;
function cue(sg, p, snap) {
  clearTimeout(cueTimer); cueEl.style.setProperty('--p', p.toFixed(3)); cueEl.classList.remove('snap');
  if (snap) { void cueEl.offsetWidth; cueEl.classList.add('snap'); cueEl.classList.remove('on'); clearTimeout(cueTT);
    cueT.textContent = sg > 0 ? 'Below ground. Push up to come back.' : 'Above ground'; cueT.classList.add('on'); cueTT = setTimeout(() => cueT.classList.remove('on'), 2200); return; }
  cueEl.classList.add('on'); cueTimer = setTimeout(() => cueEl.classList.remove('on'), 400);
}
Object.assign(S, { hold: false, holdW: 0, push: null, cool: 0, passes: 0, pushes: 0, lastPass: null, vibrated: null, wsnap: null, xy: new Map() });
addEventListener('pointerdown', e => { if (S.ptrs.has(e.pointerId)) S.xy.set(e.pointerId, [e.clientX, e.clientY]); }, true);
addEventListener('pointerup', e => S.xy.delete(e.pointerId), true); addEventListener('pointercancel', e => S.xy.delete(e.pointerId), true);
addEventListener('wheel', () => { S.wsnap = get(); }, { capture: true, passive: true });
cv.addEventListener('wheel', e => { if (!S.wsnap) return; const s0 = S.wsnap; S.wsnap = null;
  if (S.hold && !S.ptrs.size) { if (e.timeStamp - S.holdW < 400) { S.holdW = e.timeStamp; put({ ...get(), ld: s0.ld }); return; } S.hold = false; }
  guard(s0, true, Math.min(120, Math.abs(e.deltaY)) * .6, e.timeStamp); if (S.hold) S.holdW = e.timeStamp; }, { passive: true });
for (const ty of ['pointerup', 'pointercancel']) addEventListener(ty, () => { if (!S.ptrs.size) S.hold = false; });   // bubble phase: after the release above

// ---------- Share this view (Menu, under the views): a link whose #hash holds the camera, style, Night, clock, Below
// ground, every layer switch that differs from the page's default and the record on the card. Short keys, rounded
// numbers, v=1. The hash is written only when the visitor taps Share. The locate button's position is never read: while
// the view follows the visitor's location, the link leaves the camera out.
const r1 = x => Math.round(x * 10) / 10, r4 = x => Math.round(x * 1e4) / 1e4;
const VIEW_IDS = new Set(['nightMode', 'liveTide', 'liveCams', 'bmode']);   // carried by n= and r=, or live-only
const inputs = () => [...document.querySelectorAll('#drawer input, #drawer select')].filter(el => !el.disabled && !(el.id && /^(viz|r(From|To)$|q$)/.test(el.id)) && el.type !== 'file' && el.type !== 'text' && el.type !== 'search');
const keyOf = el => el.id || (el.dataset.glow ? 'glow-' + el.dataset.glow : '');
const byKey = k => k.startsWith('glow-') ? document.querySelector(`[data-glow="${CSS.escape(k.slice(5))}"]`) : $(k);
const selDefault = el => { const o = [...el.options].find(o => o.defaultSelected) || el.options[0]; return o ? o.value : ''; };
let lastPick = null;   // the label whose record is on the card (a tap on the model or a search clears it)
if (labelBox) labelBox.addEventListener('click', e => { const b = e.target.closest('button'); const l = b && D.labels.find(x => x.el === b); if (l && !l.camEl) lastPick = l; });
cv.addEventListener('pointerup', () => { lastPick = null; }); const qres = $('qres'); if (qres) qres.addEventListener('click', () => { lastPick = null; }, true);
const sheetOpen = () => { const sh = $('sheet'); return !!sh && sh.getBoundingClientRect().height > 40; };
function shareState() {
  const o = [['v', '1']], L = globalThis.DocklandsLocate, follow = followMode();
  if (!follow) {
    if (cam.eye && cam.target) o.push(['e', [...cam.eye, ...cam.target].map(r1).join(',')]);
    o.push(['c', [r1(cam.tx), r1(cam.tz), r1(cam.ty || 0), Math.round(cam.dist), r4(cam.yaw), r4(cam.pitch)].join(',')]);
    if (cam.hfov) o.push(['f', 'h' + r4(cam.hfov)]); else if (cam.fov) o.push(['f', String(r4(cam.fov))]);
    if (cam.roll) o.push(['rl', String(r4(cam.roll))]);   // degrees, a view from an aircraft (?view=plane)
  }
  const vb = document.querySelector('[data-view][aria-pressed=true]'); if (vb && !follow) o.push(['vw', vb.dataset.view]);
  o.push(['n', D.NIGHT.on ? '1' : '0']);
  const K = globalThis.DocklandsSky; if (K && K.S) o.push(['t', K.S.live || !K.S.drive ? 'now' : K.isoL(K.t)]);
  o.push(['u', $('gauge') && !$('gauge').hidden ? '1' : '0']);
  const on = [], offs = [], rad = [], sel = [], rng = [];
  for (const el of inputs()) {
    if (el.type === 'radio') { if (el.name && el.checked && !el.defaultChecked) rad.push(el.name + ':' + el.value); continue; }   // radios have no id: keyed by name (style, ground image, buildings, splats)
    const k = keyOf(el); if (!k || VIEW_IDS.has(k)) continue;
    if (el.type === 'checkbox') { if (el.checked !== el.defaultChecked) (el.checked ? on : offs).push(k); }
    else if (el.type === 'range') { const dv = k === 'skyYear' ? el.max : el.defaultValue; if (el.value !== dv) rng.push(k + ':' + el.value); }
    else if (el.tagName === 'SELECT') { if (el.value !== selDefault(el)) sel.push(k + ':' + el.value); }
  }
  for (const [k, a] of [['on', on], ['off', offs], ['r', rad], ['s', sel], ['g', rng]]) if (a.length) o.push([k, a.join(',')]);
  if (sheetOpen()) { if (lastPick) o.push(['id', lastPick.wd || 'l:' + lastPick.name]); else if (D.selected >= 0 && D.AT) o.push(['id', D.AT.buildings[D.selected].id]); else if (globalThis.DocklandsKeys && DocklandsKeys.sel) o.push(['id', 'osm:' + DocklandsKeys.sel]); }
  if (document.body.classList.contains('capture')) o.push(['cap', '1']);
  const Dr = globalThis.DocklandsDrone; if (Dr && Dr.on && !follow) o.push(['dr', Dr.shareValue()]);   // drone.js: vehicle and pose
  return { pairs: o, follow };
}
const enc = v => encodeURIComponent(v).replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%20/g, '+');
function shareUrl() {
  const { pairs, follow } = shareState(), u = new URL(location.href);
  for (const k of ['view', 't', 'night', 'pixel', 'lines', 'vectrex', 'drone']) u.searchParams.delete(k);   // the hash carries these
  u.hash = pairs.map(([k, v]) => k + '=' + enc(v)).join('&');
  return { url: u.href, hash: u.hash, follow };
}
async function share() {
  const { url, hash, follow } = shareUrl(), out = $('shareOut');
  try { history.replaceState(history.state, '', location.pathname + location.search + hash); } catch { /* sandboxed */ }
  if (out) { out.hidden = false; out.textContent = url; }
  const note = follow ? ' The view follows your location, so the link has no camera: drag the map first to share a place.' : '';
  S.shared = url;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: document.title, url }); if (note) D.toast(note.trim()); return url; } catch (e) { if (e && e.name === 'AbortError') return url; }
  }
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; } catch {
    try { const ta = document.createElement('textarea'); ta.value = url; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); copied = document.execCommand('copy'); ta.remove(); } catch { /* no clipboard */ }
  }
  D.toast((copied ? 'Link to this view copied.' : 'Copy the link from the menu (under Share this view).') + note);
  return url;
}
// the button and the link under it, in the views group of the menu
{ const dig = $('digBtn'), b = document.createElement('button'); b.type = 'button'; b.id = 'shareBtn'; b.textContent = 'Share this view';
  b.title = 'A link that opens this view, style, time and layers'; b.onclick = () => { share(); };
  if (dig && dig.parentNode) dig.after(b); else ($('dViews') || document.body).appendChild(b);
  const out = document.createElement('div'); out.id = 'shareOut'; out.className = 'small'; out.hidden = true; out.style.cssText = 'user-select:text;-webkit-user-select:text;word-break:break-all;margin:4px 2px 0;opacity:.85';
  const grp = b.closest('#dViews') || b.parentNode; grp.appendChild(out); }

// ---------- open a shared link: read the hash once at load. Unknown keys are ignored; a bad value keeps the default.
const num = v => { const n = +v; return v !== '' && isFinite(n) ? n : null; };
function parseHash(h) {
  const m = {}; for (const part of String(h || '').replace(/^#/, '').split('&')) { const i = part.indexOf('='); if (i > 0) { try { m[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' ')); } catch { /* bad escape */ } } }
  return m.v === '1' ? m : null;
}
const until = (f, ms = 20000) => new Promise(ok => { const t0 = performance.now(); (function w() { let v = false; try { v = f(); } catch { v = false; } if (v || performance.now() - t0 > ms) ok(v); else setTimeout(w, 100); })(); });
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
async function restore(m) {
  S.restoring = true;
  try {
    if (m.vw && document.querySelector(`[data-view="${CSS.escape(m.vw)}"]`)) D.setView(m.vw);
    const K = globalThis.DocklandsSky;
    if (K && m.t) { if (m.t === 'now') { if (!K.S.live && K.S.drive) K.setTime(Date.now(), { live: true, noUrl: true }); } else { const t = K.fromLondon(m.t); if (isFinite(t)) K.setTime(t, { noUrl: true }); } }
    const pairs = k => (m[k] || '').split(',').filter(Boolean).map(x => { const i = x.indexOf(':'); return i > 0 ? [x.slice(0, i), x.slice(i + 1)] : [x, null]; });
    for (const [name, val] of pairs('r')) {   // style first: pixel art saves and replaces the camera
      const el = [...document.querySelectorAll(`#drawer input[type=radio][name="${CSS.escape(name)}"]`)].find(x => x.value === val);
      if (el && !el.checked) { el.checked = true; fire(el, 'change'); if (name === 'style') await until(() => D.PIX.on === (val === 'pixel')); }
    }
    for (const [k] of pairs('on')) { const el = byKey(k); if (el && el.type === 'checkbox' && !el.checked) { el.checked = true; fire(el, 'change'); } }
    for (const [k] of pairs('off')) { const el = byKey(k); if (el && el.type === 'checkbox' && el.checked) { el.checked = false; fire(el, 'change'); } }
    for (const [k, val] of pairs('s')) { const el = $(k); if (el && el.tagName === 'SELECT' && [...el.options].some(o => o.value === val)) { el.value = val; fire(el, 'change'); } }
    const under = m.u === '1', gauge = $('gauge');
    if (gauge && under === gauge.hidden) { if (under) $('digBtn').click(); else $('gaugeX').click(); }
    for (const [k, val] of pairs('g')) { const el = $(k), n = num(val); if (!el || el.type !== 'range' || n == null) continue;
      if (k === 'skyYear') await until(() => +el.max > 0, 8000);
      el.value = String(clamp(n, +el.min, +el.max)); fire(el, 'input'); }
    if (m.n === '1' || m.n === '0') { if (!!D.NIGHT.on !== (m.n === '1')) D.setNight(m.n === '1'); }
    if (m.cap === '1' && !document.body.classList.contains('capture')) D.captureMode(true);
    const c = (m.c || '').split(',').map(num);
    if (c.length >= 6 && c.slice(0, 6).every(x => x != null)) {
      delete cam.eye; delete cam.target; delete cam.fov; delete cam.hfov; delete cam.roll;
      Object.assign(cam, { tx: c[0], tz: c[1], ty: c[2], dist: clamp(c[3], DMIN, DMAX), yaw: c[4], pitch: clamp(c[5], D.PIX.on ? .2 : PMIN_UNDER, PMAX) });
      const f = m.f || ''; if (/^h[\d.]+$/.test(f) && num(f.slice(1)) > .05 && num(f.slice(1)) < 3.1) cam.hfov = +f.slice(1); else if (num(f) > .05 && num(f) < 3.1) cam.fov = +f;
      const rl = num(m.rl); if (rl != null && Math.abs(rl) < 90) cam.roll = rl;
      const e = (m.e || '').split(',').map(num); if (e.length === 6 && e.every(x => x != null)) { cam.eye = e.slice(0, 3); cam.target = e.slice(3); cam.fov = cam.fov || .8; }
      if (!m.vw) document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    }
    if (m.dr && globalThis.DocklandsDrone) await globalThis.DocklandsDrone.fromShare(m.dr);   // drone.js: dr=mode,x,y,z,heading,look
    D.draw();
    if (m.id) {
      if (/^cwb-\d+$/.test(m.id)) { if (await until(() => D.AT, 60000)) { const k = D.AT.buildings.findIndex(b => b.id === m.id); if (k >= 0) D.selectBuilding(k); } }
      else if (/^osm:[wr]\d+$/.test(m.id)) { if (globalThis.DocklandsKeys) await globalThis.DocklandsKeys.selectId(m.id.slice(4)); }
      else { const key = m.id.startsWith('l:') ? m.id.slice(2) : m.id, l = D.labels.find(x => (x.wd && x.wd === key) || x.name === key); if (l && l.el) l.el.click(); }
    }
    S.restored = m;
  } catch (e) { console.warn('shared view', e); } finally { S.restoring = false; }
}
const shared = parseHash(location.hash);
if (shared) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(() => restore(shared), 0)); else setTimeout(() => restore(shared), 0); }

const NAV = globalThis.DocklandsNav = {
  state: S, fling, stop, tick, pitchMin, guard, clearance: () => clr(get()), isUnder, share, shareUrl, shareState, parseHash, restore,
  afterMove(s0, e) { const p = S.xy.get(e.pointerId), dpx = p ? Math.hypot(e.clientX - p[0], e.clientY - p[1]) : 0; S.xy.set(e.pointerId, [e.clientX, e.clientY]); if (S.hold) { put({ ...get(), pitch: s0.pitch, ld: s0.ld, ty: s0.ty }); return; } guard(s0, true, dpx, e.timeStamp); },
  afterStep(s0, v) { const g = guard(s0, false); if (g.r < 1) { v.pitch *= g.r; v.ld *= g.r; } if (g.blocked) { v.pitch = 0; v.ld = 0; } },
};
})();
