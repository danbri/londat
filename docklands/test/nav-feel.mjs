// Navigation feel, in numbers: turn and pan per pixel, zoom per wheel notch and per pinch, the lag after a drag, whether a
// press stops the motion, at eye heights of 10, 100 and 1500 m over Canary Wharf (1280 x 800). Two ways to get there:
// "placed" (a camera looking down 0.5 rad at the ground, the orbit target on the ground) and "wheeled" (the Mudchute view, then
// wheel notches at the screen centre until the eye is that low: what the owner did on a phone). Events are synthetic
// PointerEvents and WheelEvents dispatched in the page (no frame wait: in software one real input event waits up to 5 s
// for a frame); setPointerCapture is stubbed for them. Run it on two servers to compare two versions of the page.
//   python3 -m http.server 8188 --bind 127.0.0.1 &
//   node docklands/test/nav-feel.mjs [--base http://127.0.0.1:8188] [--webgpu] [--json out.json]
// Uses ?layers= (no data layers) for speed. Skill: docklands-3d-page, "Three.js port: navigation".
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8188'), WEBGPU = process.argv.includes('--webgpu'), JSON_OUT = arg('--json', '');
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('pageerror: ' + e.message));
await page.goto(`${BASE}/docklands/?view=cw&t=2026-10-09T13:00${WEBGPU ? '' : '&webgl'}&animate=0&weather=0&layers=`, { timeout: 400000 });
await page.waitForFunction(() => globalThis.__docklands3?.ready, null, { timeout: 400000 });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  Element.prototype.setPointerCapture = function () {}; Element.prototype.releasePointerCapture = function () {};
  const D = __docklands3, cv = D.renderer.domElement, T = D.THREE;
  let id = 100;
  const pe = (type, x, y, o = {}) => { const e = new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: o.id ?? 1, pointerType: o.type || 'mouse', isPrimary: o.primary ?? true, button: o.button ?? 0, buttons: type === 'pointerup' ? 0 : (o.button === 2 ? 2 : 1) });
    (type === 'pointerdown' ? cv : type === 'pointermove' || type === 'pointerup' ? (o.doc ? document : cv) : cv).dispatchEvent(e); };
  const st = () => { const c = D.camera; c.updateMatrixWorld(); const e = new T.Vector3().setFromMatrixPosition(c.matrixWorld), s = D.camState(); return { tx: s.tx, tz: s.tz, yaw: s.yaw, pitch: s.pitch, dist: s.dist, eye: e.toArray(), agl: e.y - D.ctx.groundAt(e.x, e.z) }; };
  const under = (x, y) => { const c = D.camera; c.updateMatrixWorld(); const o = new T.Vector3().setFromMatrixPosition(c.matrixWorld), d = new T.Vector3(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1, .5).unproject(c).sub(o).normalize();
    for (let s = .25; s < 20000; s += s < 50 ? .25 : s < 500 ? 1 : 5) { const p = o.clone().addScaledVector(d, s); if (p.y <= D.ctx.groundAt(p.x, p.z)) return { p, range: s }; } return null; };
  const proj = p => { const c = D.camera; c.updateMatrixWorld(); const v = p.clone().project(c); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };
  // the events: OrbitControls listens on the canvas (down) and on the document (move, up); main.js navigation on the canvas
  const drag = (x0, y0, dx, dy, n, o = {}) => { const k = ++id; pe('pointerdown', x0, y0, { ...o, id: k }); for (let i = 1; i <= n; i++) { pe('pointermove', x0 + dx * i / n, y0 + dy * i / n, { ...o, id: k }); } return () => pe('pointerup', x0 + dx, y0 + dy, { ...o, id: k }); };
  const wheel = (x, y, dy) => cv.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaY: dy, deltaMode: 0 }));
  const pinch = (x, y, a, b, n) => { const i1 = ++id, i2 = ++id, o = { type: 'touch' }; pe('pointerdown', x - a / 2, y, { ...o, id: i1 }); pe('pointerdown', x + a / 2, y, { ...o, id: i2, primary: false });
    for (let i = 1; i <= n; i++) { const w = a + (b - a) * i / n; pe('pointermove', x - w / 2, y, { ...o, id: i1 }); pe('pointermove', x + w / 2, y, { ...o, id: i2, primary: false }); }
    pe('pointerup', x - b / 2, y, { ...o, id: i1 }); pe('pointerup', x + b / 2, y, { ...o, id: i2, primary: false }); };
  globalThis.__feel = { pe, st, under, proj, drag, wheel, pinch };
});
const wait = ms => page.waitForTimeout(ms);
const r4 = x => +x.toFixed(4);
const place = h => page.evaluate(h => { const D = __docklands3; D.setCam({ tx: 50, tz: 40, ty: D.ctx.groundAt(50, 40), yaw: .7, pitch: .5, dist: h / Math.sin(.5) }); D.controls.update(); }, h);
const wheeled = h => page.evaluate(h => { const D = __docklands3; D.setView('mudchute'); D.controls.update(); for (let i = 0; i < 400 && __feel.st().agl > h; i++) { __feel.wheel(640, 400, -100); D.controls.update(); } return __feel.st(); }, h);
const out = {};
for (const mode of ['placed', 'wheeled']) for (const h of [10, 100, 1500]) {
  const R = out[`${mode} ${h} m`] = {}, reset = async () => { if (mode === 'placed') await place(h); else await wheeled(h); await wait(1200); return page.evaluate(() => __feel.st()); };
  let s0 = await reset(); R.eyeAgl = +s0.agl.toFixed(1); R.orbitDist = +s0.dist.toFixed(1);
  // turn: a 40 px drag left in 8 moves
  let r = await page.evaluate(() => { const a = __feel.st(), up = __feel.drag(640, 500, -40, 0, 8), b = __feel.st(); up(); return { a, b }; });
  await wait(1600); let s1 = await page.evaluate(() => __feel.st());
  R.turnRadPerPx = r4(Math.abs(s1.yaw - r.a.yaw) / 40); R.turnLagAtRelease = r4(1 - Math.abs(r.b.yaw - r.a.yaw) / Math.max(1e-9, Math.abs(s1.yaw - r.a.yaw)));
  R.eyeMetresPerPxOfTurn = +(Math.hypot(s1.eye[0] - r.a.eye[0], s1.eye[2] - r.a.eye[2]) / 40).toFixed(3);
  // pan: a right-button drag of 40 px: metres a pixel, and where the ground point under the start pixel ends (grab: 40 px away)
  s0 = await reset();
  r = await page.evaluate(() => { const g = __feel.under(640, 500); __feel.drag(640, 500, 40, 0, 8, { button: 2 })(); return { g: g && { p: g.p.toArray(), range: g.range } }; });
  await wait(1600); s1 = await page.evaluate(() => __feel.st());
  R.panMetresPerPx = +(Math.hypot(s1.tx - s0.tx, s1.tz - s0.tz) / 40).toFixed(3);
  if (r.g) { R.groundRange = +r.g.range.toFixed(1); const q = await page.evaluate(p => __feel.proj(new __docklands3.THREE.Vector3(...p)), r.g.p); R.panPointMovedPx = +Math.hypot(q[0] - 640, q[1] - 500).toFixed(1); }
  // zoom: one wheel notch (deltaY -100) at the pointer; the share of the distance to the ground point under it, and its drift
  s0 = await reset();
  r = await page.evaluate(() => { const g = __feel.under(640, 500); __feel.wheel(640, 500, -100); return g && { p: g.p.toArray() }; });
  await wait(1600); s1 = await page.evaluate(() => __feel.st());
  if (r) { const d0 = Math.hypot(...s0.eye.map((v, i) => v - r.p[i])), d1 = Math.hypot(...s1.eye.map((v, i) => v - r.p[i])); R.zoomNotchShare = r4(1 - d1 / d0); R.zoomNotchMetres = +(d0 - d1).toFixed(2); const q = await page.evaluate(p => __feel.proj(new __docklands3.THREE.Vector3(...p)), r.p); R.zoomPointDriftPx = +Math.hypot(q[0] - 640, q[1] - 500).toFixed(1); }
  // pinch 100 -> 200 px about (640, 500)
  s0 = await reset();
  r = await page.evaluate(() => { const g = __feel.under(640, 500); __feel.pinch(640, 500, 100, 200, 6); return g && { p: g.p.toArray() }; });
  await wait(1600); s1 = await page.evaluate(() => __feel.st());
  if (r) { const d0 = Math.hypot(...s0.eye.map((v, i) => v - r.p[i])), d1 = Math.hypot(...s1.eye.map((v, i) => v - r.p[i])); R.pinchDoubleShare = r4(1 - d1 / d0); const q = await page.evaluate(p => __feel.proj(new __docklands3.THREE.Vector3(...p)), r.p); R.pinchPointDriftPx = +Math.hypot(q[0] - 640, q[1] - 500).toFixed(1); }
  // a fast drag (6 x 30 px, 16 ms apart in real time), then a press with no move: does the turn stop?
  s0 = await reset();
  await page.evaluate(async () => { const k = 9000; __feel.pe('pointerdown', 900, 400, { id: k }); for (let i = 1; i <= 6; i++) { await new Promise(r => setTimeout(r, 16)); __feel.pe('pointermove', 900 - i * 30, 400, { id: k }); } __feel.pe('pointerup', 720, 400, { id: k }); });
  await wait(300); const a = await page.evaluate(() => { __feel.pe('pointerdown', 640, 400, { id: 9001 }); return __feel.st(); });
  await wait(1500); const b = await page.evaluate(() => { const s = __feel.st(); __feel.pe('pointerup', 640, 400, { id: 9001 }); return s; });
  R.turnAfterPressRad = r4(Math.abs(b.yaw - a.yaw));
  console.log(`${mode} ${h} m`, JSON.stringify(R));
}
await browser.close();
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
