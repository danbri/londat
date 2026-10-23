// What holds the memory of the Three.js port (docklands/) in Chromium: (1) the JS heap (performance.memory) before and
// after a full garbage collection (CDP HeapProfiler.collectGarbage); (2) the CPU copies of geometry that three.js keeps
// beside the GPU buffers (typed arrays of every geometry, instance attribute and geometry userData in the model scene
// and the globe scene, by owner: the layer, the building tiles, the terrain ...); (3) optionally (--snapshot) a heap
// snapshot (HeapProfiler.takeHeapSnapshot) summed by constructor (self sizes; typed-array backing stores are "native"
// memory outside the V8 heap: they show under (2), not in usedJSHeapSize) with the largest retained objects reached from
// window globals (dominator tree).
//   python3 -m http.server 8317 --bind 127.0.0.1 &      (from the repository root)
//   node docklands/test/heap-holders.mjs [--base http://127.0.0.1:8317] [--views cw,area] [--size 390x844@2] [--snapshot [--paths] [--chains]] [--query '&x=1'] [--fly]
// --fly: before measuring, the fly of memory-check.mjs (Dublin, Berlin, Manchester 20 km, York 1 km, back to the view),
// with the docklandia sets served from docklands/test/out/places (symlinks): what is still held after the return
// Skill: docklands-3d-page, "Three.js port: level of detail and the hand-over" (memory).
import { chromium } from '@playwright/test';
import { writeFileSync, readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8317'), VIEWS = arg('--views', 'cw,area').split(',').filter(Boolean), EXTRA = arg('--query', ''), SNAP = process.argv.includes('--snapshot');
const [W, H, DPR] = (/^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(arg('--size', '390x844@2')) || []).slice(1).map(Number);
const T = '2026-10-12T12:00', MB = x => +(x / 1048576).toFixed(1), FLY = process.argv.includes('--fly');
const PB = FLY ? readdirSync('docklands/test/out/places').map(id => `&placebase=${encodeURIComponent(`${id}:${BASE}/docklands/test/out/places/${id}/`)}`).join('') : '';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
let failed = 0;

// typed arrays held by the scenes, by owner (the first named ancestor under the scene, or the layer id)
const cpuCopies = () => {
  const D = __docklands3, seen = new Set(), by = {}, add = (k, a) => { if (!a || !a.buffer || seen.has(a.buffer)) return; seen.add(a.buffer); by[k] = (by[k] || 0) + a.buffer.byteLength; };
  const layerOf = new Map(); for (const [id, L] of Object.entries(D.layers)) if (L.api && L.api.object) layerOf.set(L.api.object, 'layer:' + id);
  const named = new Map([[D.ctx.meshes.buildings, 'buildings'], [D.ctx.meshes.terrain, 'terrain'], [D.ctx.meshes.water, 'water'], [D.ctx.meshes.greens, 'greens'], [D.ctx.meshes.rail, 'rail'], [D.ctx.meshes.roads, 'roads'], [D.ctx.meshes.models, 'models']]);
  const ownerOf = o => { for (let x = o; x; x = x.parent) { if (named.has(x)) return named.get(x); if (layerOf.has(x)) return layerOf.get(x); if (x.parent && x.parent.isScene) return 'scene:' + (x.name || x.type); } return 'other'; };
  const walk = (root, pre) => root.traverse(o => { const k = pre + ownerOf(o), g = o.geometry;
    if (g) { for (const a of Object.values(g.attributes)) add(k, a.array || (a.data && a.data.array)); if (g.index) add(k, g.index.array);
      for (const v of Object.values(g.userData || {})) { if (ArrayBuffer.isView(v)) add(k, v); else if (v instanceof Map) for (const w of v.values()) if (ArrayBuffer.isView(w)) add(k, w); } }
    if (o.isInstancedMesh) { add(k, o.instanceMatrix.array); if (o.instanceColor) add(k, o.instanceColor.array); } });
  walk(D.scene, '');
  if (D.globe && D.globe.scene) walk(D.globe.scene, 'globe:');
  const tot = Object.values(by).reduce((s, v) => s + v, 0);
  return { total_mb: +(tot / 1048576).toFixed(1), by: Object.fromEntries(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / 1048576).toFixed(2)])) };
};

// the heap snapshot: self sizes by constructor, and the retained sizes (dominator tree, Cooper-Harvey-Kennedy) of the
// objects that window properties point at
function analyse(file) {
  const S = JSON.parse(readFileSync(file, 'utf8')), M = S.snapshot.meta, NF = M.node_fields.length, EF = M.edge_fields.length, str = S.strings;
  const nodeTypes = M.node_types[0], edgeTypes = M.edge_types[0], N = S.nodes, E = S.edges, n = N.length / NF;
  const iT = M.node_fields.indexOf('type'), iN = M.node_fields.indexOf('name'), iS = M.node_fields.indexOf('self_size'), iC = M.node_fields.indexOf('edge_count');
  const eT = M.edge_fields.indexOf('type'), eN = M.edge_fields.indexOf('name_or_index'), eTo = M.edge_fields.indexOf('to_node');
  const first = new Uint32Array(n + 1); for (let i = 0, e = 0; i < n; i++) { first[i] = e; e += N[i * NF + iC]; } first[n] = E.length / EF;
  const weak = edgeTypes.indexOf('weak'), shortcut = edgeTypes.indexOf('shortcut');
  // self sizes by type / constructor
  const by = new Map(); let total = 0;
  for (let i = 0; i < n; i++) { const t = nodeTypes[N[i * NF + iT]], nm = t === 'object' || t === 'native' || t === 'closure' ? str[N[i * NF + iN]] : '(' + t + ')', s = N[i * NF + iS]; total += s; const k = t + ':' + nm; by.set(k, (by.get(k) || 0) + s); }
  // post-order from the root (node 0), then iterative dominators
  const order = new Int32Array(n).fill(-1), post = new Int32Array(n); let pc = 0;
  { const stack = [0], it = new Uint32Array(n); order[0] = 0; const vis = new Uint8Array(n); vis[0] = 1; it[0] = first[0];
    while (stack.length) { const v = stack[stack.length - 1]; if (it[v] < first[v + 1]) { const e = it[v]++, ty = E[e * EF + eT]; if (ty === weak || ty === shortcut) continue; const w = E[e * EF + eTo] / NF; if (!vis[w]) { vis[w] = 1; it[w] = first[w]; stack.push(w); } } else { stack.pop(); post[pc] = v; order[v] = pc++; } } }
  const preds = Array.from({ length: n }, () => null);
  for (let v = 0; v < n; v++) { if (order[v] < 0) continue; for (let e = first[v]; e < first[v + 1]; e++) { const ty = E[e * EF + eT]; if (ty === weak || ty === shortcut) continue; const w = E[e * EF + eTo] / NF; if (order[w] < 0) continue; (preds[w] ||= []).push(v); } }
  const idom = new Int32Array(n).fill(-1); idom[0] = 0;
  const inter = (a, b) => { while (a !== b) { while (order[a] < order[b]) a = idom[a]; while (order[b] < order[a]) b = idom[b]; } return a; };
  for (let changed = true; changed;) { changed = false; for (let k = pc - 2; k >= 0; k--) { const v = post[k]; if (v === 0) continue; let nd = -1; for (const p of preds[v] || []) if (idom[p] >= 0) nd = nd < 0 ? p : inter(p, nd); if (nd >= 0 && idom[v] !== nd) { idom[v] = nd; changed = true; } } }
  const ret = new Float64Array(n); for (let i = 0; i < n; i++) ret[i] = N[i * NF + iS];
  for (let k = 0; k < pc; k++) { const v = post[k]; if (v !== 0 && idom[v] >= 0) ret[idom[v]] += ret[v]; }
  // window globals: the edges of the Window object(s) named "Window" or "global"
  const named = [];
  for (let v = 0; v < n; v++) { const nm = str[N[v * NF + iN]]; if (!/^Window( \/|$)/.test(nm)) continue;
    for (let e = first[v]; e < first[v + 1]; e++) { if (edgeTypes[E[e * EF + eT]] !== 'property') continue; const w = E[e * EF + eTo] / NF; named.push([str[E[e * EF + eN]], ret[w]]); } }
  // the largest retainers anywhere (excluding the roots' own synthetic nodes), with their names
  const big = []; for (let v = 1; v < n; v++) if (ret[v] > 4 * 1048576 && nodeTypes[N[v * NF + iT]] !== 'synthetic') big.push([nodeTypes[N[v * NF + iT]] + ':' + str[N[v * NF + iN]].slice(0, 60), ret[v], v]);
  big.sort((a, b) => b[1] - a[1]);
  // a path for a node: the edge names from each dominator down to it (what holds it)
  const edgeName = (a, b) => { for (let e = first[a]; e < first[a + 1]; e++) if (E[e * EF + eTo] / NF === b) { const t = edgeTypes[E[e * EF + eT]], nm = E[e * EF + eN]; return t === 'element' || t === 'hidden' ? '[' + nm + ']' : t === 'internal' || t === 'property' || t === 'context' ? String(str[nm]).slice(0, 40) : t + ':' + (typeof nm === 'number' && str[nm] ? str[nm] : nm); } return '?'; };
  const label = v => nodeTypes[N[v * NF + iT]] + ':' + String(str[N[v * NF + iN]]).slice(0, 40);
  const pathOf = v => { const p = []; for (let x = v, k = 0; x !== 0 && idom[x] >= 0 && k < 14; x = idom[x], k++) p.unshift(label(idom[x]) + ' .' + edgeName(idom[x], x)); return p.slice(-7).join(' > '); };
  // the children of a node in the dominator tree, largest first
  const kids = new Map(); for (let v = 1; v < n; v++) if (idom[v] >= 0 && ret[v] > 1048576) { const d = idom[v]; if (!kids.has(d)) kids.set(d, []); kids.get(d).push(v); }
  const tree = (v, depth, out, pre) => { const K = (kids.get(v) || []).sort((a, b) => ret[b] - ret[a]).slice(0, 6); for (const w of K) { out.push(pre + edgeName(v, w) + ' (' + label(w) + ') ' + MB(ret[w]) + ' MB'); if (depth > 1) tree(w, depth - 1, out, pre + '    '); } return out; };
  // closure contexts (module and function scopes): their variables by retained size, and typed-array backing stores
  // summed by the name of the variable or property that points at the array's object (the nearest named holder)
  const ctxs = []; for (let v = 0; v < n; v++) { if (str[N[v * NF + iN]] !== 'system / Context' || ret[v] < 1048576) continue; const vars = [];
    for (let e = first[v]; e < first[v + 1]; e++) { if (edgeTypes[E[e * EF + eT]] !== 'context') continue; const w = E[e * EF + eTo] / NF; if (ret[w] > 262144) vars.push([str[E[e * EF + eN]], MB(ret[w])]); }
    if (vars.length) ctxs.push([MB(ret[v]), vars.sort((a, b) => b[1] - a[1]).slice(0, 8)]); }
  globalThis.__heapCtx = ctxs.sort((a, b) => b[0] - a[0]).slice(0, 25);
  const ab = new Map();
  const esrc = new Int32Array(first[n]); for (let v = 0; v < n; v++) for (let e = first[v]; e < first[v + 1]; e++) esrc[e] = v;
  const parents = new Map(); for (let v = 0; v < n; v++) for (let e = first[v]; e < first[v + 1]; e++) { const w = E[e * EF + eTo] / NF; const t = edgeTypes[E[e * EF + eT]]; if (t === 'weak' || t === 'shortcut') continue; if (!parents.has(w)) parents.set(w, []); parents.get(w).push(e); }
  for (let v = 0; v < n; v++) { if (str[N[v * NF + iN]] !== 'system / JSArrayBufferData') continue; const sz = N[v * NF + iS]; if (sz < 65536) continue;
    // up: backing store <- ArrayBuffer <- typed array <- holder (property or context variable name)
    let names = new Set(), front = [v];
    for (let up = 0; up < 4 && front.length; up++) { const nx = []; for (const x of front) for (const e of parents.get(x) || []) { const src = esrc[e], t = edgeTypes[E[e * EF + eT]], nm = t === 'element' || t === 'hidden' ? null : str[E[e * EF + eN]];
        if (up >= 2 && nm && !/^(buffer|backing_store|array|__proto__)$/.test(nm)) names.add(nm); else nx.push(src); } front = nx.slice(0, 20); if (names.size) break; }
    const k = [...names].slice(0, 3).join('|') || '(unnamed)'; ab.set(k, (ab.get(k) || 0) + sz); }
  // retainer chains of the largest backing stores (first non-weak parent at each step; --chains)
  const big2 = []; for (let v = 0; v < n; v++) if (str[N[v * NF + iN]] === 'system / JSArrayBufferData' && N[v * NF + iS] > 2 * 1048576) big2.push(v);
  big2.sort((a, b) => N[b * NF + iS] - N[a * NF + iS]);
  globalThis.__heapChains = big2.slice(0, 24).map(v => { const out = [MB(N[v * NF + iS]) + ' MB']; let x = v; const seen = new Set([v]);
    for (let k = 0; k < 16; k++) { const ps = (parents.get(x) || []).filter(e => !seen.has(esrc[e])); if (!ps.length) break;
      const e = ps.find(e => !/^(system \/|\(|InternalNode|Detached)/.test(String(str[N[esrc[e] * NF + iN]]))) ?? ps[0], src = esrc[e], t = edgeTypes[E[e * EF + eT]], nm = E[e * EF + eN];
      out.push((t === 'element' || t === 'hidden' ? '[' + nm + ']' : String(str[nm]).slice(0, 30)) + ' < ' + String(str[N[src * NF + iN]]).slice(0, 30)); seen.add(src); x = src; if (src === 0) break; }
    return out.join('  '); });
  globalThis.__heapAB = [...ab].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => [k, MB(v)]);
  globalThis.__heapPaths = big.slice(0, 12).map(([k, s, v]) => k + ' ' + MB(s) + ' MB  <=  ' + pathOf(v) + '\n' + tree(v, 3, [], '      ').join('\n'));
  return { nodes: n, total_mb: MB(total),
    byConstructor: [...by].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k.slice(0, 70), MB(v)]),
    globals: named.sort((a, b) => b[1] - a[1]).filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i).slice(0, 20).map(([k, v]) => [k, MB(v)]),
    biggest: big.slice(0, 30).map(([k, v]) => [k, MB(v)]) };
}

for (const v of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR }), page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(400000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(`${BASE}/docklands/?view=${v}&webgl&animate=0&weather=0&t=${T}${EXTRA}${PB}`);
  await page.waitForFunction(() => window.__docklands3?.ready && window.__docklands3.globe, null, { timeout: 400000 });
  await page.waitForTimeout(8000);
  if (FLY) { await page.waitForFunction(() => window.docklands?.goTo, null, { timeout: 300000 }); for (const t of [[53.34725, -6.25916, 1500, 0, 55], [52.5170, 13.3940, 1500, 80, 55], [53.4794, -2.2453, 20000, 0, 45], [53.9620, -1.0793, 1000, 0, 60], null]) {
    await page.evaluate(async t => { const G = __docklands3.globe, sleep = ms => new Promise(r => setTimeout(r, ms));
      if (t) await docklands.goTo({ lat: t[0], lon: t[1], alt_m: t[2], heading_deg: t[3], tilt_deg: t[4] }, { animate: true }); else G.home();
      while (G.isFlying()) await sleep(200);
      const t0 = performance.now(); let ok = 0; while (performance.now() - t0 < 180000) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); await sleep(200);
        const st = G.placesStats().filter(s => s.state); if (G.mode !== 'globe' || st.every(s => s.settled)) { if (++ok > 3) break; } else ok = 0; } }, t); }
    await page.waitForTimeout(15000); }
  await page.evaluate(() => new Promise(ok => { __docklands3.draw(); requestAnimationFrame(() => requestAnimationFrame(ok)); }));
  const cdp = await ctx.newCDPSession(page);
  const heap = () => page.evaluate(() => +(performance.memory.usedJSHeapSize / 1048576).toFixed(1));
  const h0 = await heap(); await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); const h1 = await heap();
  const copies = await page.evaluate(cpuCopies);
  const gpu = await page.evaluate(() => { const M = __docklands3.renderer.info.memory; return { total_mb: +(M.total / 1048576).toFixed(1), attributes_mb: +(M.attributesSize / 1048576).toFixed(1), textures_mb: +(M.texturesSize / 1048576).toFixed(1) }; });
  console.log(`${W}x${H}@${DPR} ?view=${v}${EXTRA}: JS heap ${h0} MB, after a full GC ${h1} MB; GPU ${JSON.stringify(gpu)}`);
  console.log(`   CPU copies of geometry (typed arrays, outside the JS heap): ${copies.total_mb} MB ${JSON.stringify(copies.by)}`);
  if (SNAP) {
    const dir = mkdtempSync(join(tmpdir(), 'heap-')), file = join(dir, 'h.heapsnapshot'), parts = [];
    cdp.on('HeapProfiler.addHeapSnapshotChunk', p => parts.push(p.chunk));
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
    writeFileSync(file, parts.join('')); parts.length = 0;
    const A = analyse(file); rmSync(dir, { recursive: true, force: true });
    console.log(`   snapshot: ${A.nodes} nodes, ${A.total_mb} MB of self sizes (V8 heap plus native nodes)`);
    console.log('   by constructor (self MB): ' + JSON.stringify(A.byConstructor));
    console.log('   window globals (retained MB): ' + JSON.stringify(A.globals));
    console.log('   largest retainers (MB): ' + JSON.stringify(A.biggest));
    console.log('   closure contexts (retained MB, variables): ' + JSON.stringify(globalThis.__heapCtx));
    console.log('   typed-array backing stores by holder name (MB): ' + JSON.stringify(globalThis.__heapAB));
    if (process.argv.includes('--paths')) console.log('   holders:\n' + globalThis.__heapPaths.join('\n'));
    if (process.argv.includes('--chains')) console.log('   retainer chains of the largest arrays:\n      ' + globalThis.__heapChains.join('\n      '));
  }
  if (errors.length) { failed++; console.log('FAIL page errors: ' + errors.slice(0, 3).join(' | ')); }
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
