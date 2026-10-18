// Checks the globe's gesture logic (docklands/globe/globe.js) with synthetic pointer and wheel events sent faster than the
// page draws (a phone sends 2 to 4 touch moves a frame): (1) one-finger drag keeps the grabbed ground point under the
// finger; (2) the wheel zooms in and out about the pointer (the point under it stays there); (3) a two-finger twist turns
// the map with the fingers; (4) a pinch keeps the point between the fingers fixed; (5) right-drag turns the same way in
// the globe and in the model. Prints the error in screen pixels; exit 1 when one is over its limit.
//   python3 -m http.server 8190 --bind 127.0.0.1 &
//   node docklands/test/globe-controls.mjs [--base http://127.0.0.1:8190]
// Skill: docklands-3d-page, "Globe controls".
import { chromium } from '@playwright/test';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8190');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } }), errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.goto(`${BASE}/docklands/?ll=48,10,1500000&ht=0,0&webgl&animate=0&weather=0`);
await page.waitForFunction(() => window.__docklands3?.globe?.ready && window.__docklands3.globe.mode === 'globe', null, { timeout: 240000 });
await page.waitForTimeout(1500);
let bad = 0;
const report = (name, err, lim, extra = '') => { const ok = err <= lim; if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${typeof err === 'number' ? err.toFixed(1) : err} (limit ${lim}) ${extra}`); };
// helpers in the page: synthetic events on the canvas, no frame between them
await page.evaluate(() => {
  const cv = document.querySelector('canvas'), G = __docklands3.globe;
  const pe = (type, id, x, y, o = {}) => cv.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, pointerType: 'touch', button: o.button ?? 0, buttons: 1, shiftKey: !!o.shift }));
  const off = (P, x, y) => { const s = G.project(P); return s ? Math.hypot(s[0] - x, s[1] - y) : 9999; };
  window.__gc = { cv, G, pe, off };
});
// (1) drag
for (const tilt of [0, 50]) {
  await page.evaluate(t => window.docklands.goTo({ lat: 48, lon: 10, alt_m: t ? 400000 : 1500000, heading_deg: 30, tilt_deg: t }), tilt);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => { const { G, pe, off } = __gc, x0 = 450, y0 = 420, g = G.pick(x0, y0); pe('pointerdown', 1, x0, y0);
    let x = x0, y = y0, worst = 0; for (let i = 1; i <= 40; i++) { x = x0 + i * 6; y = y0 - i * 4; pe('pointermove', 1, x, y); }
    G.pick(x, y); const e = off(g.P, x, y); pe('pointerup', 1, x, y); return { e, o: G.orbit() }; });
  report(`one-finger drag, tilt ${tilt}: grabbed point from the finger after 40 moves in one frame (px)`, r.e, 3);
}
// (2) wheel about the pointer, in and out
for (const [dy, tilt] of [[-120, 0], [120, 0], [-120, 45], [120, 45]]) {
  await page.evaluate(t => window.docklands.goTo({ lat: 48, lon: 10, alt_m: 800000, heading_deg: 0, tilt_deg: t }), tilt);
  await page.waitForTimeout(300);
  const r = await page.evaluate(dy => { const { G, cv, off } = __gc, x = 650, y = 250, g = G.pick(x, y), r0 = G.orbit().range;
    for (let i = 0; i < 5; i++) cv.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    G.pick(x, y); return { e: off(g.P, x, y), k: G.orbit().range / r0 }; }, dy);
  report(`wheel ${dy < 0 ? 'in ' : 'out'} at tilt ${tilt}: point under the pointer moved (px)`, r.e, 3, `range x ${r.k.toFixed(2)}`);
}
// (3) twist clockwise on the screen: the map must turn clockwise too (north arrow turns clockwise = heading falls)
await page.evaluate(() => window.docklands.goTo({ lat: 48, lon: 10, alt_m: 800000, heading_deg: 0, tilt_deg: 0 }));
await page.waitForTimeout(300);
const tw = await page.evaluate(() => { const { G, pe } = __gc, c = [450, 350], R = 120, h0 = G.orbit().heading;
  const at = a => [c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)];
  let a = 0; pe('pointerdown', 1, ...at(a)); pe('pointerdown', 2, ...at(a + Math.PI));
  for (let i = 0; i < 20; i++) { a += 0.02; pe('pointermove', 1, ...at(a)); pe('pointermove', 2, ...at(a + Math.PI)); }   // +a = clockwise (y down)
  pe('pointerup', 1, ...at(a)); pe('pointerup', 2, ...at(a + Math.PI)); return { dh: (G.orbit().heading - h0) * 180 / Math.PI, turned: a * 180 / Math.PI }; });
report('two-finger twist 23 deg clockwise: heading change (deg, must be about -23)', Math.abs(tw.dh + tw.turned), 3, `heading change ${tw.dh.toFixed(1)}`);
// (4) pinch out about a point off centre
await page.evaluate(() => window.docklands.goTo({ lat: 48, lon: 10, alt_m: 800000, heading_deg: 0, tilt_deg: 0 }));
await page.waitForTimeout(300);
const pn = await page.evaluate(() => { const { G, pe, off } = __gc, c = [600, 300], g = G.pick(...c), r0 = G.orbit().range; let d = 40;
  pe('pointerdown', 1, c[0] - d, c[1]); pe('pointerdown', 2, c[0] + d, c[1]);
  for (let i = 0; i < 20; i++) { d += 4; pe('pointermove', 1, c[0] - d, c[1]); pe('pointermove', 2, c[0] + d, c[1]); }
  G.pick(...c); const e = off(g.P, ...c); pe('pointerup', 1, c[0] - d, c[1]); pe('pointerup', 2, c[0] + d, c[1]); return { e, k: G.orbit().range / r0 }; });
report('pinch out x3 off centre: point between the fingers moved (px)', pn.e, 4, `range x ${pn.k.toFixed(2)} (expect 0.33)`);
// (4b) fling (owner, 2026-10-13: "No momentum-inertia"; globe.js release / stepFling): a quick drag, released while moving,
// glides on in the same direction and stops by itself
await page.evaluate(() => window.docklands.goTo({ lat: 48, lon: 10, alt_m: 2000000, heading_deg: 0, tilt_deg: 0 }));
await page.waitForTimeout(300);
const fl = await page.evaluate(async () => { const { G, pe } = __gc, wait = ms => new Promise(ok => setTimeout(ok, ms)); let x = 450; const y = 350;
  pe('pointerdown', 1, x, y); for (let i = 0; i < 8; i++) { x -= 15; pe('pointermove', 1, x, y); await wait(12); }
  const lon0 = G.orbit().lon; pe('pointerup', 1, x, y); const lonUp = G.orbit().lon;
  const t0 = performance.now(); while (performance.now() - t0 < 4000) { __docklands3.draw(); await new Promise(ok => requestAnimationFrame(ok)); }
  const lon1 = G.orbit().lon; await wait(600); const lon2 = G.orbit().lon;
  return { dragged: lonUp - lon0, glide: lon1 - lonUp, after: lon2 - lon1, dragLon: lon0 }; });
console.log(`     fling: glide ${fl.glide.toFixed(2)} deg after release, then ${fl.after.toFixed(4)} deg (stopped)`);
if (!(fl.glide > 0.3 && Math.abs(fl.after) < 0.01)) { bad++; console.log('FAIL the fling on the globe does not glide on (east, for a drag to the left) and stop', JSON.stringify(fl)); } else console.log('ok   a fling on the globe glides on in the drag direction and stops');
// (5) the turn gesture to the right (globe: Shift drag; model: plain drag): the heading must change the same way
const gl = await page.evaluate(() => { const { G, pe } = __gc, h0 = G.orbit().heading; pe('pointerdown', 1, 400, 300, { shift: true }); for (let i = 1; i <= 10; i++) pe('pointermove', 1, 400 + i * 5, 300, { shift: true }); pe('pointerup', 1, 450, 300); return G.orbit().heading - h0; });
await page.evaluate(() => window.docklands.goTo({ view: 'cw' }));
await page.waitForFunction(() => __docklands3.globe.mode === 'model' && __docklands3.ready, null, { timeout: 240000 });
await page.waitForTimeout(500);
const hd = () => page.evaluate(() => { const v = window.docklands.getView(); return v.heading_deg ?? v.heading ?? v.camera?.heading_deg; });
const ml = { h0: await hd() };
await page.mouse.move(400, 300);   // the model: a plain drag turns (main.js); the globe: right or Shift drag turns
 await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(400 + i * 5, 300);
await page.mouse.up(); await page.waitForTimeout(800); ml.h1 = await hd();
const mh = ((ml.h1 - ml.h0 + 540) % 360) - 180;
console.log(`     turn drag right: globe heading ${(gl * 180 / Math.PI).toFixed(1)} deg; model heading ${mh.toFixed(1)} deg`);
if (!(isFinite(mh) && Math.sign(mh) === Math.sign(gl))) { bad++; console.log('FAIL the turn drag turns the globe and the model in opposite directions'); } else console.log('ok   the turn drag turns the same way in both');
for (const e of errors.filter(e => !/setPointerCapture/.test(e))) { bad++;   // (synthetic pointer ids have no capture)
  console.log('pageerror', e.slice(0, 200)); }
await browser.close();
console.log(bad ? `${bad} failed` : 'all passed');
process.exit(bad ? 1 : 0);
