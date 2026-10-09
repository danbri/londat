// Headless check of the headset mode of the Three.js port (docklands/xr.js, layer "xr") with the WebXR mock
// (webxr-mock.js): the headset button and its menu, a stereo session on the WebGL 2 backend through three.js renderer.xr
// (two eyes drawn, controller ray on a panel row, one-hand drag, two-hand pinch, relief 2.5 on the table and 1 in the
// street, the street depth range, a pick, Exit restores the page), and the one-eye preview (?xr=preview&go) at phone size
// with a tap on a label. With --webgpu also: the preview on the WebGPU backend, and the headset menu offers the reload to
// WebGL 2. Exits 1 on a page error or a failed step.
//   python3 -m http.server 8266 --bind 127.0.0.1 &      (from the repository root)
//   node docklands/test/xr-check.mjs [--base http://127.0.0.1:8266] [--out dir] [--webgpu]
// Skill: docklands-3d-page, "WebXR" and "Three.js port".
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8266'), OUT = arg('--out', 'docklands/test/out'), WEBGPU = process.argv.includes('--webgpu');
const MOCK = readFileSync(new URL('./webxr-mock.js', import.meta.url), 'utf8');
mkdirSync(OUT, { recursive: true });
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
const fails = [], ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };
const LAYERS = 'registry,locate,xr';
async function open(w, h, dpr, q, mock) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })).newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  if (mock) await page.addInitScript(MOCK);
  await page.goto(`${BASE}/docklands/?${q}`, { timeout: 240000, waitUntil: 'domcontentloaded' }); return { page, errors };
}
// a frame and its read in one task (the canvas has no preserveDrawingBuffer); also the mean and spread of the luma of each half
const grab = async (page, name, step) => {
  const r = await page.evaluate(step => {
    if (step && window.__xrMock && __xrMock.session) __xrMock.step(); else if (window.DocklandsXR3 && DocklandsXR3.S.preview && DocklandsXR3.active) DocklandsXR3.renderNow();
    const cv = __docklands3.renderer.domElement, url = cv.toDataURL('image/png'), c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
    const g = c2.getContext('2d'); g.drawImage(cv, 0, 0); const d = g.getImageData(0, 0, c2.width, c2.height).data, half = [[0, 0, 0], [0, 0, 0]];
    for (let y = 0; y < c2.height; y += 4) for (let x = 0; x < c2.width; x += 4) { const i = (y * c2.width + x) * 4, l = (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) / 255, h = x < c2.width / 2 ? 0 : 1; half[h][0]++; half[h][1] += l; half[h][2] += l * l; }
    const st = half.map(([n, s, s2]) => ({ mean: s / n, sd: Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) }));
    return { url, st, w: cv.width, h: cv.height };
  }, step);
  if (OUT) writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.url.split(',')[1], 'base64'));
  return r;
};
{ // stereo session with the mock (WebGL 2 backend)
  const { page, errors } = await open(1600, 800, 1, `view=cw&webgl&animate=0&layers=${LAYERS}`, true);
  await page.waitForFunction(() => window.__docklands3?.ready && document.getElementById('xrBtn'), null, { timeout: 240000 }); await page.waitForTimeout(2000);
  await page.click('#xrBtn'); const menu = await page.$$eval('#xrMenu button', bs => bs.map(b => b.textContent));
  ok(menu.length === 3, `menu: ${menu.join(' | ')}`);
  const cam0 = await page.evaluate(() => __docklands3.camState());
  await page.evaluate(() => document.querySelector('#xrMenu button[data-kind="immersive-vr"]').click());
  await page.waitForFunction(() => window.DocklandsXR3?.active && DocklandsXR3.S.data, null, { timeout: 120000 });
  const r = await page.evaluate(() => { const X = DocklandsXR3, S = X.S; S.listT = -1e9; __xrMock.step(); __xrMock.step(); const R = __docklands3.renderer;
    const a = { presenting: R.xr.isPresenting, eyes: R.xr.getCamera().cameras.length, panels: S.panels.map(p => !!p.tex && !p.dirty), places: S.data.places.length, events: S.data.events.length, frames: S.frames };
    const P = X.P.places, hit = P.hits.find(h => h[4] === 'cat:catering'), u = ((hit[0] + hit[2]) / 2) / P.cv.width - .5, v = .5 - ((hit[1] + hit[3]) / 2) / P.cv.height;
    const t = [0, 1, 2].map(i => P.c[i] + P.R[i] * u * P.w + P.U[i] * v * P.h), o = [.2, 1.2, -.2], d = t.map((x, i) => x - o[i]), n = Math.hypot(...d);
    __xrMock.ray = { o, d: d.map(x => x / n) }; __xrMock.step(); const hov = P.hov; __xrMock.select(); __xrMock.step(); __xrMock.step();
    return { ...a, hov, lit: S.cats.has('catering'), beacons: X.S && !!S.data && S.cats.size > 0 }; });
  const sh = await grab(page, 'xr-stereo-table', true);
  ok(r.presenting && r.eyes === 2 && r.frames >= 2, `session on renderer.xr: presenting ${r.presenting}, ${r.eyes} eye cameras, ${r.frames} frames`);
  ok(sh.st[0].sd > .02 && sh.st[1].sd > .02 && Math.abs(sh.st[0].mean - sh.st[1].mean) < .08, `two eyes drawn: left mean ${sh.st[0].mean.toFixed(3)} sd ${sh.st[0].sd.toFixed(3)}, right mean ${sh.st[1].mean.toFixed(3)} sd ${sh.st[1].sd.toFixed(3)}`);
  ok(r.panels.every(Boolean) && r.places > 1000 && r.events > 50, `4 panels drawn, ${r.places} places, ${r.events} events`);
  ok(r.hov === 'cat:catering' && r.lit, `controller ray on the Places row "Food and drink": hover ${r.hov}, lit ${r.lit}`);
  const bc = await page.evaluate(() => { const scene = __docklands3.scene, b = scene.getObjectByName('xr-beacons'); return { vis: !!b && b.visible, tris: b ? b.geometry.index.count / 3 : 0, labels: DocklandsXR3.LAB.items.length }; });
  ok(bc.vis && bc.tris > 100, `beacons of Food and drink: ${bc.tris} triangles, ${bc.labels} labels`);
  const dr = await page.evaluate(() => { const S = DocklandsXR3.S, o0 = S.O.slice(); __xrMock.ray = { o: [0, 1.0, -.2], d: [0, -.6, -1] }; __xrMock.step(); __xrMock.step();
    __xrMock.press(0); __xrMock.ray = { o: [.2, 1.1, -.2], d: [0, -.6, -1] }; __xrMock.step(); __xrMock.release(0); const o1 = S.O.slice();
    __xrMock.ray = { o: [-.1, 1.0, -.3], d: [0, -.6, -1] }; __xrMock.ray2 = { o: [.1, 1.0, -.3], d: [0, -.6, -1] }; __xrMock.step(); const s0 = S.s;
    __xrMock.press(0); __xrMock.press(1); __xrMock.ray = { o: [-.2, 1.0, -.3], d: [0, -.6, -1] }; __xrMock.ray2 = { o: [.2, 1.0, -.3], d: [0, -.6, -1] }; __xrMock.step(); __xrMock.release(1); __xrMock.release(0); __xrMock.ray2 = null;
    return { dx: o1[0] - o0[0], dy: o1[1] - o0[1], k: S.s / s0 }; });
  ok(Math.abs(dr.dx - .2) < 1e-6 && Math.abs(dr.dy - .1) < 1e-6, `one-hand drag moves the table by the hand (${dr.dx.toFixed(3)}, ${dr.dy.toFixed(3)} m)`);
  ok(Math.abs(dr.k - 2) < 1e-6, `two-hand pinch apart doubles the scale (x${dr.k.toFixed(3)})`);
  // relief from the rig: |column 0| / |column 1| of W^-1 = r
  const rl = await page.evaluate(() => { const X = DocklandsXR3, v = () => { const e = X.rig.matrix.elements; return Math.round(Math.hypot(e[0], e[1], e[2]) / Math.hypot(e[4], e[5], e[6]) * 1000) / 1000; };
    X.act('mode:table'); __xrMock.step(); const t0 = v(); X.act('relief'); __xrMock.step(); const t1 = v(); X.act('mode:street'); __xrMock.step(); const s1 = v(), dn = __xrMock.session.renderState.depthNear, df = __xrMock.session.renderState.depthFar, mode = X.S.mode;
    return { t0, t1, s1, dn, df, mode }; });
  const shs = await grab(page, 'xr-stereo-street', true);
  ok(rl.t0 === 2.5 && rl.t1 === 4 && rl.s1 === 1, `relief: table ${rl.t0}x, Relief button ${rl.t1}x, street ${rl.s1}x`);
  ok(rl.mode === 'street' && rl.dn === .25 && rl.df === 16000, `street mode, depth ${rl.dn} to ${rl.df} m (left sd ${shs.st[0].sd.toFixed(3)})`);
  const back = await page.evaluate(() => { const X = DocklandsXR3; X.act('mode:table'); X.act('relief'); X.act('relief'); X.act('relief'); __xrMock.step(); const e = X.rig.matrix.elements; return Math.round(Math.hypot(e[0], e[1], e[2]) / Math.hypot(e[4], e[5], e[6]) * 1000) / 1000; });
  ok(back === 2.5, `table again, Relief round to ${back}x`);
  // a pick: the table centred on the tallest building, a ray from the head to 80 % of its height
  const pk = await page.evaluate(async () => { const X = DocklandsXR3, S = X.S; X.act('recentre'); __xrMock.step(); const A = __docklands3.ctx.A; let bi = 0; A.buildings.forEach((b, i) => { if (b.h > A.buildings[bi].h) bi = i; }); const f = __docklands3.ctx.dec(A.buildings[bi].p); let cx = 0, cz = 0; for (let k = 0; k < f.length; k += 2) { cx += f[k]; cz += f[k + 1]; } cx /= f.length / 2; cz /= f.length / 2; S.c = [cx, __docklands3.ctx.groundAt(cx, cz), cz]; X.act('turnL'); X.act('turnR'); __xrMock.step(); const p = X.toUser(cx, A.buildings[bi].b + A.buildings[bi].h * .8, cz), o = S.head.slice(), d = p.map((v, i) => v - o[i]), n = Math.hypot(...d);
    __xrMock.ray = { o, d: d.map(v => v / n) }; __xrMock.step(); __xrMock.select(); for (let k = 0; k < 20 && !(S.focus && S.focus.kind === 'building' && S.focus.title !== 'Building'); k++) { await new Promise(r => setTimeout(r, 250)); __xrMock.step(); }
    return S.focus ? { kind: S.focus.kind, title: S.focus.title, sub: S.focus.sub } : null; });
  await grab(page, 'xr-stereo-pick', true);
  ok(pk && pk.kind === 'building', `a ray on a tower opens the Focus card: ${pk ? pk.kind + ' "' + pk.title + '" ' + pk.sub : 'none'}`);
  const ex = await page.evaluate(async () => { DocklandsXR3.act('exit'); await new Promise(r => setTimeout(r, 300)); const D = __docklands3; return { active: DocklandsXR3.active, presenting: D.renderer.xr.isPresenting, controls: D.controls.enabled, cam: D.camState(), rig: !!D.scene.getObjectByName('xr-rig') }; });
  ok(!ex.active && !ex.presenting && ex.controls && !ex.rig && Math.hypot(ex.cam.tx - cam0.tx, ex.cam.tz - cam0.tz) < 1 && Math.abs(ex.cam.dist - cam0.dist) < 1, `Exit ends the session and restores the page camera (${ex.cam.tx.toFixed(0)}, ${ex.cam.tz.toFixed(0)}, dist ${ex.cam.dist.toFixed(0)})`);
  await page.waitForTimeout(1500); await grab(page, 'xr-after-exit', false);
  ok(!errors.length, 'stereo: no page error' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await page.context().close();
}
async function previewRun(webgpu) {
  const { page, errors } = await open(390, 844, 3, `view=cw${webgpu ? '' : '&webgl'}&animate=0&layers=${LAYERS}&xr=preview&go`, webgpu);
  await page.waitForFunction(() => window.DocklandsXR3?.active && DocklandsXR3.S.data, null, { timeout: 240000 }); await page.waitForTimeout(2000);
  const backend = await page.evaluate(() => __docklands3.backend);
  const r = await page.evaluate(async () => { const X = DocklandsXR3, S = X.S, s = S.session; X.act('cat:catering', X.P.places); S.listT = -1e9; s.dirty = true;
    for (let k = 0; k < 300 && !X.LAB.items.some(l => !l.ev && !l.focus && !l.mk); k++) { X.renderNow(); await new Promise(r => setTimeout(r, 100)); }
    const l = X.LAB.items.find(l => !l.ev && !l.focus && !l.mk); if (!l) return { label: null }; const p = X.toUser(l.x, l.y, l.z), o = S.head, d = p.map((v, i) => v - o[i]), n = Math.hypot(...d);
    s.fire('select', { o, d: d.map(v => v / n) }); s.dirty = true; return { label: l.text, focus: S.focus && S.focus.kind, frames: S.frames }; });
  await page.waitForTimeout(2500);
  const sh = await page.evaluate(() => new Promise(res => { const s = DocklandsXR3.S.session; s.dirty = true; requestAnimationFrame(() => requestAnimationFrame(() => res(true))); }));
  const name = `xr-preview-phone${webgpu ? '-webgpu' : ''}`;
  // the WebGPU canvas cannot be read back after the frame: a page screenshot
  let pv = null; if (webgpu) await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 180000 }); else pv = await grab(page, name, true);
  if (pv) ok(pv.st[0].sd > .05 && pv.st[1].sd > .05, `preview draws the table and the panels (luma sd ${pv.st[0].sd.toFixed(3)} / ${pv.st[1].sd.toFixed(3)})`);
  ok(!!r.focus, `preview (${backend}): a tap on the label "${r.label}" gives a ${r.focus} focus (${r.frames} frames)`);
  const ex = await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.textContent === 'Exit headset preview')?.click(); return { active: DocklandsXR3.active, controls: __docklands3.controls.enabled }; });
  ok(!ex.active && ex.controls, 'preview: Exit button ends it');
  // WebGPU page with the mock: the headset entries say they reload on WebGL 2; one does, and the page offers the tap that enters
  if (webgpu) { await page.evaluate(() => document.getElementById('xrBtn').click()); const t = await page.$$eval('#xrMenu button', bs => bs.map(b => b.textContent));
    ok(t.length === 3 && /reloads on WebGL 2/.test(t[0]), `WebGPU menu: ${t.join(' | ')}`);
    await Promise.all([page.waitForNavigation({ timeout: 240000 }), page.evaluate(() => document.querySelector('#xrMenu button[data-kind="immersive-vr"]').click())]);
    const url = page.url(); await page.waitForFunction(() => window.__docklands3?.ready && document.getElementById('xrEnter'), null, { timeout: 240000 }).catch(() => {});
    const re = await page.evaluate(() => ({ backend: window.__docklands3?.backend, enter: !!document.getElementById('xrEnter') }));
    ok(/[?&]webgl(&|$|#)/.test(url) && !/[?&]go(&|$|#)/.test(url) && /xr=1/.test(url) && re.backend === 'WebGL 2' && re.enter, `reload for the headset: ${url.replace(/^https?:\/\/[^/]+/, '')} -> ${re.backend}, "Enter the headset view" ${re.enter}`); }
  ok(!sh || !errors.length, `preview (${backend}): no page error` + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await page.context().close();
}
await previewRun(false);
if (WEBGPU) await previewRun(true);
await browser.close(); process.exit(fails.length ? 1 : 0);
