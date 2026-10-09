// Navigation checks of the Three.js port (main.js "navigation", the port of the WebGL page's nav.js): the ground limit and
// the pass Below ground and back (a slow drag), momentum and its stop by a touch or a press, a pinch about the point
// between the fingers, the round Below ground and Drone buttons, every drone vehicle (state, camera, controls, mode bar).
// Mouse at 1280 x 800, touch (CDP) at 390 x 844. Uses ?layers=under,drone,routes (the layers these need) for speed.
// Run from the repository root with a server on the root:
//   python3 -m http.server 8188 --bind 127.0.0.1 &
//   node docklands/test/nav-check.mjs [--base http://127.0.0.1:8188] [--webgpu] [--out docklands/test/out] [--only nav|drone]
// Skill: docklands-3d-page, "Three.js port: navigation".
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8188'), WEBGPU = process.argv.includes('--webgpu'), OUT = arg('--out', 'docklands/test/out'), ONLY = arg('--only', '');
mkdirSync(OUT, { recursive: true });
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
const tag = WEBGPU ? 'webgpu' : 'webgl2';
let ok = true; const errors = [];
const ad = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };   // yaw wraps at +-pi
const check = (c, msg) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`); if (!c) ok = false; };

async function open(w, h, touch, q = '') {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(`${BASE}/docklands/?view=cw&t=2026-10-09T13:00${WEBGPU ? '' : '&webgl'}&animate=0&weather=0&layers=under,drone,routes${q}`, { timeout: 400000 });
  await page.waitForFunction(() => globalThis.__docklands3?.ready && __docklands3.layers.under && __docklands3.layers.drone, null, { timeout: 400000 });
  await page.waitForTimeout(1000);
  return page;
}
const nav = page => page.evaluate(() => { const D = __docklands3, N = D.nav, s = N.get(), c = D.camera; c.updateMatrixWorld(); const e = new D.THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
  return { ...s, clr: +N.clearance().toFixed(3), under: N.isUnder(), gauge: D.layers.under.api.gaugeOn(), cut: D.layers.under.api.cutLevel(), passes: N.state.passes, moving: N.state.moving, flings: N.state.flings, lookUp: c.getWorldDirection(new D.THREE.Vector3()).y, eyeY: e.y, dig: document.getElementById('digBtn')?.getAttribute('aria-pressed'), digHidden: document.getElementById('digBtn')?.hidden }; });
const place = (page, c) => page.evaluate(c => { const D = __docklands3, g = D.nav.groundB(c.tx, c.tz); D.setCam({ ...c, ty: g }); D.draw(); }, c);

if (ONLY !== 'drone') {
  // ---------- the ground limit and the pass, mouse 1280 x 800
  const page = await open(1280, 800, false), cdp = await page.context().newCDPSession(page);
  let s = await nav(page);
  check(s.digHidden === false, `round Below ground button shown (hidden=${s.digHidden}, pressed=${s.dig})`);
  // a low view over Canary Wharf: eye about 40 m up, looking down 0.35 rad
  await place(page, { tx: 50, tz: 40, yaw: .7, pitch: .35, dist: 120 }); await page.waitForTimeout(300);
  // a slow drag up (the eye goes down): 15 px a step, 60 ms apart (CDP events with time stamps)
  const mouse = (type, x, y, t, buttons = 1) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, timestamp: t });
  let t = Date.now() / 1000, y = 600; const x = 640;
  await mouse('mousePressed', x, y, t);
  let minClr = Infinity, firstStop = null;
  for (let i = 0; i < 40; i++) { y -= 15; t += .06; await mouse('mouseMoved', x, y, t); const q = await nav(page); minClr = Math.min(minClr, q.clr); if (!firstStop && q.clr < 1.2) firstStop = q; if (q.passes) break; if (y < 120) { await mouse('mouseReleased', x, y, t, 0); y = 600; t += .1; await mouse('mousePressed', x, y, t); } }
  await mouse('mouseReleased', x, y, t + .05, 0); await page.waitForTimeout(500);
  s = await nav(page);
  check(firstStop && firstStop.clr >= 0.999, `slow drag up: the eye stops at the wall, clearance ${firstStop ? firstStop.clr : '?'} m (1 m), pitch ${firstStop ? firstStop.pitch.toFixed(4) : '?'}`);
  check(s.passes === 1 && s.under && s.gauge && s.clr < -1.4 && s.clr > -1.6 && s.lookUp > 0.15 && s.dig === 'true', `push on: passed Below ground (passes ${s.passes}, gauge ${s.gauge}, cut ${s.cut} m OD, clearance ${s.clr} m, pitch ${s.pitch.toFixed(3)}, looking up ${s.lookUp.toFixed(2)}, round button pressed ${s.dig})`);
  await page.screenshot({ path: `${OUT}/nav-under-${tag}.png`, timeout: 180000 });
  // and back: a slow drag down (the eye goes up) from below
  t += 1; y = 200; await mouse('mousePressed', x, y, t);
  for (let i = 0; i < 60; i++) { y += 15; t += .06; await mouse('mouseMoved', x, y, t); const q = await nav(page); if (q.passes >= 2) break; if (y > 700) { await mouse('mouseReleased', x, y, t, 0); y = 200; t += .1; await mouse('mousePressed', x, y, t); } }
  await mouse('mouseReleased', x, y, t + .05, 0); await page.waitForTimeout(500);
  s = await nav(page);
  check(s.passes === 2 && !s.under && !s.gauge && s.cut >= 250 && s.clr > 1.4, `push up from below: back above (passes ${s.passes}, gauge ${s.gauge}, cut ${s.cut}, clearance ${s.clr} m, round button ${s.dig})`);
  await page.screenshot({ path: `${OUT}/nav-above-${tag}.png`, timeout: 180000 });
  // six wheel notches in at the screen centre from a low eye: the wall holds (nav.js measured 2.29 m)
  await place(page, { tx: 50, tz: 40, yaw: .7, pitch: .08, dist: 60 }); await page.waitForTimeout(300);
  await page.mouse.move(640, 420); for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(150); }
  s = await nav(page); check(s.clr >= 0.999 && !s.under, `six wheel notches in from a low eye: clearance ${s.clr} m, not under (${s.under})`);
  // momentum: a fast drag left, released while moving; then a press with no move stops it
  await place(page, { tx: 50, tz: 40, yaw: .7, pitch: .5, dist: 900 }); await page.waitForTimeout(300);
  t = Date.now() / 1000 + 5; await mouse('mousePressed', 900, 400, t);
  for (let i = 1; i <= 8; i++) { t += .016; await mouse('mouseMoved', 900 - i * 25, 400, t); }
  await mouse('mouseReleased', 700, 400, t + .005, 0);
  const m0 = await nav(page); for (let i = 0; i < 30 && (await nav(page)).moving; i++) await page.waitForTimeout(500); const m1 = await nav(page);   // software frames take 1 to 5 s (more after a camera jump): wait until the fling (by time) has ended
  check(m0.flings >= 1 && ad(m1.yaw, m0.yaw) > 0.05, `a fast drag flings: flings ${m0.flings}, yaw went on by ${ad(m1.yaw, m0.yaw).toFixed(3)} rad (to the end: v TAU, at most 5 x 0.35 = 1.75 rad)`);
  t += 10; await mouse('mousePressed', 900, 400, t); for (let i = 1; i <= 8; i++) { t += .016; await mouse('mouseMoved', 900 - i * 25, 400, t); } await mouse('mouseReleased', 700, 400, t + .005, 0);
  const mf = await nav(page);
  await page.mouse.move(640, 400); await page.mouse.down(); const m2 = await nav(page); await page.waitForTimeout(800); const m3 = await nav(page); await page.mouse.up();
  check(mf.moving && !m2.moving && Math.abs(m3.yaw - m2.yaw) < 1e-6, `a second fling (moving ${mf.moving}), then a press stops it: moving ${m2.moving}, yaw change after the press ${Math.abs(m3.yaw - m2.yaw).toExponential(1)} rad`);
  // the round Below ground button: on (gauge open), off (gauge closed, cut off)
  await page.click('#digBtn'); s = await nav(page); const on = s.gauge && s.dig === 'true';
  await page.click('#digBtn'); s = await nav(page);
  check(on && !s.gauge && s.dig === 'false', `round Below ground button: on ${on}, then off (gauge ${s.gauge}, pressed ${s.dig})`);
  await page.close();

  // ---------- touch 390 x 844: pinch about the point between the fingers, momentum stopped by a touch
  const tp = await open(390, 844, true), tc = await tp.context().newCDPSession(tp);
  const touch = (type, pts, t) => tc.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1, radiusX: 2, radiusY: 2, force: 1 })), ...(t ? { timestamp: t } : {}) });
  await place(tp, { tx: 50, tz: 40, yaw: .7, pitch: .5, dist: 400 }); await tp.waitForTimeout(300);
  const gp = await tp.evaluate(() => { const D = __docklands3, c = D.camera, T = D.THREE; c.updateMatrixWorld(); const o = new T.Vector3().setFromMatrixPosition(c.matrixWorld), d = new T.Vector3(0, 560 / innerHeight * -2 + 1, .5); d.x = 0; d.unproject(c).sub(o).normalize();
    for (let s = 1; s < 5000; s += 1) { const p = o.clone().addScaledVector(d, s); if (p.y <= D.nav.groundB(p.x, p.z)) return p.toArray(); } return null; });
  const p0 = await nav(tp);
  await touch('touchStart', [[155, 560], [235, 560]]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [[155 - i * 10, 560], [235 + i * 10, 560]]); } await touch('touchEnd', []);
  await tp.waitForTimeout(400); const p1 = await nav(tp);
  const drift = await tp.evaluate(p => { const D = __docklands3, c = D.camera; c.updateMatrixWorld(); const v = new D.THREE.Vector3(...p).project(c); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, gp);
  check(p1.ld < p0.ld - .5 && Math.hypot(drift[0] - 195, drift[1] - 560) < 6, `pinch 80 -> 200 px: orbit distance ${Math.exp(p0.ld).toFixed(0)} -> ${Math.exp(p1.ld).toFixed(0)} m; the point between the fingers moved ${Math.hypot(drift[0] - 195, drift[1] - 560).toFixed(1)} px`);
  // a fast one-finger flick, then a touch stops it
  let tt = Date.now() / 1000 + 10; await touch('touchStart', [[300, 500]], tt);
  for (let i = 1; i <= 8; i++) { tt += .016; await touch('touchMove', [[300 - i * 25, 500]], tt); } await touch('touchEnd', [], tt + .005);
  const f0 = await nav(tp); for (let i = 0; i < 30 && (await nav(tp)).moving; i++) await tp.waitForTimeout(500); const f1 = await nav(tp);
  tt = Date.now() / 1000 + 15; await touch('touchStart', [[300, 500]], tt); for (let i = 1; i <= 8; i++) { tt += .016; await touch('touchMove', [[300 - i * 25, 500]], tt); } await touch('touchEnd', [], tt + .005); const fm = await nav(tp);
  await touch('touchStart', [[195, 400]]); const f2 = await nav(tp); await tp.waitForTimeout(700); const f3 = await nav(tp); await touch('touchEnd', []);
  check(f0.flings >= 1 && ad(f1.yaw, f0.yaw) > .03 && fm.moving && !f2.moving && Math.abs(f3.yaw - f2.yaw) < 1e-6, `touch flick: flings ${f0.flings}, went on ${ad(f1.yaw, f0.yaw).toFixed(3)} rad; a second flick (moving ${fm.moving}) and a touch stops it (moving ${f2.moving}, then ${Math.abs(f3.yaw - f2.yaw).toExponential(1)} rad)`);
  // a slow one-finger drag up into the ground on the phone: the pass
  await place(tp, { tx: 50, tz: 40, yaw: .7, pitch: .3, dist: 90 }); await tp.waitForTimeout(300);
  tt = Date.now() / 1000 + 20; let ty = 700; await touch('touchStart', [[195, ty]], tt);
  for (let i = 0; i < 80; i++) { ty -= 12; tt += .05; await touch('touchMove', [[195, ty]], tt); const q = await nav(tp); if (q.passes) break; if (ty < 150) { await touch('touchEnd', [], tt); ty = 700; tt += .1; await touch('touchStart', [[195, ty]], tt); } }
  await touch('touchEnd', [], tt + .05); await tp.waitForTimeout(400);
  const u1 = await nav(tp);
  check(u1.passes === 1 && u1.under && u1.clr < -1.4 && u1.lookUp > .15, `touch: slow drag up passes Below ground (clearance ${u1.clr} m, looking up ${u1.lookUp.toFixed(2)})`);
  await tp.screenshot({ path: `${OUT}/nav-under-390-${tag}.png`, timeout: 180000 });
  await tp.close();
}

if (ONLY !== 'nav') {
  // ---------- the drone: the round button, the mode bar, every vehicle (both sizes)
  for (const [w, h, touchDev] of [[390, 844, true], [1280, 800, false]]) {
    const page = await open(w, h, touchDev);
    const rb = await page.evaluate(() => { const b = document.getElementById('droneRound'), r = b.getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { hidden: b.hidden, top: e === b || b.contains(e), rect: [r.x, r.y, r.width, r.height].map(Math.round) }; });
    check(!rb.hidden && rb.top, `${w}x${h}: round Drone button shown and on top at ${rb.rect}`);
    await page.click('#droneRound'); await page.waitForTimeout(800);
    const bar = await page.evaluate(() => [...document.querySelectorAll('#drModes [data-mode], #drAuto, #drExit')].map(b => { const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { id: b.dataset.mode || b.id, vis: r.width > 0 && r.right <= innerWidth + 1 && r.left >= -1, top: e === b, y: Math.round(r.y), pressed: b.getAttribute('aria-pressed') }; }));
    check(bar.length === 8 && bar.every(b => b.vis && b.top), `${w}x${h}: mode bar ${bar.map(b => b.id + (b.vis && b.top ? '' : '(hidden)')).join(' ')} at y ${[...new Set(bar.map(b => b.y))].join(', ')}`);
    await page.screenshot({ path: `${OUT}/drone-bar-${w}-${tag}.png`, timeout: 180000 });
    for (const mode of ['copter', 'plane', 'boat', 'tube', 'walk', 'under']) {
      const r0 = await page.evaluate(async m => { const D = __docklands3; D.setView(m === 'boat' ? 'greenland' : 'cw'); await new Promise(r => setTimeout(r, 200)); const Dr = DocklandsDrone; const ok = await Dr.start(m); Dr.manual(true); return { ok, st: Dr.state }; }, mode);
      if (mode === 'boat' && !r0.ok) { console.log('     boat did not start at greenland: ' + r0.st.msg); }
      await page.click(`#drModes [data-mode="${mode}"]`).catch(() => {});   // the mode bar's button (same vehicle: a restart in place)
      const r = await page.evaluate(async () => { const D = __docklands3, Dr = DocklandsDrone; Dr.manual(true); const a = Dr.state; const b = Dr.step(4, 30); const c = D.camera; c.updateMatrixWorld(); const e = new D.THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
        return { mode: b.mode, moved: Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2], b.p[1] - a.p[1]), eye: e.toArray(), p: b.p, ctrl: D.controls.enabled, pressed: document.querySelector(`#drModes [data-mode="${b.mode}"]`)?.getAttribute('aria-pressed'), hud: document.getElementById('drHud').textContent, under: b.under, cut: b.cut ?? D.layers.under.api.cutLevel(), round: document.getElementById('droneRound').getAttribute('aria-pressed') }; });
      const camOk = Math.hypot(r.eye[0] - r.p[0], r.eye[1] - r.p[1], r.eye[2] - r.p[2]) < 0.5;
      check((r.mode === mode || (mode === 'copter' && r.mode === 'under')) && r.moved > 1 && camOk && !r.ctrl && r.pressed === 'true' && r.round === 'true', `${w}x${h} ${mode}: mode ${r.mode}, moved ${r.moved.toFixed(1)} m in 4 s (autopilot), camera at the drone ${camOk}, orbit off ${!r.ctrl}, bar button pressed ${r.pressed}, cut ${r.cut}; HUD "${r.hud}"`);
      if (w === 390) await page.screenshot({ path: `${OUT}/drone-${mode}-390-${tag}.png`, timeout: 180000 });
    }
    await page.evaluate(() => DocklandsDrone.manual(false));
    await page.click('#drExit'); await page.waitForTimeout(600);
    const e = await page.evaluate(() => ({ on: DocklandsDrone.on, ctrl: __docklands3.controls.enabled, round: document.getElementById('droneRound').getAttribute('aria-pressed'), body: document.body.classList.contains('drone') }));
    check(!e.on && e.ctrl && e.round === 'false' && !e.body, `${w}x${h}: the cross leaves the drone (orbit back ${e.ctrl}, round button ${e.round})`);
    // the Menu > Go entry is still there
    const mb = await page.evaluate(() => !!document.querySelector('#goMove #droneBtn'));
    check(mb, `${w}x${h}: Menu > Go > Move still has the Drone button`);
    await page.close();
  }
}
check(!errors.length, `no page or console errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await browser.close();
process.exit(ok ? 0 : 1);
