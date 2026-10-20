// Load-time measurement of the Three.js port (docklands/) at phone size: cold, warm and "stale" loads, with and without
// the service worker (docklands/sw.js). Written 2026-10-20 for the Pages stopgap (owner, 2026-10-20: "any GH based Range
// request optimisation, or other perf work, would still be worthwhile as a stopgap"; KR3.1 low-end devices).
//   node docklands/test/perf-load.mjs [--base URL] [--views cw,globe,leon] [--runs 1] [--sw both|on|off] [--delay 40]
//                                     [--size 390x844@2] [--json out.json] [--live] [--root .] [--servers max-age,no-cache]
// Without --base it starts two cwplans/tools/range-server.mjs servers on the repository root, like GitHub Pages (gzip,
// ETag, a delay per answer for the round trip): one with `max-age=600` (Pages; the "warm" load inside 10 minutes) and one
// with `no-cache` (every file revalidated: the state of a repeat visit after 10 minutes, the usual case). --live measures
// https://danbri.github.io/londat (read requests only).
// Per load: boot (the boot screen gone: the first view drawn), ready (the view's data in: model ready, globe ready, or the
// place's tiles loaded), requests (same origin, how many came from the service worker), bytes on the wire (encoded, CDP
// Network.loadingFinished), server requests and bytes (local servers), network busy time (the union of the same-origin
// request intervals before ready: the part of the wait the network causes; in software rendering most of `ready` is CPU).
// Third-party hosts (weather, live feeds) fail at once locally (--host-resolver-rules), so the numbers measure our site;
// --live lets them through. No Playwright routing: it turns the HTTP cache off.
// Skill: docklands-3d-page, "Load speed on Pages: the service worker".
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { startRangeServer } from '../../cwplans/tools/range-server.mjs';

const argv = process.argv, arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const ROOT = arg('--root', '.'), LIVE = argv.includes('--live'), RUNS = +arg('--runs', 1), DELAY = +arg('--delay', 40), SWM = arg('--sw', 'both'), SERVERS = arg('--servers', 'max-age,no-cache').split(',');
const [W, H, DPR] = (/^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(arg('--size', '390x844@2')) || []).slice(1).map(Number);
const VIEWS = {
  cw: { q: 'view=cw', ready: () => window.__docklands3 && window.__docklands3.ready },
  globe: { q: 'view=globe', ready: () => window.__docklands3?.globe?.ready && window.__docklands3.globe.mode === 'globe' },
  leon: { q: 'll=42.59732,-5.56654,1500&ht=0,55', ready: () => { const G = window.__docklands3?.globe; return !!(G && G.places && G.places.some(p => p.state === 'loaded')); } },
};
const views = arg('--views', 'cw,globe,leon').split(',');
// third-party hosts fail at once locally (no route handler: Playwright routing turns the HTTP cache off, which is what a
// repeat load measures)
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...(LIVE ? [] : ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'])] });

let servers = [];
if (!LIVE && !arg('--base')) {
  servers = [await startRangeServer({ root: ROOT, port: 0, gzip: true, delay: DELAY, maxAge: 600 }), await startRangeServer({ root: ROOT, port: 0, gzip: true, delay: DELAY })];
}
const bases = LIVE ? [['pages', 'https://danbri.github.io/londat']] : arg('--base') ? [['base', arg('--base')]] : [['max-age=600', servers[0].url], ['no-cache', servers[1].url]].filter(([l]) => SERVERS.some(k => l.startsWith(k)));

async function load(ctx, base, view, sw) {
  const page = await ctx.newPage(), errors = [], cdp = await ctx.newCDPSession(page);
  page.setDefaultTimeout(600000);
  await page.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch {} });
  await cdp.send('Network.enable');
  const origin = new URL(base).origin; let wire = 0, same = 0, fromSW = 0, fromCache = 0, other = 0;
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', e => reqs.set(e.requestId, e.request.url));
  cdp.on('Network.responseReceived', e => { const u = e.response.url; if (!u.startsWith(origin)) return; if (e.response.fromServiceWorker) fromSW++; else if (e.response.fromDiskCache || e.response.fromPrefetchCache) fromCache++; });
  cdp.on('Network.loadingFinished', e => { const u = reqs.get(e.requestId) || ''; if (u.startsWith(origin)) { same++; wire += e.encodedDataLength; } else if (/^https?:/.test(u)) other++; });
  page.on('pageerror', e => errors.push(e.message));
  const srv = servers.find(s => s.url === base); const s0 = srv ? { ...srv.stats } : null;
  const url = `${base}/docklands/?${VIEWS[view].q}&webgl&animate=0&weather=0${sw ? '' : '&sw=0'}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  const boot = page.waitForFunction(() => { const b = document.getElementById('boot'); return b && (b.hidden || b.classList.contains('done')); }, null, { polling: 50 }).then(() => Date.now() - t0);
  const ready = page.waitForFunction(VIEWS[view].ready, null, { polling: 50 }).then(() => Date.now() - t0);
  const [tb, tr] = await Promise.all([boot, ready]);
  await page.waitForTimeout(1500);   // late requests of the start view
  const controlled = await page.evaluate(() => !!navigator.serviceWorker?.controller);
  // network busy time: the union of the [start, end] intervals of the same-origin requests made before `ready` (Resource
  // Timing), so the software renderer's CPU time (most of `ready` in SwiftShader) does not hide what the network costs
  const rt = await page.evaluate(([tr]) => { const nav = performance.getEntriesByType('navigation')[0]; const L = [nav, ...performance.getEntriesByType('resource')].filter(e => e.name.startsWith(location.origin) && e.startTime <= tr);
    const iv = L.map(e => [e.startTime, e.responseEnd]).sort((a, b) => a[0] - b[0]); let busy = 0, cur = null;
    for (const [a, b] of iv) { if (!cur || a > cur[1]) { if (cur) busy += cur[1] - cur[0]; cur = [a, b]; } else cur[1] = Math.max(cur[1], b); }
    if (cur) busy += cur[1] - cur[0];
    const last = Math.max(...L.map(e => e.responseEnd)); return { busy: Math.round(busy), last: Math.round(last), n: L.length }; }, [tr]);
  const out = { view, sw, boot_ms: tb, ready_ms: tr, net_busy_ms: rt.busy, last_response_ms: rt.last, requests: same, from_sw: fromSW, from_http_cache: fromCache, other_requests: other, wire_bytes: wire,
    server_requests: srv ? srv.stats.requests - s0.requests : null, server_bytes: srv ? srv.stats.bytes - s0.bytes : null, controlled, errors: errors.slice(0, 3) };
  await page.close();
  return out;
}

const results = [];
for (const [label, base] of bases) for (const view of views) for (const sw of (SWM === 'both' ? [false, true] : [SWM === 'on'])) for (let run = 0; run < RUNS; run++) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, serviceWorkers: 'allow' });
  const cold = await load(ctx, base, view, sw);
  if (sw) await new Promise(r => setTimeout(r, 2500));   // let the worker finish caching what the first load read
  const warm = await load(ctx, base, view, sw);
  await ctx.close();
  for (const [kind, r] of [['cold', cold], ['repeat', warm]]) {
    results.push({ server: label, kind, ...r });
    console.log(`${label.padEnd(12)} ${view.padEnd(6)} sw=${sw ? 'on ' : 'off'} ${kind.padEnd(6)} boot ${String(r.boot_ms).padStart(6)} ms  ready ${String(r.ready_ms).padStart(6)} ms  net busy ${String(r.net_busy_ms).padStart(6)} ms  req ${String(r.requests).padStart(4)} (sw ${r.from_sw}, http cache ${r.from_http_cache})  wire ${(r.wire_bytes / 1e6).toFixed(2)} MB` +
      (r.server_requests != null ? `  server ${r.server_requests} req ${(r.server_bytes / 1e6).toFixed(2)} MB` : '') + (r.errors.length ? '  ERR ' + r.errors.join(' | ').slice(0, 200) : ''));
  }
}
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify({ at: new Date().toISOString(), size: [W, H, DPR], delay: DELAY, results }, null, 1));
await browser.close();
for (const s of servers) await s.close();
