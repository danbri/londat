// Docklands 3D page: "where am I" — the locate button, the blue dot, follow and heading modes, look through the phone.
// Loaded after the page's inline script; talks to it only through window.__docklands (geo, groundAt, cam, draw, ...)
// and DocklandsLocate.after(ctx), called at the end of each frame. Nothing here sends, stores or puts the position in
// the URL. Why each choice was made, the conventions followed and the tests: skill docklands-3d-page, "Location and heading".
(() => {
'use strict';
const D = window.__docklands, A = globalThis.DOCKLANDS_AREA;
if (!D || !D.geo || !A) return;
const $ = id => document.getElementById(id), cv = $('c'), wrap = $('wrap'), R2D = 180 / Math.PI, D2R = Math.PI / 180;
const E = A.meta.extent, inside = (x, z) => x >= E.x0 && x <= E.x1 && z >= E.z0 && z <= E.z1;
const wrap360 = a => ((a % 360) + 360) % 360, angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

// ---------- DOM: two round buttons in the bottom-right corner (above the credit) and an SVG overlay for the dot
const css = document.createElement('style');
css.textContent = `
#locBtns{position:absolute;z-index:3;right:10px;bottom:calc(var(--tabs) + var(--safe) + 40px);display:flex;flex-direction:column;gap:10px;transition:bottom .2s ease,right .2s ease}
#locBtns .ib{color:#c9ced6}#locBtns .ib[data-s=located],#locBtns .ib[data-s=centred],#locBtns .ib[data-s=heading],#locEye[aria-pressed=true]{color:#4da3ff}
#locBtns .ib[data-s=waiting] svg{animation:locPulse 1s ease-in-out infinite}@keyframes locPulse{50%{opacity:.35}}
#locBtns .ib svg .f{fill:currentColor;stroke:none}#locEye[hidden]{display:none}
#locSvg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden}
#locMsg{position:absolute;z-index:4;left:50%;transform:translateX(-50%);top:calc(max(10px,env(safe-area-inset-top)) + 54px);width:max-content;max-width:min(calc(100vw - 32px),460px);box-sizing:border-box;background:#1b2128f2;border:1px solid var(--line);border-radius:10px;padding:8px 10px 8px 12px;font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;box-shadow:0 2px 8px #0008}
#locMsg[hidden]{display:none}#locMsg span{flex:1 1 200px}#locMsg button{font-size:13px;padding:6px 10px}
body.capture #locBtns,body.capture #locSvg,body.capture #locMsg{display:none!important}`;
document.head.appendChild(css);
const ICON = {
  off: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  located: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  centred: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><circle class="f" cx="12" cy="12" r="3.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  heading: '<svg viewBox="0 0 24 24"><path class="f" d="M12 2.5l6.5 17-6.5-3.6-6.5 3.6z"/></svg>',
};
ICON.waiting = ICON.off; ICON.eye = ICON.heading;
const LABEL = { off: 'Show my location', waiting: 'Finding your location', located: 'Centre the view on my location', centred: 'Turn the view with my heading', heading: 'Stop turning with my heading', eye: 'Stop looking through the phone' };
const box = document.createElement('div'); box.id = 'locBtns';
box.innerHTML = '<button type="button" class="ib" id="locEye" hidden aria-pressed="false" aria-label="Look through the phone (street level, turn the phone to look round)" title="Look through the phone"><svg viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button>' +
  '<button type="button" class="ib" id="locBtn"></button>';
const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'locSvg'; svg.setAttribute('aria-hidden', 'true');
svg.innerHTML = '<defs><radialGradient id="locBeam" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4da3ff" stop-opacity=".75"/><stop offset="1" stop-color="#4da3ff" stop-opacity="0"/></radialGradient></defs>' +
  '<path id="locAcc" fill="#4da3ff" fill-opacity=".16" stroke="#4da3ff" stroke-opacity=".55" stroke-width="1"/><path id="locCone" fill="url(#locBeam)"/>' +
  '<circle id="locDot" r="8" fill="#1a73e8" stroke="#fff" stroke-width="2.5"/>';
const msg = document.createElement('div'); msg.id = 'locMsg'; msg.hidden = true; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
wrap.insertBefore(svg, $('labels')); wrap.appendChild(box); wrap.appendChild(msg);
const btn = $('locBtn'), eyeBtn = $('locEye'), acc = $('locAcc'), cone = $('locCone'), dot = $('locDot');
svg.style.display = 'none';

// ---------- state
const S = {
  mode: 'off',        // off | waiting | located | centred | heading | eye
  watch: null, fix: null,   // fix: smoothed { x, z, acc, lat, lon, t }
  hv: null, hsrc: '',       // smoothed heading as a unit vector [sin, cos] of the grid bearing; source: compass | course
  pitch: 0, compassT: 0, orient: false, set: null, outside: false, lastErr: null, events: 0,
};
const setMode = m => {
  S.mode = m; btn.dataset.s = m; btn.innerHTML = ICON[m]; btn.setAttribute('aria-label', LABEL[m]); btn.title = LABEL[m];
  btn.setAttribute('aria-pressed', String(m === 'centred' || m === 'heading' || m === 'eye'));
  eyeBtn.hidden = !(m === 'heading' || m === 'eye'); eyeBtn.setAttribute('aria-pressed', String(m === 'eye'));
  if (m === 'centred' || m === 'heading' || m === 'eye') loop();
};
setMode('off');
const say = (html, act) => {
  if (!html) { msg.hidden = true; msg.innerHTML = ''; return; }
  msg.innerHTML = `<span>${html}</span>` + (act ? `<button type="button" id="locAct">${act[0]}</button>` : '') + '<button type="button" class="ib" id="locX" aria-label="Close" style="width:30px;height:30px">✕</button>';
  msg.hidden = false; if (act) $('locAct').onclick = act[1]; $('locX').onclick = () => say('');
};
const toast = t => typeof D.toast === 'function' ? D.toast(t) : say(t);

// grid convergence: the bearing, from the model's grid north, of true north at a point (from the page's own transform)
const trueToGrid = (lon, lat) => { const a = D.geo(lon, lat), b = D.geo(lon, lat + .001); return Math.atan2(b[0] - a[0], -(b[1] - a[1])) * R2D; };

// ---------- position
function startWatch() {
  if (S.watch != null) return;
  S.watch = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 });
}
function stopWatch() { if (S.watch != null) navigator.geolocation.clearWatch(S.watch); S.watch = null; }
function onPos(p) {
  const c = p.coords, [x, z] = D.geo(c.longitude, c.latitude), a = Math.max(1, c.accuracy || 50), f = S.fix, now = p.timestamp || Date.now();
  S.lastErr = null; S.events++;
  if (!f || Math.hypot(x - f.x, z - f.z) > Math.max(30, 2 * a + f.acc) || now - f.t > 15000) S.fix = { x, z, acc: a, t: now };
  else { const k = Math.min(.8, Math.max(.25, f.acc / (f.acc + a))); S.fix = { x: f.x + (x - f.x) * k, z: f.z + (z - f.z) * k, acc: f.acc + (a - f.acc) * .5, t: now }; }   // jitter: a fix with a better accuracy moves the dot further
  S.fix.lat = c.latitude; S.fix.lon = c.longitude; S.conv = trueToGrid(c.longitude, c.latitude);
  // GPS course when moving and no compass (or the compass has gone quiet)
  if (c.heading != null && !isNaN(c.heading) && (c.speed || 0) > 1 && performance.now() - S.compassT > 3000) addHeading(wrap360(c.heading + S.conv), 'course', .5);
  const out = !inside(S.fix.x, S.fix.z);
  if (S.mode === 'waiting') {
    if (out) { setMode('located'); outsideMsg(); }
    else { say(''); centreOn(true); setMode('centred'); }
  } else if (out !== S.outside) { if (out) outsideMsg(); else say(''); }
  S.outside = out; D.draw(); loop();
}
function onErr(e) {
  S.lastErr = e.code;
  if (S.fix && e.code !== 1) return;   // a later timeout while we have a fix: keep the dot and keep watching
  stopWatch(); setMode('off'); svg.style.display = 'none';
  if (e.code === 1) say('Location is blocked for this page. To allow it, open the site settings (the icon left of the address) and set Location to Allow. On an iPhone also check Settings &gt; Privacy &amp; Security &gt; Location Services &gt; Safari Websites.');
  else if (e.code === 3) say('Finding your location took too long.', ['Try again', () => { say(''); locate(); }]);
  else say('Your location is not available now. Check that location is on for this device, then try again.', ['Try again', () => { say(''); locate(); }]);
}
function locate() {
  if (!window.isSecureContext) return say('Location works only on a secure (https) page. Open <a href="https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/">the https address</a> and try again.');
  if (!navigator.geolocation) return say('This browser does not give a location.');
  setMode('waiting'); startWatch();
}
function outsideMsg() {
  const f = S.fix, cx = Math.max(E.x0, Math.min(E.x1, f.x)), cz = Math.max(E.z0, Math.min(E.z1, f.z)), d = Math.hypot(f.x - cx, f.z - cz);
  const b = wrap360(Math.atan2(f.x - cx, -(f.z - cz)) * R2D - (S.conv || 0)), dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(b / 45) % 8];
  const dist = d < 1000 ? Math.round(d / 10) * 10 + ' m' : (d / 1000).toFixed(d < 10000 ? 1 : 0) + ' km';
  say(`You are outside the model area: ${dist} ${dir} of it.`, ['Show where I am', showEdge]);
}
// the camera at the nearest edge of the model, looking towards the visitor
function showEdge() {
  const f = S.fix; if (!f) return; say('');
  const cx = Math.max(E.x0 + 60, Math.min(E.x1 - 60, f.x)), cz = Math.max(E.z0 + 60, Math.min(E.z1 - 60, f.z)), cam = D.cam;
  const b = Math.atan2(f.x - cx, -(f.z - cz));
  free(); Object.assign(cam, { tx: cx, tz: cz, ty: D.groundAt(cx, cz), yaw: -b, pitch: .3, dist: 900 }); unpress(); D.draw();
  if (S.mode !== 'off') setMode('located');
}
const unpress = () => document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', 'false'));
const free = () => { const c = D.cam; delete c.eye; delete c.target; delete c.fov; delete c.hfov; };

// ---------- orientation (compass)
const iosAsk = () => typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
const screenAngle = () => (screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : +(window.orientation || 0)) || 0;
function addHeading(gridDeg, src, k = .25) {
  // circular smoothing: step along the shorter arc (averaging unit vectors stalls when a new reading is opposite the mean)
  let r = gridDeg * D2R; if (S.hv && S.hsrc === src) { const c = Math.atan2(S.hv[0], S.hv[1]); r = c + angDiff(r, c) * k; }
  S.hv = [Math.sin(r), Math.cos(r)];
  S.hsrc = src; D.draw(); loop();
}
// W3C device frame (x right, y top, z out of the screen), Earth frame (east, north, up), R = Rz(alpha) Rx(beta) Ry(gamma)
function onOrient(e) {
  let hTrue = null; const be = (e.beta || 0) * D2R, ga = (e.gamma || 0) * D2R, th = screenAngle() * D2R;
  if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) hTrue = e.webkitCompassHeading + screenAngle();   // iOS: degrees from north, of the device top
  else if (e.absolute && e.alpha != null) {
    const al = e.alpha * D2R, ca = Math.cos(al), sa = Math.sin(al), cb = Math.cos(be), sb = Math.sin(be), cg = Math.cos(ga), sg = Math.sin(ga);
    const c0 = [ca * cg - sa * sb * sg, sa * cg + ca * sb * sg], c1 = [-sa * cb, ca * cb], c2 = [ca * sg + sa * sb * cg, sa * sg - ca * sb * cg];
    // the screen's up direction plus the back camera's direction, both made horizontal: the first serves a flat phone, the second an upright one
    const hE = c0[0] * Math.sin(th) + c1[0] * Math.cos(th) - c2[0], hN = c0[1] * Math.sin(th) + c1[1] * Math.cos(th) - c2[1];
    if (Math.hypot(hE, hN) > 1e-3) hTrue = Math.atan2(hE, hN) * R2D;
  }
  if (e.beta != null) { const p = Math.asin(Math.max(-1, Math.min(1, -Math.cos(be) * Math.cos(ga)))); S.pitch += (p - S.pitch) * .25; }   // elevation of the back camera
  if (hTrue == null) return;
  S.compassT = performance.now(); S.events++;
  const lon = S.fix ? S.fix.lon : -.02, lat = S.fix ? S.fix.lat : 51.5;
  addHeading(wrap360(hTrue + (S.conv ?? trueToGrid(lon, lat))), 'compass');
}
function startOrient() {
  if (S.orient) return; S.orient = true;
  if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onOrient);
  window.addEventListener('deviceorientation', onAny);
}
function onAny(e) { if (typeof e.webkitCompassHeading === 'number' || (e.absolute && !('ondeviceorientationabsolute' in window))) onOrient(e); else if (e.beta != null) onPitchOnly(e); }
function onPitchOnly(e) { if (performance.now() - S.compassT < 500) return; const be = e.beta * D2R, ga = (e.gamma || 0) * D2R; S.pitch += (Math.asin(Math.max(-1, Math.min(1, -Math.cos(be) * Math.cos(ga)))) - S.pitch) * .25; }
function stopOrient() { if (!S.orient) return; S.orient = false; window.removeEventListener('deviceorientationabsolute', onOrient); window.removeEventListener('deviceorientation', onAny); }
// iOS asks for motion permission; it must be requested inside the tap, before any await
function askOrient(then) {
  if (iosAsk()) DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') { startOrient(); then && then(); } else say('Compass access was refused, so the view cannot turn with you. To allow it, close this tab, open the page again and allow "Motion &amp; Orientation Access".'); }).catch(() => say('The compass is not available in this browser.'));
  else { startOrient(); then && then(); }
}
const noCompassCheck = () => setTimeout(() => { if ((S.mode === 'heading' || S.mode === 'eye') && !S.hv) toast(S.mode === 'eye' ? 'No compass found on this device, so the view cannot follow the phone.' : 'No compass found: the view turns with your direction of travel when you move.'); }, 2500);

// ---------- the camera
function centreOn(first) {
  const f = S.fix, cam = D.cam; if (!f) return;
  free(); unpress();
  if (first && cam.dist > 700) cam.dist = 600;
  if (first && cam.pitch < .25) cam.pitch = .55;
}
let looping = false;
function loop() { if (!looping) { looping = true; requestAnimationFrame(step); } }
function step() {
  looping = false; const m = S.mode, cam = D.cam, f = S.fix, now = performance.now(), dt = Math.min(1, (now - (S.tPrev || now - 16)) / 1000); S.tPrev = now;
  const k = 1 - Math.exp(-dt / .25);   // eased by time, not by frame: a slow GPU (or SwiftShader at 1 frame in 2 s) settles as fast
  if (!(m === 'centred' || m === 'heading' || m === 'eye') || !f) return;
  // someone else moved the camera (a drag, a twist, a view button, a search): stop following, keep the dot
  if (S.set && (Math.abs(cam.tx - S.set.tx) > .01 || Math.abs(cam.tz - S.set.tz) > .01 || Math.abs(angDiff(cam.yaw, S.set.yaw)) > 1e-4 || (m === 'eye') !== !!cam.eye || (m === 'eye' && cam.eye !== S.set.eye))) { S.set = null; if (m === 'eye') { free(); orbitAt(f); } setMode('located'); D.draw(); return; }
  let more = false; const gy = D.groundAt(f.x, f.z);
  if (m === 'eye') {
    const yaw = S.hv ? Math.atan2(S.hv[0], S.hv[1]) : (S.eyeYaw ?? -cam.yaw), pitch = Math.max(-1.1, Math.min(1.1, S.pitch));
    const ey = gy + 1.6, e = [f.x, ey, f.z], cp = Math.cos(pitch);
    const t = [f.x + 100 * Math.sin(yaw) * cp, ey + 100 * Math.sin(pitch), f.z - 100 * Math.cos(yaw) * cp], o = cam.target;
    if (!cam.eye || !o || Math.hypot(t[0] - o[0], t[1] - o[1], t[2] - o[2]) > .02 || Math.hypot(e[0] - cam.eye[0], e[2] - cam.eye[2]) > .02) { cam.eye = e; cam.target = t; cam.fov = 1.05; D.draw(); }   // draw only when the view changed
    cam.tx = f.x; cam.tz = f.z; cam.yaw = -yaw;
  } else {
    const dx = f.x - cam.tx, dz = f.z - cam.tz, kk = Math.hypot(dx, dz) > 2000 || Math.hypot(dx, dz) < .3 ? 1 : k;
    if (Math.hypot(dx, dz) > .01) { cam.tx += dx * kk; cam.tz += dz * kk; more = true; }
    cam.ty += (gy - cam.ty) * k;
    if (m === 'heading' && S.hv) { const want = -Math.atan2(S.hv[0], S.hv[1]), d = angDiff(want, cam.yaw); if (Math.abs(d) > 1e-3) { cam.yaw += Math.abs(d) < .003 ? d : d * k; more = true; } }
    if (more) D.draw();
  }
  S.set = { tx: cam.tx, tz: cam.tz, yaw: cam.yaw, eye: cam.eye };
  requestAnimationFrame(step); looping = true;
}
function orbitAt(f) { const c = D.cam; Object.assign(c, { tx: f.x, tz: f.z, ty: D.groundAt(f.x, f.z), dist: Math.min(c.dist, 400), pitch: .45 }); }

// ---------- the button cycle (Google Maps / Apple Maps): off -> centred -> heading -> centred; a drag -> located
btn.onclick = () => {
  const m = S.mode;
  if (m === 'off') { if (!iosAsk()) startOrient(); locate(); }    // Android, desktop: the compass needs no prompt, so the beam shows at once
  else if (m === 'waiting') { stopWatch(); setMode('off'); }
  else if (m === 'located') { if (!S.fix) return; if (!inside(S.fix.x, S.fix.z)) return outsideMsg(); S.set = null; centreOn(false); setMode('centred'); }
  else if (m === 'centred') {
    if (D.PIX && D.PIX.on) return toast('Pixel art turns in quarter turns, so it does not follow the compass.');
    S.set = null; askOrient(); setMode('heading'); noCompassCheck();
  } else if (m === 'heading') { S.set = null; setMode('centred'); }
  else if (m === 'eye') { S.set = null; free(); orbitAt(S.fix); setMode('centred'); }
};
// long press on the button: turn location off (and on a phone, the usual way to stop is the same button)
{ let t = 0; btn.addEventListener('pointerdown', () => { delete btn.dataset.lp; clearTimeout(t); t = setTimeout(() => { if (S.mode !== 'off') { off(); toast('Location off'); btn.dataset.lp = '1'; } }, 800); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, () => clearTimeout(t));
  btn.addEventListener('click', e => { if (btn.dataset.lp) { delete btn.dataset.lp; e.stopImmediatePropagation(); } }, true); }
eyeBtn.onclick = () => {
  if (S.mode === 'eye') { S.set = null; free(); orbitAt(S.fix); setMode('heading'); return; }
  if (!S.fix) return; if (!inside(S.fix.x, S.fix.z)) return outsideMsg();
  S.set = null; S.eyeYaw = -D.cam.yaw; askOrient(); setMode('eye'); noCompassCheck();
};
function off() { stopWatch(); stopOrient(); S.fix = null; S.hv = null; S.set = null; if (S.mode === 'eye') { free(); } setMode('off'); say(''); svg.style.display = 'none'; D.draw(); }
// the page is hidden: stop the GPS and the compass; start them again when it shows
document.addEventListener('visibilitychange', () => {
  if (S.mode === 'off') return;
  if (document.hidden) { stopWatch(); S.wasOrient = S.orient; stopOrient(); }
  else { startWatch(); if (S.wasOrient) startOrient(); }
});
// the button sits above the record card on a phone, and left of the docked card on a wide screen
const sheet = $('sheet');
const place = () => { const h = sheet ? sheet.getBoundingClientRect().height : 0, wide = innerWidth >= 900;
  box.style.bottom = h > 2 && !wide ? `calc(${Math.round(h)}px + 12px)` : ''; box.style.right = h > 2 && wide ? `${Math.round(sheet.getBoundingClientRect().width) + 24}px` : ''; };
if (sheet && 'ResizeObserver' in window) new ResizeObserver(place).observe(sheet); addEventListener('resize', place);

// ---------- drawing: the dot, the accuracy circle on the ground and the heading beam, each frame
function proj(M, VZ, w, h, x, y, z) { const c = M[3] * x + M[7] * y * VZ + M[11] * z + M[15]; if (c <= .5) return null; return [((M[0] * x + M[4] * y * VZ + M[8] * z + M[12]) / c * .5 + .5) * w, (1 - ((M[1] * x + M[5] * y * VZ + M[9] * z + M[13]) / c * .5 + .5)) * h]; }
function after(ctx) {
  const f = S.fix; if (!f || S.mode === 'off' || S.mode === 'eye' || !ctx.MVP) { svg.style.display = 'none'; return; }
  const { MVP: M, VZ, cssW: w, cssH: h } = ctx, gy = D.groundAt(f.x, f.z) + .5, p = proj(M, VZ, w, h, f.x, gy, f.z);
  if (!p || p[0] < -200 || p[1] < -200 || p[0] > w + 200 || p[1] > h + 200) { svg.style.display = 'none'; return; }
  svg.style.display = ''; dot.setAttribute('cx', p[0].toFixed(1)); dot.setAttribute('cy', p[1].toFixed(1));
  let d = '';
  for (let i = 0; i <= 48; i++) { const a = i / 48 * 2 * Math.PI, q = proj(M, VZ, w, h, f.x + f.acc * Math.sin(a), gy, f.z + f.acc * Math.cos(a)); if (!q) { d = ''; break; } d += (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }
  acc.setAttribute('d', d ? d + 'Z' : '');
  if (S.hv) {   // the beam points along the heading as it appears on screen (projected), 60 degrees wide, 56 px long
    const q = proj(M, VZ, w, h, f.x + 20 * S.hv[0], gy, f.z - 20 * S.hv[1]);
    if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) > .5) {
      const a = Math.atan2(q[1] - p[1], q[0] - p[0]), L = 56, s = 30 * D2R, pt = t => (p[0] + L * Math.cos(t)).toFixed(1) + ' ' + (p[1] + L * Math.sin(t)).toFixed(1);
      cone.setAttribute('d', `M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${pt(a - s)}A${L} ${L} 0 0 1 ${pt(a + s)}Z`);
      const g = $('locBeam'); g.setAttribute('cx', p[0]); g.setAttribute('cy', p[1]); g.setAttribute('r', L);
    } else cone.setAttribute('d', '');
  } else cone.setAttribute('d', '');
}
globalThis.DocklandsLocate = { after, get state() { return { mode: S.mode, fix: S.fix && { x: +S.fix.x.toFixed(1), z: +S.fix.z.toFixed(1), acc: +S.fix.acc.toFixed(1) }, heading: S.hv ? +wrap360(Math.atan2(S.hv[0], S.hv[1]) * R2D).toFixed(2) : null, hsrc: S.hsrc, pitch: +(S.pitch * R2D).toFixed(1), watching: S.watch != null, orient: S.orient, outside: S.outside, msg: msg.hidden ? '' : msg.textContent, err: S.lastErr, conv: S.conv }; }, off, showEdge };
})();
