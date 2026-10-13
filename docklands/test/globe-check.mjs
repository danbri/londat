// Headless check of the globe of the Three.js port (globe/globe.js, globe/world.js; OKR KR2.1, KR2.2, KR2.7): no page
// errors; the orbit view draws a globe; a flight from orbit to Canary Wharf ends in the model where ?view=cw puts the camera;
// a wheel zoom from orbit down over the box hands over to the model with no jump of the eye; a zoom out of the model hands
// over to the globe; search and fly to Sarajevo, León, Leiden and Tokyo; describeView at orbit names an ocean or a country;
// ?ll= deep links; frame costs at orbit, 1,000 km, 100 km and 10 km. Screenshots: --out (default docklands/test/out/globe).
//   python3 -m http.server 8211 --bind 127.0.0.1 &      (from the repository root)
//   node docklands/test/globe-check.mjs [--base http://127.0.0.1:8211] [--webgpu] [--sizes 1280x800@1,390x844@2] [--full]
// --full: the full page (every default layer) for the Docklands screenshot (slow in software). WebGL 2 in SwiftShader by
// default; --webgpu: WebGPU on Dawn's SwiftShader adapter. Skill: docklands-3d-page, "Three.js port: globe and world skeleton".
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8211'), OUT = arg('--out', 'docklands/test/out/globe'), WEBGPU = process.argv.includes('--webgpu'), FULL = process.argv.includes('--full');
const SIZES = arg('--sizes', '1280x800@1,390x844@2').split(',').map(s => { const m = /^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(s); return [+m[1], +m[2], +m[3]]; });
mkdirSync(OUT, { recursive: true });
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
let failed = 0; const results = [];
const check = (ok, what, detail = '') => { results.push({ ok, what, detail }); if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ' · ' + detail : ''}`); };
const T = '2026-10-12T12:00';

async function open(w, h, dpr, q) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }), page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  // (the history layer asks for today's cache folder, which is missing until the first hourly run of the day: not a globe fault)
  page.on('response', r => { if (r.status() === 429 && /open-meteo\.com/.test(r.url())) return; if (r.status() >= 400 && !/favicon|\/cache\/runs\/|api\.github\.com/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
  // the live and weather services are answered empty here (no third-party request from a test): the globe does not use them
  await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(`${BASE}/docklands/?${q}${WEBGPU ? '' : '&webgl'}&animate=0&weather=0`);
  return { ctx, page, errors };
}
const globeReady = page => page.waitForFunction(() => window.__docklands3?.globe?.ready && window.docklands, null, { timeout: 240000 });
const onGlobe = page => page.waitForFunction(() => window.__docklands3.globe.mode === 'globe' && window.__docklands3.globe.stats.frame, null, { timeout: 240000 });
async function frame(page) {   // ask for a frame and wait until one is drawn
  await page.evaluate(() => new Promise(ok => { const G = __docklands3.globe; G.dirty = true; __docklands3.draw(); requestAnimationFrame(() => requestAnimationFrame(() => ok())); }));
}
async function shot(page, name) {
  await frame(page); await page.waitForTimeout(800);
  const file = `${OUT}/${name}${WEBGPU ? '-webgpu' : ''}.png`; const buf = await page.screenshot({ path: file, timeout: 240000 });
  return { file, buf };
}
async function lumaStats(buf) {   // mean luma in the middle third and at the left and right edges at 20 % height (outside a whole globe; 0..1)
  const img = await loadImage(buf), cv = createCanvas(img.width, img.height), c = cv.getContext('2d'); c.drawImage(img, 0, 0);
  const mean = (x, y, w, h) => { const d = c.getImageData(x, y, w, h).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s / (d.length / 4) / 255; };
  const W = img.width, H = img.height, k = Math.round(Math.min(W, H) * 0.06);
  return { centre: mean(W / 3, H / 3, W / 3, H / 3), corners: (mean(0, Math.round(H * 0.2), k, k) + mean(W - k, Math.round(H * 0.2), k, k)) / 2 };
}
// frame cost: redraw for `ms` with the camera still (the globe redraws on dirty), then the page's frame-time stats (perf.js)
async function cost(page, ms = 4000) {
  return page.evaluate(async ms => {
    const G = __docklands3.globe, t0 = performance.now(); const sub = [];
    await new Promise(ok => { const f = () => { G.dirty = true; __docklands3.draw(); if (G.stats.frame) sub.push(G.stats.frame.ms); if (performance.now() - t0 < ms) requestAnimationFrame(f); else ok(); }; f(); });
    const p = docklands.perf ? docklands.perf() : null, fr = G.mode === 'globe' ? G.stats.frame : null; sub.sort((a, b) => a - b);
    return { mode: G.mode, patches: fr && fr.patches, triangles: fr && fr.triangles, calls: fr && fr.calls, submit_ms_median: sub.length ? sub[Math.floor(sub.length / 2)] : null, frame_ms_median: p && p.frame_ms.median, frame_ms_p95: p && p.frame_ms.p95, fps: p && p.fps.median, frames: sub.length };
  }, ms);
}
const view = page => page.evaluate(() => docklands.getView());

for (const [w, h, dpr] of SIZES) {
  const tag = `${w}x${h}@${dpr}`;
  console.log(`\n== ${tag} ${WEBGPU ? 'WebGPU requested' : 'WebGL 2'}`);
  // ---------- 1. the default page still opens on the Docklands model
  if (w === SIZES[0][0]) {
    const { ctx, page, errors } = await open(w, h, dpr, `layers=&t=${T}`);
    await page.waitForFunction(() => window.__docklands3?.globe && window.docklands, null, { timeout: 240000 }).catch(() => {});   // (the world data load on the first need)
    const r = await page.evaluate(() => ({ mode: __docklands3.globe?.mode, view: __docklands3.viewName, hasGlobe: !!__docklands3.globe }));
    check(r.hasGlobe && r.mode === 'model' && r.view === 'cw', `${tag} default page opens on the Docklands model`, JSON.stringify(r));
    check(!errors.length, `${tag} no page errors (default page)`, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
  // ---------- 2. orbit view
  const { ctx, page, errors } = await open(w, h, dpr, `view=globe&layers=&t=${T}`);
  const t0 = Date.now(); await globeReady(page); await onGlobe(page);
  const backend = await page.evaluate(() => __docklands3.backend);
  console.log(`   backend ${backend}, globe ready in ${((Date.now() - t0) / 1000).toFixed(1)} s, load ${await page.evaluate(() => __docklands3.globe.stats.loadMs)} ms`);
  let s = await shot(page, `orbit-${tag}`), L = await lumaStats(s.buf);
  check(L.centre > 0.12 && L.corners < 0.06, `${tag} orbit view draws a lit globe on black space`, `centre luma ${L.centre.toFixed(3)}, corners ${L.corners.toFixed(3)} -> ${s.file}`);
  let d = await page.evaluate(() => docklands.describeView());
  check(d.mode === 'globe' && /Ocean|Sea|United Kingdom|France|Spain|Ireland|Norway/.test(d.text), `${tag} describeView at orbit names an ocean or a country`, d.text.slice(0, 260));
  const gv = await view(page);
  check(gv.mode === 'globe' && gv.eye.height_m > 1.2e7 && Math.abs(gv.target.lat - 51.5) < 0.1, `${tag} getView at globe scale`, `eye ${gv.eye.height_m} m, target ${gv.target.lat},${gv.target.lon}`);
  const costs = {}; costs.orbit = await cost(page);
  // ---------- 3. Europe, the UK, London (screenshots), frame costs at 1,000 km, 100 km and 10 km (Sarajevo: outside the model)
  for (const [name, t] of [['europe', { lon: 10, lat: 50, alt_m: 3.2e6 }], ['uk', { lon: -2.5, lat: 54.3, alt_m: 1.1e6 }], ['london', { lon: -0.03, lat: 51.5, alt_m: 60000 }]]) {
    await page.evaluate(t => docklands.goTo(t), t); s = await shot(page, `${name}-${tag}`);
    const labs = await page.evaluate(() => [...document.querySelectorAll('.glab:not([hidden])')].map(e => e.textContent));
    check(labs.length >= 3, `${tag} ${name}: labels on the globe`, `${labs.length}: ${labs.slice(0, 10).join(', ')} -> ${s.file}`);
  }
  for (const [k, alt] of [['1000km', 1e6], ['100km', 1e5], ['10km', 1e4]]) { await page.evaluate(a => docklands.goTo({ lon: 18.43, lat: 43.86, alt_m: a }), alt); costs[k] = await cost(page); }
  console.log('   frame costs (software rendering; frame_ms = interval between drawn frames, submit = CPU time of render())');
  for (const [k, c] of Object.entries(costs)) console.log(`   ${k.padEnd(7)} ${JSON.stringify(c)}`);
  results.push({ ok: true, what: `${tag} costs`, detail: costs });
  // ---------- 4. search and fly: Sarajevo, León, Leiden, Tokyo (find_places, then go_to by name)
  const want = { Sarajevo: [43.85, 18.41, /Bosnia/], 'León': [42.6, -5.57, /Spain|León/], Leiden: [52.16, 4.49, /Netherlands|Holland/], Tokyo: [35.69, 139.75, /Japan|Tokyo/] };
  for (const [q, [la, lo, re]] of Object.entries(want)) {
    const f = await page.evaluate(q => docklands.findPlaces(q, 5), q);
    const r = await page.evaluate(q => docklands.goTo(q), q); await frame(page);
    const v = await view(page), dk = Math.hypot((v.target.lat - la) * 111, (v.target.lon - lo) * 111 * Math.cos(la * Math.PI / 180));
    const dd = await page.evaluate(() => docklands.describeView());
    check(f.length > 0 && dk < 25 && re.test(dd.text), `${tag} search and fly to ${q}`, `first hit ${f[0]?.name} (${f[0]?.kind}); arrived ${dk.toFixed(1)} km from it; ${dd.text.split('. ').slice(0, 2).join('. ')}`);
    if (w === SIZES[0][0]) await shot(page, `place-${q.normalize('NFD').replace(/[^\w]/g, '')}-${tag}`);
  }
  // ---------- 4b. the UK skeleton (docklands/geo/skeleton.js through globe/skeleton-layers.js): search near the view, the
  // readout and describeView inside the UK, its layers drawn
  if (w === SIZES[0][0]) {
    await page.evaluate(() => docklands.goTo({ lon: -3.9, lat: 52.9, alt_m: 2.5e5 }));
    for (let i = 0; i < 4; i++) await frame(page);
    await page.waitForTimeout(2500); await frame(page);
    const uk = await page.evaluate(async () => ({ snowdon: (await docklands.findPlaces('Snowdon', 3))[0], leeds: (await docklands.findPlaces('Leeds', 6)).map(r => r.kind + ':' + r.name), where: document.getElementById('whereAmI').textContent,
      d: (await docklands.describeView()).text, cells: __docklands3.globe.stats.frame }));
    check(/Wyddfa|Snowdon/.test(uk.snowdon?.local_name || uk.snowdon?.name || '') && Math.abs(uk.snowdon.lat - 53.07) < 0.1, 'UK skeleton: "Snowdon" near the view finds Yr Wyddfa', JSON.stringify(uk.snowdon));
    check(/Gwynedd|Conwy|Wales/.test(uk.where) && /In detail/.test(uk.d), 'UK skeleton: the readout and describeView name the district and country', `${uk.where} | ${uk.d.split('In detail')[1]}`);
    await shot(page, `uk-wales-${tag}`);
  }
  // ---------- 5. flight from orbit to Canary Wharf (Home): the model at the end, where ?view=cw puts the camera
  await page.evaluate(() => docklands.goTo({ lon: 0, lat: 50, alt_m: 1.2e7 }));
  const fl = await page.evaluate(() => new Promise(ok => { const G = __docklands3.globe, modes = []; let last = null; const t0 = performance.now();
    G.home(); const f = () => { if (G.mode !== last) { modes.push(G.mode); last = G.mode; } if (G.isFlying() && performance.now() - t0 < 60000) requestAnimationFrame(f); else ok({ modes, ms: Math.round(performance.now() - t0) }); }; f(); }));
  const home = await page.evaluate(() => { const c = __docklands3.camState(), v = __docklands3.VIEWS.cw, e = s => [s.tx + s.dist * Math.sin(s.yaw) * Math.cos(s.pitch), (s.ty || 0) + s.dist * Math.sin(s.pitch), s.tz + s.dist * Math.cos(s.yaw) * Math.cos(s.pitch)];
    const a = e(c), b = e(v); return { mode: __docklands3.globe.mode, eye_m: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), target_m: Math.hypot(c.tx - v.tx, c.tz - v.tz), url: location.href }; });
  check(home.mode === 'model' && home.eye_m < 3 && home.target_m < 3, `${tag} flight from orbit to Canary Wharf ends in the model at ?view=cw`, `modes ${fl.modes.join(' -> ')}, ${fl.ms} ms; eye ${home.eye_m.toFixed(3)} m and target ${home.target_m.toFixed(3)} m from ?view=cw`);
  if (w === SIZES[0][0]) await shot(page, `docklands-cw-layersnone-${tag}`);
  // ---------- 6. wheel zoom out of the model: the globe takes the view
  let n = 0; for (; n < 60; n++) { await page.mouse.move(w / 2, h / 2); await page.mouse.wheel(0, 400); await page.waitForTimeout(120); if (await page.evaluate(() => __docklands3.globe.mode) === 'globe') break; }
  check(n < 60, `${tag} wheel out of the model hands over to the globe`, `after ${n + 1} wheel steps; ${JSON.stringify((await view(page)).eye)}`);
  // ---------- 7. hand-over in: the globe 45 km over the box, wheel in at the centre: the model takes the view, eye continuous
  await page.evaluate(() => docklands.goTo({ lon: -0.0195, lat: 51.5049, alt_m: 45000, tilt_deg: 30 }));
  const hand = await page.evaluate(async () => {
    const G = __docklands3.globe, D = __docklands3, cv = D.renderer.domElement, eyeG = () => { const c = G.orbitCam(G.orbit()); return c.eye; };
    let before = null, after = null;
    // before: the globe eye after the last wheel step (the orbit the hand-over converts), then the frame that hands over
    let range = null;
    for (let i = 0; i < 40 && G.mode === 'globe'; i++) { cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: innerWidth / 2, clientY: innerHeight / 2, bubbles: true, cancelable: true })); before = eyeG(); range = G.orbit().range; D.frameNow(); }
    if (G.mode !== 'model') return { mode: G.mode };
    // the model eye in ECEF through the same region transform, against the globe eye just before
    const c = D.camState(), cp = Math.cos(c.pitch), E = [c.tx + c.dist * Math.sin(c.yaw) * cp, c.ty + c.dist * Math.sin(c.pitch), c.tz + c.dist * Math.cos(c.yaw) * cp];
    after = G.modelToEcef(E);
    return { mode: G.mode, handover_range_m: Math.round(range), sameEye_m: Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]) };
  });
  check(hand.mode === 'model' && hand.sameEye_m < 0.05, `${tag} wheel in over the box: the model takes the view with no jump`, JSON.stringify(hand));
  // ---------- 8. deep link ?ll= (Tokyo, 20 km up) in a fresh page
  check(!errors.length, `${tag} no page errors (globe page)`, errors.slice(0, 4).join(' | '));
  await ctx.close();
  if (w === SIZES[0][0]) {
    const o = await open(w, h, dpr, `ll=35.68,139.76,80000&layers=&t=${T}`); await globeReady(o.page); await onGlobe(o.page);
    const v = await view(o.page);
    check(v.mode === 'globe' && Math.abs(v.target.lat - 35.68) < 0.01 && Math.abs(v.eye.above_ground_m - 80000) < 3000, `${tag} deep link ?ll=35.68,139.76,80000 (heights under 60 km away from the model rise to 60 km)`, JSON.stringify(v.eye));
    check(!o.errors.length, `${tag} no page errors (?ll= page)`, o.errors.slice(0, 3).join(' | '));
    await o.ctx.close();
  }
}
// ---------- the full page at the Docklands (slow in software): --full
if (FULL) {
  const [w, h, dpr] = SIZES[0], { ctx, page, errors } = await open(w, h, dpr, `view=cw&t=${T}`);
  await page.waitForFunction(() => window.__docklands3?.globe && window.docklands, null, { timeout: 300000 }); await page.waitForTimeout(8000);
  const s = await shot(page, `docklands-cw-full-${w}x${h}@${dpr}`);
  check(!errors.length, 'full page at the Docklands: no page errors', errors.slice(0, 3).join(' | ') + ' -> ' + s.file);
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/globe-check${WEBGPU ? '-webgpu' : ''}.json`, JSON.stringify({ when: new Date().toISOString(), webgpu: WEBGPU, results }, null, 1));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
