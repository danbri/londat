// Headless check of the 3D page's WebXR layer (xr-layer.js) with the WebXR mock (webxr-mock.js): the headset button and
// its menu, a stereo session (two eyes, controller ray on a panel row, street mode and its depth range, exit), and the
// one-eye preview (?xr=preview&go) with a tap on a label. Exits 1 on a page error or a failed step.
//   python3 -m http.server 8791 --bind 127.0.0.1 &      (from the repository root)
//   node cwplans/docklands/test/xr-check.mjs [http://127.0.0.1:8791] [out-dir for PNGs]
// Skill: docklands-3d-page, "WebXR".
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const BASE = process.argv[2] || 'http://127.0.0.1:8791', OUT = process.argv[3] || null, MOCK = readFileSync(new URL('./webxr-mock.js', import.meta.url), 'utf8');
if (OUT) mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const fails = [], ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };
async function open(w, h, dpr, q, mock) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })).newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  if (mock) await page.addInitScript(MOCK); await page.goto(BASE + '/cwplans/docklands/index.html' + q, { timeout: 240000, waitUntil: 'domcontentloaded' }); return { page, errors };
}
// a frame and its read in one task: the canvas has no preserveDrawingBuffer
const save = async (page, name) => { if (!OUT) return; const png = await page.evaluate(() => { if (window.__xrMock && __xrMock.session) __xrMock.step(); return document.getElementById('c').toDataURL('image/png'); }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(png.split(',')[1], 'base64')); };
{ // stereo session with the mock
  const { page, errors } = await open(1600, 800, 1, '', true);
  await page.waitForFunction(() => window.__docklands?.AT && document.getElementById('xrBtn'), null, { timeout: 240000 }); await page.waitForTimeout(3000);
  await page.click('#xrBtn'); const menu = await page.$$eval('button', bs => bs.map(b => b.textContent).filter(t => /^Headset|^Preview/.test(t)));
  ok(menu.length === 3, `menu: ${menu.join(' | ')}`);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Headset: virtual room').click());
  await page.waitForFunction(() => window.DocklandsXR.active && window.DocklandsXR.S.data, null, { timeout: 60000 });
  const r = await page.evaluate(() => { const X = DocklandsXR, S = X.S; S.listT = -1e9; __xrMock.step(); __xrMock.step(); const a = { panels: S.panels.map(p => !!p.tex), places: S.data.places.length, events: S.data.events.length };
    const P = X.P.places, hit = P.hits.find(h => h[4] === 'cat:catering'), u = ((hit[0] + hit[2]) / 2) / P.cv.width - .5, v = .5 - ((hit[1] + hit[3]) / 2) / P.cv.height;
    const t = [0, 1, 2].map(i => P.c[i] + P.R[i] * u * P.w + P.U[i] * v * P.h), o = [.2, 1.2, -.2], d = t.map((x, i) => x - o[i]), n = Math.hypot(...d);
    __xrMock.ray = { o, d: d.map(x => x / n) }; __xrMock.select(); __xrMock.step(); __xrMock.step();
    return { ...a, lit: S.cats.has('catering'), beacons: !!S.hiMesh, frames: __xrMock.frames }; });
  await page.evaluate(() => { __xrMock.step(); }); await save(page, 'stereo-table');
  ok(r.panels.every(Boolean) && r.places > 1000 && r.events > 50, `stereo: 4 panels drawn, ${r.places} places, ${r.events} events`);
  ok(r.lit && r.beacons, 'controller ray on the Places row "Food and drink" lights its beacons');
  const dr = await page.evaluate(() => { const S = DocklandsXR.S, o0 = S.O.slice(); __xrMock.ray = { o: [0, 1.0, -.2], d: [0, -.6, -1] }; __xrMock.step(); __xrMock.step();
    __xrMock.press(0); __xrMock.ray = { o: [.2, 1.1, -.2], d: [0, -.6, -1] }; __xrMock.step(); __xrMock.release(0); const o1 = S.O.slice();
    __xrMock.ray = { o: [-.1, 1.0, -.3], d: [0, -.6, -1] }; __xrMock.ray2 = { o: [.1, 1.0, -.3], d: [0, -.6, -1] }; __xrMock.step(); const s0 = S.s;
    __xrMock.press(0); __xrMock.press(1); __xrMock.ray = { o: [-.2, 1.0, -.3], d: [0, -.6, -1] }; __xrMock.ray2 = { o: [.2, 1.0, -.3], d: [0, -.6, -1] }; __xrMock.step(); __xrMock.release(1); __xrMock.release(0); __xrMock.ray2 = null;
    return { dx: o1[0] - o0[0], dy: o1[1] - o0[1], k: S.s / s0 }; });
  ok(Math.abs(dr.dx - .2) < 1e-6 && Math.abs(dr.dy - .1) < 1e-6, `one-hand drag moves the table by the hand (${dr.dx.toFixed(3)}, ${dr.dy.toFixed(3)} m)`);
  ok(Math.abs(dr.k - 2) < 1e-6, `two-hand pinch apart doubles the scale (x${dr.k.toFixed(3)})`);
  const sty = await page.evaluate(async () => { await DocklandsXR.act('style', DocklandsXR.P.bar); await new Promise(r => setTimeout(r, 2500)); __xrMock.step(); __xrMock.step(); return globalThis.DocklandsLines && DocklandsLines.mode; });
  await save(page, 'stereo-lines'); ok(sty === 'lines', 'Style: Line drawing in a session (' + sty + ')');
  await page.evaluate(async () => { await DocklandsXR.act('style', DocklandsXR.P.bar); await new Promise(r => setTimeout(r, 1500)); await DocklandsXR.act('style', DocklandsXR.P.bar); await new Promise(r => setTimeout(r, 1500)); __xrMock.step(); });
  const dn = await page.evaluate(async () => { const X = DocklandsXR; X.act('drone', X.P.bar); await new Promise(r => setTimeout(r, 1500)); __xrMock.step(); const p0 = DocklandsDrone.S.p.slice();
    for (let k = 0; k < 20; k++) { await new Promise(r => setTimeout(r, 50)); __xrMock.step(); } const p1 = DocklandsDrone.S.p.slice(), c = X.S.c.slice();
    const r = { on: DocklandsDrone.on, mode: X.S.mode, moved: Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), atEye: Math.hypot(c[0] - p1[0], c[2] - p1[2]) };
    for (let k = 0; k < 6; k++) { X.act('drone', X.P.bar); await new Promise(r => setTimeout(r, 400)); __xrMock.step(); } r.off = !DocklandsDrone.on; r.after = X.S.mode; return r; });
  ok(dn.on && dn.mode === 'ride' && dn.moved > .1 && dn.atEye < .5 && dn.off && dn.after === 'table', `Drone: ride a copter stepped by the headset frames (moved ${dn.moved.toFixed(2)} m), off returns to the table`);
  const pd = await page.evaluate(() => { const X = DocklandsXR, S = X.S, M = __xrMock; M.ray = { o: [.2, 1.2, -.2], d: [0, -.3, -1] }; M.ray2 = { o: [-.2, 1.2, -.2], d: [0, -.3, -1] };
    M.pads = [M.pad(), M.pad()]; M.step(); const c0 = S.c.slice(); M.pads[1].axes[3] = -1; for (let k = 0; k < 10; k++) M.step(); M.pads[1].axes[3] = 0; const c1 = S.c.slice();
    M.pads[0].buttons[4].pressed = true; M.step(); M.pads[0].buttons[4].pressed = false; M.step(); const m1 = S.mode; M.pads[0].buttons[4].pressed = true; M.step(); M.pads[0].buttons[4].pressed = false; M.step();
    const r = { moved: Math.hypot(c1[0] - c0[0], c1[2] - c0[2]), m1, m2: S.mode }; M.pads = [null, null]; M.ray2 = null; return r; });
  ok(pd.moved > 50 && pd.m1 === 'street' && pd.m2 === 'table', `controllers: left stick moves over the map (${pd.moved.toFixed(0)} m), A goes to Street and back`);
  const rl = await page.evaluate(() => { const v = () => +document.getElementById('vz').value, a = v(); DocklandsXR.act('mode:table', DocklandsXR.P.bar); const t0 = v(); DocklandsXR.act('relief', DocklandsXR.P.bar); const t1 = v(); DocklandsXR.act('mode:street', DocklandsXR.P.bar); const s1 = v(); DocklandsXR.act('mode:table', DocklandsXR.P.bar); return { a, t0, t1, s1, back: v() }; });
  ok(rl.t0 === 2.5 && rl.t1 === 4 && rl.s1 === 1 && rl.back === 4, `relief: table ${rl.t0}x, Relief button ${rl.t1}x, street ${rl.s1}x, table again ${rl.back}x`);
  const st = await page.evaluate(() => { DocklandsXR.act('mode:street', DocklandsXR.P.bar); __xrMock.step(); return [DocklandsXR.S.mode, __xrMock.session.renderState.depthNear, __xrMock.session.renderState.depthFar]; });
  await save(page, 'stereo-street'); ok(st[0] === 'street' && st[1] === .25 && st[2] === 16000, `street mode, depth ${st[1]} to ${st[2]} m`);
  const ex = await page.evaluate(() => { DocklandsXR.act('exit', DocklandsXR.P.bar); return [DocklandsXR.active, +document.getElementById('vz').value]; }); ok(ex[0] === false && ex[1] === 1, `exit ends the session; the page's relief back to ${ex[1]}x`);
  ok(!errors.length, 'stereo: no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await page.context().close();   // the next page shares the software GPU
}
{ // the preview at phone size
  const { page, errors } = await open(390, 844, 3, '?xr=preview&go', false);
  await page.waitForFunction(() => window.DocklandsXR?.active && window.DocklandsXR.S.data, null, { timeout: 240000 }); await page.waitForTimeout(2000);
  const r = await page.evaluate(() => { const X = DocklandsXR, S = X.S, s = S.session; X.act('cat:catering', X.P.places); S.listT = -1e9; s.dirty = true; s.last = 0; s.loop(); s.dirty = true; s.loop();
    const l = X.LAB.items.find(l => !l.ev && !l.focus && !l.mk); if (!l) return { label: null }; const p = X.toUser(l.x, l.y, l.z), o = S.head, d = p.map((v, i) => v - o[i]), n = Math.hypot(...d);
    s.fire('select', { o, d: d.map(v => v / n) }); s.dirty = true; s.loop(); return { label: l.text, focus: S.focus && S.focus.kind }; });
  await page.waitForTimeout(2500); await page.evaluate(() => { const s = DocklandsXR.S.session; s.dirty = true; s.last = 0; s.loop(); }); await save(page, 'preview-phone');
  ok(!!r.focus, `preview: a tap on the label "${r.label}" gives a ${r.focus} focus`);
  ok(!errors.length, 'preview: no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
}
await browser.close(); process.exit(fails.length ? 1 : 0);
