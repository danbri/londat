// Locate (layer "locate") of the Three.js port: the WebGL page's locate.js, "where am I". A round button at the bottom
// right: off -> tap: the browser asks for the location now (never on load) -> waiting -> centred (the view follows the
// dot) -> tap: heading (the view turns with the compass) -> tap: centred; a drag or any other camera move -> located (the
// dot stays); hold 0.8 s: off. The eye button (in heading mode): look through the phone (street level, 1.6 m over the
// LiDAR ground, the phone's tilt, a 60 degree vertical field). The dot, the accuracy circle on the ground and the heading
// beam are an SVG over the canvas, projected each frame. Outside the model box: the distance and direction, and "Show
// where I am" (the nearest edge, looking towards the visitor). Nothing is sent, stored or put in the URL.
// Test hook: __docklands3.layers.locate.api.state. Why each choice and the tests: skill docklands-3d-page, "Location and
// heading"; the port: "Three.js port".
import { geoOf } from '../overlay-kit.js';

const R2D = 180 / Math.PI, D2R = Math.PI / 180;
const wrap360 = a => ((a % 360) + 360) % 360, angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
const ICON = {
  off: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  centred: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  heading: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2.5l6.5 17-6.5-3.6-6.5 3.6z"/></svg>',
};
ICON.waiting = ICON.off; ICON.located = ICON.off; ICON.eye = ICON.heading;
const LABEL = { off: 'Show my location', waiting: 'Finding your location', located: 'Centre the view on my location', centred: 'Turn the view with my heading', heading: 'Stop turning with my heading', eye: 'Stop looking through the phone' };
const CSS = `#locBtns{position:fixed;z-index:5;right:10px;bottom:calc(40px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:10px}
#locBtns button{width:44px;height:44px;border-radius:50%;border:0;background:var(--panel);color:#c9ced6;cursor:pointer;display:grid;place-items:center}
#locBtns button[data-s=located],#locBtns button[data-s=centred],#locBtns button[data-s=heading],#locEye[aria-pressed=true]{color:#4da3ff}
#locBtns button[data-s=waiting] svg{animation:locPulse 1s ease-in-out infinite}@keyframes locPulse{50%{opacity:.35}}#locEye[hidden]{display:none}
#locSvg{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:1}
#locMsg{position:fixed;z-index:7;left:50%;transform:translateX(-50%);top:calc(62px + env(safe-area-inset-top,0px));width:max-content;max-width:min(calc(100vw - 32px),460px);background:#1b2128f2;border:1px solid #33404a;border-radius:10px;padding:8px 10px 8px 12px;font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#locMsg[hidden]{display:none}#locMsg span{flex:1 1 200px}#locMsg button{font-size:13px;padding:6px 10px}`;

export default {
  id: 'locate', label: null, on: true, reveal: false,
  async init(ctx) {
    const { A, camera, controls, renderer, groundAt, draw, THREE } = ctx, geo = geoOf(A), E = A.meta.extent, D3 = () => globalThis.__docklands3;
    const inside = (x, z) => x >= E.x0 && x <= E.x1 && z >= E.z0 && z <= E.z1;
    const $ = id => document.getElementById(id);
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const box = document.createElement('div'); box.id = 'locBtns';
    box.innerHTML = '<button type="button" id="locEye" hidden aria-pressed="false" aria-label="Look through the phone (street level, turn the phone to look round)" title="Look through the phone"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button><button type="button" id="locBtn"></button>';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'locSvg'; svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<defs><radialGradient id="locBeam" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4da3ff" stop-opacity=".75"/><stop offset="1" stop-color="#4da3ff" stop-opacity="0"/></radialGradient></defs>' +
      '<path id="locAcc" fill="#4da3ff" fill-opacity=".16" stroke="#4da3ff" stroke-opacity=".55" stroke-width="1"/><path id="locCone" fill="url(#locBeam)"/><circle id="locDot" r="8" fill="#1a73e8" stroke="#fff" stroke-width="2.5"/>';
    const msg = document.createElement('div'); msg.id = 'locMsg'; msg.hidden = true; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
    $('view').after(svg); document.body.append(box, msg); svg.style.display = 'none';
    const btn = $('locBtn'), eyeBtn = $('locEye'), acc = $('locAcc'), cone = $('locCone'), dot = $('locDot');
    // the button sits above the record card when the card is open
    const card = $('card'), place = () => { box.style.bottom = card && !card.hidden ? `calc(${Math.round(card.getBoundingClientRect().height)}px + 48px + env(safe-area-inset-bottom,0px))` : ''; };
    if (card) new MutationObserver(place).observe(card, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });

    const S = { mode: 'off', watch: null, fix: null, hv: null, hsrc: '', pitch: 0, compassT: 0, orient: false, set: null, outside: false, lastErr: null, events: 0, conv: null };
    const setMode = m => { S.mode = m; btn.dataset.s = m; btn.innerHTML = ICON[m]; btn.setAttribute('aria-label', LABEL[m]); btn.title = LABEL[m];
      btn.setAttribute('aria-pressed', String(m === 'centred' || m === 'heading' || m === 'eye')); eyeBtn.hidden = !(m === 'heading' || m === 'eye'); eyeBtn.setAttribute('aria-pressed', String(m === 'eye'));
      if (m === 'centred' || m === 'heading' || m === 'eye') loop(); draw(); };
    setMode('off');
    const say = (html, act) => {
      if (!html) { msg.hidden = true; msg.innerHTML = ''; return; }
      msg.innerHTML = `<span>${html}</span>` + (act ? '<button type="button" id="locAct"></button>' : '') + '<button type="button" id="locX" aria-label="Close">✕</button>';
      msg.hidden = false; if (act) { $('locAct').textContent = act[0]; $('locAct').onclick = act[1]; } $('locX').onclick = () => say('');
    };
    const trueToGrid = (lon, lat) => { const a = geo(lon, lat), b = geo(lon, lat + .001); return Math.atan2(b[0] - a[0], -(b[1] - a[1])) * R2D; };

    // ---------- the camera, as the WebGL page's cam (tx, ty, tz, yaw, pitch, dist)
    const cam = () => D3().camState();
    let eyeOn = false;
    function setCam(c, eye) {
      if (eye) { D3().setCam({ ...c, fov: 1.05 }); eyeOn = true; return; }
      if (eyeOn) { eyeOn = false; D3().setCam(c); return; }   // leaves the eye's field of view
      const ce = Math.cos(c.pitch); controls.target.set(c.tx, c.ty || 0, c.tz);
      camera.position.set(c.tx + c.dist * Math.sin(c.yaw) * ce, (c.ty || 0) + c.dist * Math.sin(c.pitch), c.tz + c.dist * Math.cos(c.yaw) * ce); controls.update(); draw();
    }
    const unpress = () => document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', 'false'));

    // ---------- position
    const startWatch = () => { if (S.watch == null) S.watch = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }); };
    const stopWatch = () => { if (S.watch != null) navigator.geolocation.clearWatch(S.watch); S.watch = null; };
    function onPos(p) {
      const c = p.coords, [x, z] = geo(c.longitude, c.latitude), a = Math.max(1, c.accuracy || 50), f = S.fix, now = p.timestamp || Date.now();
      S.lastErr = null; S.events++;
      if (!f || Math.hypot(x - f.x, z - f.z) > Math.max(30, 2 * a + f.acc) || now - f.t > 15000) S.fix = { x, z, acc: a, t: now };
      else { const k = Math.min(.8, Math.max(.25, f.acc / (f.acc + a))); S.fix = { x: f.x + (x - f.x) * k, z: f.z + (z - f.z) * k, acc: f.acc + (a - f.acc) * .5, t: now }; }
      S.fix.lat = c.latitude; S.fix.lon = c.longitude; S.conv = trueToGrid(c.longitude, c.latitude);
      if (c.heading != null && !isNaN(c.heading) && (c.speed || 0) > 1 && performance.now() - S.compassT > 3000) addHeading(wrap360(c.heading + S.conv), 'course', .5);
      const out = !inside(S.fix.x, S.fix.z);
      if (S.mode === 'waiting') { if (out) { setMode('located'); outsideMsg(); } else { say(''); centreOn(true); setMode('centred'); } }
      else if (out !== S.outside) { if (out) outsideMsg(); else say(''); }
      S.outside = out; draw(); loop();
    }
    function onErr(e) {
      S.lastErr = e.code;
      if (S.fix && e.code !== 1) return;
      stopWatch(); setMode('off'); svg.style.display = 'none';
      if (e.code === 1) say('Location is blocked for this page. To allow it, open the site settings (the icon left of the address) and set Location to Allow. On an iPhone also check Settings &gt; Privacy &amp; Security &gt; Location Services &gt; Safari Websites.');
      else if (e.code === 3) say('Finding your location took too long.', ['Try again', () => { say(''); locate(); }]);
      else say('Your location is not available now. Check that location is on for this device, then try again.', ['Try again', () => { say(''); locate(); }]);
    }
    function locate() {
      if (!window.isSecureContext) return say('Location works only on a secure (https) page. Open <a href="https://danbri.github.io/londat/docklands/">the https address</a> and try again.');
      if (!navigator.geolocation) return say('This browser does not give a location.');
      setMode('waiting'); startWatch();
    }
    function outsideMsg() {
      const f = S.fix, cx = Math.max(E.x0, Math.min(E.x1, f.x)), cz = Math.max(E.z0, Math.min(E.z1, f.z)), d = Math.hypot(f.x - cx, f.z - cz);
      const b = wrap360(Math.atan2(f.x - cx, -(f.z - cz)) * R2D - (S.conv || 0)), dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(b / 45) % 8];
      const dist = d < 1000 ? Math.round(d / 10) * 10 + ' m' : (d / 1000).toFixed(d < 10000 ? 1 : 0) + ' km';
      say(`You are outside the model area: ${dist} ${dir} of it.`, ['Show where I am', showEdge]);
    }
    function showEdge() {
      const f = S.fix; if (!f) return; say('');
      const cx = Math.max(E.x0 + 60, Math.min(E.x1 - 60, f.x)), cz = Math.max(E.z0 + 60, Math.min(E.z1 - 60, f.z)), b = Math.atan2(f.x - cx, -(f.z - cz));
      setCam({ tx: cx, tz: cz, ty: groundAt(cx, cz), yaw: -b, pitch: .3, dist: 900 }); unpress();
      if (S.mode !== 'off') setMode('located');
    }
    // ---------- compass
    const iosAsk = () => typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
    const screenAngle = () => (screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : +(window.orientation || 0)) || 0;
    function addHeading(gridDeg, src, k = .25) { let r = gridDeg * D2R; if (S.hv && S.hsrc === src) { const c = Math.atan2(S.hv[0], S.hv[1]); r = c + angDiff(r, c) * k; } S.hv = [Math.sin(r), Math.cos(r)]; S.hsrc = src; draw(); loop(); }
    function onOrient(e) {   // W3C device frame, R = Rz(alpha) Rx(beta) Ry(gamma); heading of (screen up + back camera), made horizontal
      let hTrue = null; const be = (e.beta || 0) * D2R, ga = (e.gamma || 0) * D2R, th = screenAngle() * D2R;
      if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) hTrue = e.webkitCompassHeading + screenAngle();
      else if (e.absolute && e.alpha != null) {
        const al = e.alpha * D2R, ca = Math.cos(al), sa = Math.sin(al), cb = Math.cos(be), sb = Math.sin(be), cg = Math.cos(ga), sg = Math.sin(ga);
        const c0 = [ca * cg - sa * sb * sg, sa * cg + ca * sb * sg], c1 = [-sa * cb, ca * cb], c2 = [ca * sg + sa * sb * cg, sa * sg - ca * sb * cg];
        const hE = c0[0] * Math.sin(th) + c1[0] * Math.cos(th) - c2[0], hN = c0[1] * Math.sin(th) + c1[1] * Math.cos(th) - c2[1];
        if (Math.hypot(hE, hN) > 1e-3) hTrue = Math.atan2(hE, hN) * R2D;
      }
      if (e.beta != null) { const p = Math.asin(Math.max(-1, Math.min(1, -Math.cos(be) * Math.cos(ga)))); S.pitch += (p - S.pitch) * .25; }
      if (hTrue == null) return;
      S.compassT = performance.now(); S.events++;
      addHeading(wrap360(hTrue + (S.conv ?? trueToGrid(S.fix ? S.fix.lon : -.02, S.fix ? S.fix.lat : 51.5))), 'compass');
    }
    function onAny(e) { if (typeof e.webkitCompassHeading === 'number' || (e.absolute && !('ondeviceorientationabsolute' in window))) onOrient(e); else if (e.beta != null && performance.now() - S.compassT >= 500) { const be = e.beta * D2R, ga = (e.gamma || 0) * D2R; S.pitch += (Math.asin(Math.max(-1, Math.min(1, -Math.cos(be) * Math.cos(ga)))) - S.pitch) * .25; } }
    function startOrient() { if (S.orient) return; S.orient = true; if ('ondeviceorientationabsolute' in window) addEventListener('deviceorientationabsolute', onOrient); addEventListener('deviceorientation', onAny); }
    function stopOrient() { if (!S.orient) return; S.orient = false; removeEventListener('deviceorientationabsolute', onOrient); removeEventListener('deviceorientation', onAny); }
    function askOrient() {   // iOS asks for motion permission inside the tap, before any await
      if (iosAsk()) DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') startOrient(); else say('Compass access was refused, so the view cannot turn with you. To allow it, close this tab, open the page again and allow "Motion &amp; Orientation Access".'); }).catch(() => say('The compass is not available in this browser.'));
      else startOrient();
    }
    const noCompassCheck = () => setTimeout(() => { if ((S.mode === 'heading' || S.mode === 'eye') && !S.hv) say(S.mode === 'eye' ? 'No compass found on this device, so the view cannot follow the phone.' : 'No compass found: the view turns with your direction of travel when you move.'); }, 2500);

    // ---------- following: eased by time (a slow GPU settles as fast); another mover (a drag, a view button, a search) -> located
    function centreOn(first) { const c = cam(); if (first) setCam({ ...c, dist: c.dist > 700 ? 600 : c.dist, pitch: c.pitch < .25 ? .55 : c.pitch }); unpress(); }
    let looping = false;
    const loop = () => { if (!looping) { looping = true; requestAnimationFrame(step); } };
    function step() {
      looping = false; S.steps = (S.steps || 0) + 1; const m = S.mode, f = S.fix, now = performance.now(), dt = Math.min(1, (now - (S.tPrev || now - 16)) / 1000); S.tPrev = now;
      const k = 1 - Math.exp(-dt / .25);
      if (!(m === 'centred' || m === 'heading' || m === 'eye') || !f) return;
      const c = cam();
      if (S.set && (Math.abs(c.tx - S.set.tx) > .05 || Math.abs(c.tz - S.set.tz) > .05 || Math.abs(angDiff(c.yaw, S.set.yaw)) > 1e-3)) { S.set = null; if (m === 'eye') orbitAt(f); setMode('located'); return; }
      const gy = groundAt(f.x, f.z);
      if (m === 'eye') {
        const yaw = S.hv ? Math.atan2(S.hv[0], S.hv[1]) : (S.eyeYaw ?? -c.yaw), pitch = Math.max(-1.1, Math.min(1.1, S.pitch)), ey = gy + 1.6, cp = Math.cos(pitch), D = 100;
        const want = { tx: f.x + D * Math.sin(yaw) * cp, ty: ey + D * Math.sin(pitch), tz: f.z - D * Math.cos(yaw) * cp, yaw: -yaw, pitch: -pitch, dist: D };
        if (!eyeOn || Math.hypot(want.tx - c.tx, want.tz - c.tz) > .02 || Math.abs(want.ty - c.ty) > .02) setCam(want, true);
      } else {
        const dx = f.x - c.tx, dz = f.z - c.tz, d = Math.hypot(dx, dz), kk = d > 2000 || d < .3 ? 1 : k, n = { ...c };
        if (d > .01) { n.tx += dx * kk; n.tz += dz * kk; } n.ty += (gy - n.ty) * k;
        if (m === 'heading' && S.hv) { const want = -Math.atan2(S.hv[0], S.hv[1]), dd = angDiff(want, c.yaw); if (Math.abs(dd) > 1e-3) n.yaw += Math.abs(dd) < .003 ? dd : dd * k; }
        if (d > .01 || Math.abs(n.yaw - c.yaw) > 1e-6 || Math.abs(n.ty - c.ty) > .01) setCam(n);
      }
      const s = cam(); S.set = { tx: s.tx, tz: s.tz, yaw: s.yaw };
      looping = true; requestAnimationFrame(step);
    }
    const orbitAt = f => { const c = cam(); setCam({ tx: f.x, tz: f.z, ty: groundAt(f.x, f.z), yaw: c.yaw, dist: Math.min(c.dist, 400), pitch: .45 }); };

    // ---------- the button cycle
    btn.onclick = () => {
      const m = S.mode;
      if (m === 'off') { if (!iosAsk()) startOrient(); locate(); }
      else if (m === 'waiting') { stopWatch(); setMode('off'); }
      else if (m === 'located') { if (!S.fix) return; if (!inside(S.fix.x, S.fix.z)) return outsideMsg(); S.set = null; centreOn(false); setMode('centred'); }
      else if (m === 'centred') { S.set = null; askOrient(); setMode('heading'); noCompassCheck(); }
      else if (m === 'heading') { S.set = null; setMode('centred'); }
      else if (m === 'eye') { S.set = null; orbitAt(S.fix); setMode('centred'); }
    };
    { let t = 0; btn.addEventListener('pointerdown', () => { delete btn.dataset.lp; clearTimeout(t); t = setTimeout(() => { if (S.mode !== 'off') { off(); say('Location off'); setTimeout(() => say(''), 2000); btn.dataset.lp = '1'; } }, 800); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, () => clearTimeout(t));
      btn.addEventListener('click', e => { if (btn.dataset.lp) { delete btn.dataset.lp; e.stopImmediatePropagation(); } }, true); }
    eyeBtn.onclick = () => {
      if (S.mode === 'eye') { S.set = null; orbitAt(S.fix); setMode('heading'); return; }
      if (!S.fix) return; if (!inside(S.fix.x, S.fix.z)) return outsideMsg();
      S.set = null; S.eyeYaw = -cam().yaw; askOrient(); setMode('eye'); noCompassCheck();
    };
    function off() { stopWatch(); stopOrient(); S.fix = null; S.hv = null; S.set = null; if (S.mode === 'eye') orbitAt({ x: controls.target.x, z: controls.target.z }); setMode('off'); say(''); svg.style.display = 'none'; draw(); }
    document.addEventListener('visibilitychange', () => { if (S.mode === 'off') return; if (document.hidden) { stopWatch(); S.wasOrient = S.orient; stopOrient(); } else { startWatch(); if (S.wasOrient) startOrient(); } });

    // ---------- drawing (each frame): the dot, the accuracy circle on the ground, the heading beam
    const v = new THREE.Vector3();
    const proj = (x, y, z) => { v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse); if (-v.z < .5) return null; v.applyMatrix4(camera.projectionMatrix); const c = renderer.domElement; return [(v.x + 1) / 2 * c.clientWidth, (1 - v.y) / 2 * c.clientHeight]; };
    ctx.onFrame(() => {
      const f = S.fix; if (!f || S.mode === 'off' || S.mode === 'eye') { svg.style.display = 'none'; return; }
      camera.updateMatrixWorld(); const c = renderer.domElement, w = c.clientWidth, h = c.clientHeight, gy = groundAt(f.x, f.z) + .5, p = proj(f.x, gy, f.z);
      if (!p || p[0] < -200 || p[1] < -200 || p[0] > w + 200 || p[1] > h + 200) { svg.style.display = 'none'; return; }
      svg.style.display = ''; dot.setAttribute('cx', p[0].toFixed(1)); dot.setAttribute('cy', p[1].toFixed(1));
      let d = ''; for (let i = 0; i <= 48; i++) { const a = i / 48 * 2 * Math.PI, q = proj(f.x + f.acc * Math.sin(a), gy, f.z + f.acc * Math.cos(a)); if (!q) { d = ''; break; } d += (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }
      acc.setAttribute('d', d ? d + 'Z' : '');
      if (S.hv) { const q = proj(f.x + 20 * S.hv[0], gy, f.z - 20 * S.hv[1]);
        if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) > .5) { const a = Math.atan2(q[1] - p[1], q[0] - p[0]), L = 56, s = 30 * D2R, pt = t => (p[0] + L * Math.cos(t)).toFixed(1) + ' ' + (p[1] + L * Math.sin(t)).toFixed(1);
          cone.setAttribute('d', `M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${pt(a - s)}A${L} ${L} 0 0 1 ${pt(a + s)}Z`); const g = $('locBeam'); g.setAttribute('cx', p[0]); g.setAttribute('cy', p[1]); g.setAttribute('r', L); }
        else cone.setAttribute('d', ''); } else cone.setAttribute('d', '');
    });
    const api = { ownUi: true, off, showEdge, get state() { return { steps: S.steps, mode: S.mode, fix: S.fix && { x: +S.fix.x.toFixed(1), z: +S.fix.z.toFixed(1), acc: +S.fix.acc.toFixed(1) }, heading: S.hv ? +wrap360(Math.atan2(S.hv[0], S.hv[1]) * R2D).toFixed(2) : null, hsrc: S.hsrc, pitch: +(S.pitch * R2D).toFixed(1), watching: S.watch != null, orient: S.orient, outside: S.outside, msg: msg.hidden ? '' : msg.textContent, err: S.lastErr, conv: S.conv }; } };
    return api;
  },
};
