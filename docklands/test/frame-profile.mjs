// Frame cost of moglob (docklands/) by cause, headless (2026-11-24; owner: "Now deep dive on perf"). For each view:
//   - renderer.info: draw calls, triangles, render passes, shader programs, GPU memory;
//   - triangles and draw calls by the scene's top-level groups (what the geometry is);
//   - ms per frame with the page drawing every frame (Animate on), at the given size;
//   - the JavaScript self time by function over a few seconds of frames (Chrome's CPU profiler), top entries;
//   - --ablate: ms per frame with each layer hidden in turn, shadows off, the water mirror off, pixel ratio 0.5.
// Software rendering (SwiftShader rasterises on the CPU, in the GPU process): the absolute ms are not a phone's; the
// draw calls, triangles, programs, JavaScript time and the relative cost of each feature carry over.
//   python3 -m http.server 8188 --bind 127.0.0.1 &      (repository root)
//   node docklands/test/frame-profile.mjs [--base http://127.0.0.1:8188] [--views cw,towerbridge] [--size 390x844@1]
//        [--secs 6] [--settle 8] [--webgpu] [--ablate] [--ids water,trees] [--asecs 5] [--json out.json] [--chrome /opt/pw-browsers/chromium]
// For the JavaScript per frame use a small canvas (--size 120x260@1 --settle 30 --secs 15): many frames, no start-up work.
// Skill: docklands-3d-page, "Frame cost by cause".
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const argv = process.argv, arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8188'), SECS = +arg('--secs', 6), ABLATE = argv.includes('--ablate');
const [W, H, DPR] = (/^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(arg('--size', '390x844@1')) || []).slice(1).map(Number);
const VIEWS = {
  cw: 'view=cw&t=2026-11-24T12:00',
  night: 'view=cw&t=2026-11-24T22:00',
  towerbridge: 'view=towerbridge&t=2026-11-24T12:00',
  area: 'view=area&t=2026-11-24T12:00',
  eye: 't=2026-11-23T17:42#c=-1522.5,1155.2,6.6,40,1.7,0.1',   // eye level at Greenland Dock (the IMG_2587 camera, roughly)
};
const views = arg('--views', 'cw,night,towerbridge,area').split(',');
const browser = await chromium.launch({ headless: true, executablePath: arg('--chrome', '/opt/pw-browsers/chromium'),
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    ...(argv.includes('--webgpu') ? ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader'] : [])] });
const out = [];
for (const v of views) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/open-meteo\.com|adsb|aisstream|raw\.githubusercontent/, r => r.abort());   // the same weather and no live feeds every run
  const q = VIEWS[v] || v, [qs, hash] = q.split('#');
  await page.goto(`${BASE}/docklands/?${qs}${argv.includes('--webgpu') ? '' : '&webgl'}&animate=0&wind=3,240${hash ? '#' + hash : ''}`, { timeout: 240000 });
  await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && __docklands3.STATS.layers, null, { timeout: 400000 });
  await page.waitForTimeout(+arg('--settle', 8) * 1000);
  // geometry by top-level group
  const geo = await page.evaluate(() => {
    const D = __docklands3, by = {};
    const tri = o => { const g = o.geometry; if (!g) return 0; const n = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
      const r = g.drawRange && isFinite(g.drawRange.count) ? Math.min(n, g.drawRange.count) : n, inst = o.isInstancedMesh ? o.count : g.instanceCount != null && isFinite(g.instanceCount) ? g.instanceCount : 1;
      return (o.isMesh ? r / 3 : 0) * inst; };
    for (const top of D.scene.children) { let t = 0, m = 0; top.traverseVisible(o => { if (o.isMesh || o.isLine || o.isPoints) { m++; t += tri(o); } });
      const k = top.name || top.type; by[k] = by[k] || { objects: 0, triangles: 0 }; by[k].objects += m; by[k].triangles += Math.round(t); }
    const I = D.renderer.info;
    return { info: { drawCalls: I.render.drawCalls, triangles: Math.round(I.render.triangles), passes: I.render.frameCalls, programs: I.memory.programs,
      gpuMB: +(I.memory.total / 1e6).toFixed(1), attrMB: +(I.memory.attributesSize / 1e6).toFixed(1), texMB: +(I.memory.texturesSize / 1e6).toFixed(1), targets: I.memory.renderTargets },
      byGroup: Object.entries(by).filter(([, x]) => x.objects).sort((a, b) => b[1].triangles - a[1].triangles).slice(0, 14), pixelRatio: D.renderer.getPixelRatio(), shadows: D.renderer.shadowMap.enabled };
  });
  // ms per frame, drawing every frame
  const msFrame = (secs = SECS) => page.evaluate(async secs => {
    const D = __docklands3, a = document.getElementById('animate'); a.checked = true; D.draw();
    await new Promise(r => setTimeout(r, 1500)); let n = 0; const t0 = performance.now();
    await new Promise(r => { const f = () => { n++; if (performance.now() - t0 < secs * 1000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
    a.checked = false; return +((performance.now() - t0) / n).toFixed(1);
  }, secs);
  // the JavaScript profile over the frames
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
  const base = await msFrame();
  const counts1 = () => page.evaluate(() => { const D = __docklands3; D.frameNow(); const I = D.renderer.info.render; return { calls: I.drawCalls, tris: Math.round(I.triangles / 1e3) + 'k', passes: I.frameCalls }; });
  const { profile } = await cdp.send('Profiler.stop');
  const dt = (profile.endTime - profile.startTime) / 1e6, self = new Map(), idOf = new Map(profile.nodes.map(n => [n.id, n]));
  const counts = new Map(); for (const s of profile.samples) counts.set(s, (counts.get(s) || 0) + 1);
  const per = dt * 1000 / profile.samples.length, nFrames = Math.max(1, dt * 1000 / base);   // ms a sample; frames in the profile
  for (const [id, c] of counts) { const n = idOf.get(id), f = n.callFrame, file = (f.url || '').replace(/^.*\/docklands\//, '').replace(/^.*\/three\//, 'three/') || '(native)';
    const k = `${f.functionName || '(anon)'} ${file}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + c * per); }
  const total = [...self.values()].reduce((s, x) => s + x, 0), idle = ['(idle)', '(program)', '(garbage collector)'].map(k => [...self.entries()].filter(([n]) => n.startsWith(k + ' ')).reduce((s, [, x]) => s + x, 0));
  const byFile = new Map(); for (const [k, x] of self) { const f = k.split(' ').slice(1).join(' ').replace(/:\d+$/, ''); byFile.set(f, (byFile.get(f) || 0) + x); }
  const js = { secs: +dt.toFixed(1), busyPct: +(100 * (total - idle[0]) / total).toFixed(0), gcPct: +(100 * idle[2] / total).toFixed(1),
    jsMsPerFrame: +([...self.entries()].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).reduce((s, [, x]) => s + x, 0) / nFrames).toFixed(2),
    topFunctions: [...self.entries()].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, x]) => [k, +(x / nFrames).toFixed(2) + ' ms/frame']),
    topFiles: [...byFile.entries()].filter(([k]) => k && k !== '(native)').sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, x]) => [k, +(x / nFrames).toFixed(2) + ' ms/frame']) };
  const row = { view: v, size: `${W}x${H}@${DPR}`, backend: await page.evaluate(() => __docklands3.backend), msPerFrame: base, ...geo, js, errors: errors.slice(0, 3) };
  if (ABLATE) {
    const ab = {}, only = arg('--ids'), ids = (await page.evaluate(() => Object.keys(__docklands3.layers).filter(k => { const L = __docklands3.layers[k]; return L && L.on && L.api && (L.api.setVisible || L.api.object); }))).filter(k => !only || only.split(',').includes(k));
    const vis = (id, on) => page.evaluate(([id, on]) => { const L = __docklands3.layers[id]; if (L.api.setVisible) L.api.setVisible(on); else if (L.api.object) L.api.object.visible = on; __docklands3.draw(); }, [id, on]);
    const S = +arg('--asecs', 5), m = async () => ({ ms: await msFrame(S), ...(await counts1()) });
    ab.base = await m();
    for (const id of ids) { await vis(id, false); ab['-' + id] = await m(); await vis(id, true); }
    await page.evaluate(() => __docklands3.setShadows(false)); ab['-shadows'] = await m(); await page.evaluate(() => __docklands3.setShadows(true));
    await page.evaluate(() => { const D = __docklands3; D._pr = D.renderer.getPixelRatio(); D.renderer.setPixelRatio(D._pr / 2); window.dispatchEvent(new Event('resize')); }); ab['pixelRatio/2'] = await m();
    await page.evaluate(() => { const D = __docklands3; D.renderer.setPixelRatio(D._pr); window.dispatchEvent(new Event('resize')); });
    ab.base_again = await m();
    row.ablate = Object.fromEntries(Object.entries(ab).sort((a, b) => a[1].ms - b[1].ms));
  }
  out.push(row); console.log(JSON.stringify(row));
  await page.close();
}
await browser.close();
const J = arg('--json'); if (J) writeFileSync(J, JSON.stringify(out, null, 1) + '\n');
