// Memory of the app (moglob, the Three.js port, docklands/) through the owner's journeys, and the memory checks (owner,
// 2026-10-23: "loading even on a modern macbook or iphone can be very heavy and the webapp sometimes just reboots").
// Each scenario is a fresh page (a cold start). Measured while it runs (every 250 ms in the page, every second in Node):
//  - JS heap (performance.memory.usedJSHeapSize, Chromium; typed arrays count in it) and, after a full collection
//    (CDP HeapProfiler.collectGarbage), the steady heap of each step;
//  - GPU bytes as three.js counts them (renderer.info.memory.total: vertex and index buffers, textures, render targets,
//    uniform buffers) plus the canvas's own buffers (drawing buffer x 40 bytes a pixel: front, back, 4x MSAA colour and
//    depth: an estimate);
//  - the whole browser's memory from Linux (/proc/<pid>/smaps_rollup Pss, all Chromium processes of this run: the
//    renderer of the tab, the GPU process (SwiftShader: GPU memory is CPU memory here), the browser): the closest
//    number to what iOS counts for a tab;
//  - triangles and draw calls of the last frame, tiles loaded per place, base imagery held, the memory governor's state
//    (docklands/governor.js, when the page has it), long tasks, time to the first useful frame (the boot screen gone).
// Scenarios: cold-docklands (the default page), cold-globe (?view=globe), fly (Docklands -> Dublin -> Berlin -> Manchester
// 20 km -> York 1 km -> back to the Docklands; the leak check compares the Docklands before and after), london-nadir
// (11.3 km straight down), uk-500 (the UK from 500 km), leon-sarajevo (Leon, then Sarajevo).
//   python3 -m http.server 8473 --bind 127.0.0.1 &        (from the repository root; docklandia sets as symlinks in
//                                                           docklands/test/out/places/<id>, served through ?placebase=)
//   node docklands/test/memory-check.mjs [--base http://127.0.0.1:8473] [--sizes 390x844@2,1280x800@1] [--webgpu]
//        [--scenarios cold-docklands,cold-globe,fly,london-nadir,uk-500,leon-sarajevo] [--extra '&mem=...'] [--json out.json]
//        [--check] [--budget-mb 1000] [--leak-mb 150] [--leak2-mb 40]
// --check fails when the peak of (JS heap + GPU + canvas) passes the budget + --headroom (0.25: the governor keeps the
// steady use under the budget and acts within seconds; garbage of a build or a batch of tiles may pass it for moments;
// the budget is the page governor's, else --budget-mb), or when the steady JS heap + GPU at the Docklands after the fly is more than --leak-mb above
// the first visit (the margin, the larger of --leak-mb and 12 % of the budget, holds the world's data that the globe reads
// once and keeps for search and labels, about 80 to 100 MB measured, and the idle tiles a larger budget keeps), or when a second round trip (Dublin and back) adds more than --leak2-mb (40), or on a page error. Software WebGL (SwiftShader): times are slow; memory and counts are what matter.
// Skill: docklands-3d-page, "moglob: memory budget, governor and crash recovery (2026-10-23)".
import { chromium } from '@playwright/test';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8473'), WEBGPU = argv.includes('--webgpu'), CHECK = argv.includes('--check');
const SIZES = arg('--sizes', '390x844@2').split(',').map(s => { const m = /^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(s); return [+m[1], +m[2], +m[3]]; });
const SCEN = arg('--scenarios', 'cold-docklands,cold-globe,fly,london-nadir,uk-500,leon-sarajevo').split(',').filter(Boolean);
const EXTRA = arg('--extra', ''), JSON_OUT = arg('--json', null), BUDGET = +arg('--budget-mb', 0) || null, LEAK = +arg('--leak-mb', 150), LEAK2 = +arg('--leak2-mb', 40), HEAD = +arg('--headroom', 0.25);
const OUT = arg('--out', 'docklands/test/out/memory'); mkdirSync(OUT, { recursive: true });
const PD = arg('--placedir', 'docklands/test/out/places');
// the docklandia sets with a local copy (symlinks), served from this server
const PB = existsSync(PD) ? readdirSync(PD).filter(id => existsSync(`${PD}/${id}/tileset.json`)).map(id => `&placebase=${encodeURIComponent(`${id}:${BASE}/${PD}/${id}/`)}`).join('') : '';
const T = '2026-10-12T12:00';
const V = {   // views: ll = lat, lon, eye height (m); ht = heading, tilt (the deep-link semantics)
  dublin: [53.34725, -6.25916, 1500, 0, 55], berlin: [52.5170, 13.3940, 1500, 80, 55], manchester: [53.4794, -2.2453, 20000, 0, 45],
  york: [53.9620, -1.0793, 1000, 0, 60], londonNadir: [51.41793, 0.07111, 11347, 347, 0], uk500: [54.5, -2.5, 500000, 0, 0],
  leon: [42.59732, -5.56654, 1500, 0, 55], sarajevo: [43.85917, 18.43335, 1500, 0, 55] };

// ---------- the browser, launched as a server so that its process id is known (Linux /proc for the processes' memory)
const server = await chromium.launchServer({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc',
    ...(WEBGPU ? ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader'] : [])] });
const ROOT = server.process().pid, browser = await chromium.connect(server.wsEndpoint());
function procs() {   // every descendant of the browser process: pid -> type (renderer, gpu-process, utility, browser)
  const kids = new Map(); for (const d of readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; try { const s = readFileSync(`/proc/${d}/stat`, 'utf8'), pp = +s.slice(s.lastIndexOf(')') + 2).split(' ')[1]; (kids.get(pp) || kids.set(pp, []).get(pp)).push(+d); } catch { /* gone */ } }
  const out = new Map(), walk = p => { let t = 'other'; try { const c = readFileSync(`/proc/${p}/cmdline`, 'utf8'); t = /--type=([\w-]+)/.exec(c)?.[1] || (/chrome/.test(c) ? 'browser' : 'other'); } catch { /* gone */ } out.set(p, t); for (const k of kids.get(p) || []) walk(k); };
  walk(ROOT); return out;
}
function pss() {   // MB by process type, and the total
  const r = { total: 0 }; for (const [p, t] of procs()) { try { const m = /Pss:\s+(\d+) kB/.exec(readFileSync(`/proc/${p}/smaps_rollup`, 'utf8')); if (!m) continue; const mb = +m[1] / 1024; r[t] = (r[t] || 0) + mb; r.total += mb; } catch { /* gone */ } }
  for (const k in r) r[k] = Math.round(r[k]); return r;
}

const INIT = () => {   // in the page before its scripts: long tasks, the boot screen's end, memory samples
  const M = window.__mem = { samples: [], longtasks: [], bootDone: null, t0: performance.now() };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) M.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch { /* none */ }
  setInterval(() => { const D = window.__docklands3, I = D?.renderer?.info?.memory, cv = D?.renderer?.domElement;
    if (M.bootDone == null) { const b = document.getElementById('boot'); if (b && (b.hidden || b.classList.contains('done'))) M.bootDone = Math.round(performance.now()); }
    M.samples.push([Math.round(performance.now()), performance.memory ? performance.memory.usedJSHeapSize : 0, I ? I.total : 0, cv ? cv.width * cv.height * 40 : 0]); }, 250);
};
const mb = x => Math.round(x / 1048576);

async function open(w, h, dpr, query) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }), page = await ctx.newPage(), errors = [], req = { n: 0, bytes: 0 };
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|404/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('response', r => { req.n++; req.bytes += +(r.headers()['content-length'] || 0); });
  await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather|environment\.data\.gov\.uk|raw\.githubusercontent\.com|celestrak/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(INIT);
  const cdp = await ctx.newCDPSession(page);
  const url = `${BASE}/docklands/?${query}${WEBGPU ? '' : '&webgl'}&animate=0&weather=0&sw=0&t=${T}${PB}${EXTRA}`;
  const tGo = Date.now(); await page.goto(url);
  return { ctx, page, cdp, errors, req, url, tGo };
}
// wait until the view has settled: the model's cells built, or the places settled and the base imagery queue empty
async function settle(page, maxMs = 240000) {
  return page.evaluate(async maxMs => {
    const t0 = performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms)), raf = () => new Promise(r => requestAnimationFrame(r));
    while (!window.__docklands3 || !window.docklands) { await sleep(300); if (performance.now() - t0 > maxMs) return { timeout: true }; }
    const D = __docklands3; let ok = 0;
    while (performance.now() - t0 < maxMs) {
      const G = D.globe; if (G) G.dirty = true; D.draw(); await raf(); await sleep(200);
      let done;
      if (G && G.mode === 'globe') { const st = G.placesStats ? G.placesStats().filter(s => s.state) : [], b = G.baseStats ? G.baseStats() : null;
        done = G.ready && !G.isFlying() && st.every(s => s.settled) && (!b || (!b.queued && !b.active)); }
      else done = (D.ready || D.STATS.heavyDeferredMs != null || true) && !(D.STATS.cells && D.STATS.cells.pending) && (!G || !G.reup || G.reup.done);
      if (done) { if (++ok >= 3) break; } else ok = 0;
    }
    return { ms: Math.round(performance.now() - t0) };
  }, maxMs);
}
async function snap(page, cdp, label) {   // one step: frame, places, base, memory now and after a full collection
  const pre = await page.evaluate(() => { const M = __mem.samples.at(-1); return M; });
  await cdp.send('HeapProfiler.collectGarbage');
  const r = await page.evaluate(label => {
    const D = __docklands3, G = D.globe, I = D.renderer.info.memory, cv = D.renderer.domElement;
    const frame = G && G.mode === 'globe' ? G.stats.frame : D.STATS.frame;
    const places = G && G.placesStats ? G.placesStats().filter(s => s.state).map(s => ({ id: s.id, state: s.state, loaded: s.loaded, tiles: s.tiles, tri: s.triangles })) : [];
    const held = G && G.places ? G.places.filter(p => p.feats || p.sur || p.namesP).map(p => p.id) : [];
    return { label, t: Math.round(performance.now()), mode: G ? G.mode : 'model', heap: performance.memory.usedJSHeapSize, gpu: I.total, gpuAttr: I.attributesSize + (I.indexAttributesSize || 0), gpuTex: I.texturesSize, geometries: I.geometries, textures: I.textures, canvas: cv.width * cv.height * 40,
      tri: frame ? Math.round(frame.triangles) : null, calls: frame ? (frame.drawCalls ?? frame.calls) : null, places, featuresHeld: held, base: G && G.baseStats ? G.baseStats() : null,
      governor: window.moglob?.memory ? window.moglob.memory.state() : null, modelDrop: D.STATS.modelDrop || null, heavy: D.STATS.heavyWhy || (D.ready ? 'at the start' : 'not loaded'), view: window.docklands?.getView ? (() => { try { const v = docklands.getView(); return { mode: v.mode, quality: v.quality || null }; } catch { return null; } })() : null };
  }, label);
  r.pss = pss(); return r;
}
function peaks(samples, since = 0) {
  let heap = 0, gpu = 0, sum = 0, at = 0; for (const [t, h, g, c] of samples) { if (t < since) continue; heap = Math.max(heap, h); gpu = Math.max(gpu, g + c); if (h + g + c > sum) { sum = h + g + c; at = t; } }
  return { heap: mb(heap), gpu: mb(gpu), sum: mb(sum), at };
}
const longOf = (lt, since = 0) => { const l = lt.filter(x => x[0] >= since); return { n: l.length, ms: l.reduce((s, x) => s + x[1], 0), max: l.reduce((m, x) => Math.max(m, x[1]), 0) }; };
const fmt = s => `heap ${mb(s.heap)} MB, GPU ${mb(s.gpu)} MB (attr ${mb(s.gpuAttr)}, tex ${mb(s.gpuTex)}; ${s.geometries} geom, ${s.textures} tex) + canvas ${mb(s.canvas)} MB, tri ${s.tri?.toLocaleString('en')}, calls ${s.calls}; places ${s.places.map(p => `${p.id}:${p.loaded}`).join(' ') || '-'}; features held ${s.featuresHeld.join(',') || '-'}; base ${s.base ? s.base.imagery + ' img' : '-'}; model layers ${s.heavy}; model drop ${JSON.stringify(s.modelDrop)}; pss ${JSON.stringify(s.pss)}${s.governor ? '; governor ' + JSON.stringify(s.governor) : ''}`;

let failed = 0; const results = [];
// crash recovery: a load that ends without a clean unload (as when iOS ends a WebContent process), then the tab
// reloads: the governor must say it recovered (lower budget, tier 1, the note on screen); a clean reload after that must not
async function crashCheck(w, h, dpr, tag) {
  const { ctx, page, cdp } = await open(w, h, dpr, 'view=globe');
  const ok = (c, m) => { if (!c) failed++; console.log(`${c ? 'ok  ' : 'FAIL'} ${tag} crash: ${m}`); };
  try {
    await page.waitForFunction(() => window.moglob?.memory && window.__docklands3?.globe?.ready, null, { timeout: 300000 });
    const s0 = await page.evaluate(() => moglob.memory.state()); ok(!s0.recovered_from_crash && s0.tier === 0, `first load: no recovery (tier ${s0.tier}, budget ${s0.budget_mb} MB, class ${s0.device_class})`);
    // a load that ends without a clean unload: the page's own unload handlers cannot clear the marker (what iOS leaves behind
    // when it ends the WebContent process; CDP Page.crash leaves a dead page in Playwright, and a sessionStorage write in a
    // pagehide handler of a reload is lost in Chromium)
    await page.evaluate(() => { const r = Storage.prototype.removeItem; Storage.prototype.removeItem = function (k) { if (k === 'moglob.run') return; return r.call(this, k); }; });
    await page.reload(); await page.waitForFunction(() => window.moglob?.memory && document.getElementById('memNote'), null, { timeout: 300000 });
    const s1 = await page.evaluate(() => ({ ...moglob.memory.state(), note: document.getElementById('memNote')?.textContent || '', hidden: document.getElementById('memNote')?.hidden }));
    ok(s1.recovered_from_crash && s1.tier >= 1 && s1.budget_mb < s0.budget_mb && !s1.hidden && /restarted/.test(s1.note), `after a crash: recovered, tier ${s1.tier}, budget ${s0.budget_mb} -> ${s1.budget_mb} MB, note "${s1.note.slice(0, 120)}"`);
    await page.waitForFunction(() => window.docklands?.getView, null, { timeout: 300000 });
    const q = await page.evaluate(() => docklands.getView().quality); ok(q && q.tier >= 1, `getView().quality after the crash: ${JSON.stringify(q)}`);
    await page.waitForTimeout(3000); await page.screenshot({ path: `${OUT}/crash-recovery-${w}x${h}.png` });
    await page.reload(); await page.waitForFunction(() => window.moglob?.memory, null, { timeout: 300000 });
    const s2 = await page.evaluate(() => moglob.memory.state()); ok(!s2.recovered_from_crash && s2.tier === 0, `a clean reload after that: no recovery (tier ${s2.tier}): no loop`);
  } catch (e) { ok(false, String(e.message || e).slice(0, 200)); }
  await ctx.close();
}
const goto = (page, v) => page.evaluate(async v => { await docklands.goTo({ lat: v[0], lon: v[1], alt_m: v[2], heading_deg: v[3], tilt_deg: v[4] }, { animate: true });
  const G = __docklands3.globe; while (G && G.isFlying()) await new Promise(r => setTimeout(r, 200)); }, v);
const home = page => page.evaluate(async () => { const G = __docklands3.globe; if (G && G.mode === 'globe') { G.home(); while (G.isFlying()) await new Promise(r => setTimeout(r, 200)); } else await docklands.goTo('cw'); });

for (const [w, h, dpr] of SIZES) {
  const tag = `${w}x${h}@${dpr}${WEBGPU ? ' webgpu' : ''}`;
  for (const sc of SCEN) {
    if (sc === 'crash') { await crashCheck(w, h, dpr, tag); continue; }
    const query = { 'cold-docklands': 'x=1', 'cold-globe': 'view=globe', fly: 'view=cw', 'london-nadir': `ll=${V.londonNadir.slice(0, 3)}&ht=${V.londonNadir.slice(3)}`, 'uk-500': `ll=${V.uk500.slice(0, 3)}&ht=${V.uk500.slice(3)}`, 'leon-sarajevo': `ll=${V.leon.slice(0, 3)}&ht=${V.leon.slice(3)}` }[sc];
    if (!query) { console.log('unknown scenario ' + sc); continue; }
    const { ctx, page, cdp, errors, req, url } = await open(w, h, dpr, query), steps = [];
    let res = { tag, scenario: sc, url: url.replace(BASE, '').replace(/&placebase=[^&]+/g, '') };
    let pssPeak = { total: 0 }; const pssT = setInterval(() => { const p = pss(); if (p.total > pssPeak.total) pssPeak = { ...p, rendererMax: pssPeak.rendererMax, gpuMax: pssPeak.gpuMax }; pssPeak.rendererMax = Math.max(pssPeak.rendererMax || 0, p.renderer || 0); pssPeak.gpuMax = Math.max(pssPeak.gpuMax || 0, p['gpu-process'] || 0); }, 1000);
    try {
      const s0 = await settle(page);
      steps.push(await snap(page, cdp, 'start')); steps[0].settle = s0;
      const boot = await page.evaluate(() => __mem.bootDone);
      if (sc === 'fly') {
        for (const [k, v] of [['dublin', V.dublin], ['berlin', V.berlin], ['manchester-20km', V.manchester], ['york-1km', V.york]]) { await goto(page, v); const s = await settle(page); const r = await snap(page, cdp, k); r.settle = s; steps.push(r); console.log(`  ${tag} ${sc} ${k}: ${fmt(r)}`); }
        await home(page); const s = await settle(page); await page.waitForTimeout(12000); await settle(page);   // the globe rests (8 s) and the model's buffers come back
        const r = await snap(page, cdp, 'docklands-again'); r.settle = s; steps.push(r);
        // a second round trip (Dublin and back): a leak grows again; the world's data read on the first trip does not
        await goto(page, V.dublin); await settle(page); await home(page); await settle(page); await page.waitForTimeout(12000); await settle(page);
        steps.push(await snap(page, cdp, 'docklands-third'));
      }
      if (sc === 'leon-sarajevo') { await goto(page, V.sarajevo); const s = await settle(page); const r = await snap(page, cdp, 'sarajevo'); r.settle = s; steps.push(r); }
      const M = await page.evaluate(() => ({ samples: __mem.samples, longtasks: __mem.longtasks }));
      if (argv.includes('--timeline')) for (const [t, h, g, c] of M.samples.filter((x, i) => i % 8 === 0)) console.log(`   t ${t} heap ${mb(h)} gpu ${mb(g)} canvas ${mb(c)} sum ${mb(h + g + c)} ${(steps.find(x => x.t >= t) || {}).label || ''}`);
      res = { ...res, boot_ms: boot, peak: peaks(M.samples), long: longOf(M.longtasks), requests: req.n, mbytes: Math.round(req.bytes / 1e5) / 10, steps, errors: errors.slice(0, 5) };
      const gov = steps.at(-1).governor; res.peak.step = (steps.find(x => x.t >= res.peak.at) || steps.at(-1)).label;   // the step whose settling held the peak
      const budget = BUDGET || (gov ? gov.budget_mb : null);
      if (CHECK && budget && res.peak.sum > budget * (1 + HEAD)) { failed++; console.log(`FAIL ${tag} ${sc}: peak JS heap + GPU + canvas ${res.peak.sum} MB > budget ${budget} MB + ${HEAD * 100} % for moments (garbage of a build, a batch of tiles)`); }
      else if (CHECK && budget) console.log(`ok   ${tag} ${sc}: peak ${res.peak.sum} MB within budget ${budget} MB + ${HEAD * 100} %`);
      if (sc === 'fly') { const a = steps[0], b = steps.find(x => x.label === 'docklands-again'), c = steps.at(-1), grow = mb(b.heap + b.gpu) - mb(a.heap + a.gpu), grow2 = mb(c.heap + c.gpu) - mb(b.heap + b.gpu); res.leak_mb = grow; res.leak2_mb = grow2;
        console.log(`  ${tag} fly: at the Docklands first ${mb(a.heap)} + ${mb(a.gpu)} MB, after the fly ${mb(b.heap)} + ${mb(b.gpu)} MB (heap + GPU after GC): ${grow >= 0 ? '+' : ''}${grow} MB; after a second trip ${mb(c.heap)} + ${mb(c.gpu)} MB: ${grow2 >= 0 ? '+' : ''}${grow2} MB`);
        const leakM = Math.max(LEAK, Math.round((budget || 0) * 0.12));   // (a larger budget keeps more idle tiles and imagery after the return, by design)
        if (CHECK && grow > leakM) { failed++; console.log(`FAIL ${tag} fly: memory after the return is ${grow} MB above the first visit (margin ${leakM} MB)`); }
        if (CHECK && grow2 > LEAK2) { failed++; console.log(`FAIL ${tag} fly: a second round trip added ${grow2} MB (margin ${LEAK2} MB): a leak`); } }
      if (CHECK && errors.length) { failed++; console.log(`FAIL ${tag} ${sc}: page errors ${errors.slice(0, 2).join(' / ')}`); }
      await page.screenshot({ path: `${OUT}/${sc}-${w}x${h}${WEBGPU ? '-webgpu' : ''}.png` });
    } catch (e) { failed++; res.error = String(e.message || e).slice(0, 300); console.log(`FAIL ${tag} ${sc}: ${res.error}`); }
    clearInterval(pssT); res.pss_end = pss(); res.peak_pss = pssPeak;
    console.log(`${tag} ${sc}: boot ${res.boot_ms} ms; peak heap ${res.peak?.heap} MB, GPU+canvas ${res.peak?.gpu} MB, sum ${res.peak?.sum} MB (on the way to: ${res.peak?.step}); peak browser PSS ${JSON.stringify(res.peak_pss)}; long tasks ${res.long?.n} (${res.long?.ms} ms, max ${res.long?.max}); requests ${res.requests} (${res.mbytes} MB)`);
    for (const s of res.steps || []) console.log(`   ${s.label} (${s.mode}): ${fmt(s)}`);
    results.push(res);
    await ctx.close();
  }
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
await browser.close(); await server.close();
console.log(failed ? `${failed} check(s) failed` : 'memory-check: done' + (CHECK ? ', all checks passed' : ''));
process.exit(failed ? 1 : 0);
