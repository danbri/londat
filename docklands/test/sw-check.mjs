// Headless check of the service worker of the 3D page (docklands/sw.js, registered by docklands/index.html; skill
// docklands-3d-page, "Load speed on Pages: the service worker"). Serves the repository root like GitHub Pages
// (cwplans/tools/range-server.mjs: gzip, ETag, max-age=600 or no-cache) after writing docklands/sw-manifest.json
// (cwplans/tools/build-sw-manifest.mjs; git-ignored), then in one browser context:
//   1. first visit: the worker installs and takes the page; the files the page read are copied into its cache (warm);
//   2. second visit: the deployed files come from the worker (no request reaches the server for them), live data from
//      other origins (raw.githubusercontent.com live-cache, the hourly cache) is fetched again and never cached;
//   3. a file whose bytes do not match the manifest hash is not cached (a stale copy is never kept under a new hash);
//   4. a new manifest version: entries whose hash changed are dropped;
//   5. ?sw=0 unregisters the worker and deletes its caches; the page loads without it.
//   node docklands/test/sw-check.mjs [--query 'view=globe&layers=ships,planes'] [--keep-manifest]
import { chromium } from '@playwright/test';
import { writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { startRangeServer } from '../../cwplans/tools/range-server.mjs';
import { buildManifest } from '../../cwplans/tools/build-sw-manifest.mjs';

const argv = process.argv, arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const Q = arg('--query', 'view=globe&layers=ships,planes'), MAN = 'docklands/sw-manifest.json';
const hadManifest = existsSync(MAN), oldManifest = hadManifest ? readFileSync(MAN) : null;
let failed = 0; const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ' · ' + detail : ''}`); };

const manifest = buildManifest('.', { version: 'test-1' });
const BAD = 'docklands/views.js';   // step 3: a wrong hash for this file
writeFileSync(MAN, JSON.stringify({ ...manifest, files: { ...manifest.files, [BAD]: '0000000000000000' } }));
const srv = await startRangeServer({ root: '.', port: 0, gzip: true, delay: 20, maxAge: 600 });
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
// other hosts fail at once (no Playwright routing: it turns the HTTP cache off, and the first visit's warm copy reads it)
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'allow' });
const LIVE = /raw\.githubusercontent\.com|open-meteo|adsb\.lol|openwaters|aviationweather|api\.tfl|environment\.data/;
const liveSeen = [];
ctx.on('request', r => { if (LIVE.test(r.url())) liveSeen.push(r.url()); });

async function visit(q, { wait = true } = {}) {
  const page = await ctx.newPage(), errors = [], resp = [];
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.url().startsWith(srv.url)) resp.push({ url: r.url(), sw: r.fromServiceWorker(), status: r.status() }); });
  const before = { ...srv.stats, paths: Object.fromEntries(Object.entries(srv.stats.paths).map(([k, v]) => [k, v.n])) };
  const t0 = Date.now();
  await page.goto(`${srv.url}/docklands/?${q}&webgl&animate=0&weather=0`);
  if (wait) await page.waitForFunction(() => window.__docklands3?.globe?.ready || window.__docklands3?.ready, null, { polling: 100 });
  const ms = Date.now() - t0;
  await page.waitForTimeout(2000);
  const hits = Object.entries(srv.stats.paths).filter(([k, v]) => v.n > (before.paths[k] || 0)).map(([k]) => k);
  return { page, errors, resp, ms, server: srv.stats.requests - before.requests, hits };
}
const swStats = page => page.evaluate(() => new Promise(ok => { const c = navigator.serviceWorker.controller; if (!c) return ok(null);
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'sw-stats') ok(e.data); }, { once: true }); c.postMessage({ type: 'stats' }); }));

try {
  // 1. first visit
  const v1 = await visit(Q);
  check(!v1.errors.length, 'first visit: no page errors', v1.errors.slice(0, 2).join(' | '));
  await v1.page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60000 }).catch(() => {});
  check(await v1.page.evaluate(() => !!navigator.serviceWorker.controller), 'first visit: the worker controls the page');
  let st = null; for (let i = 0; i < 40; i++) { await v1.page.waitForTimeout(1000); const s = await swStats(v1.page); if (st && s && s.entries === st.entries && s.entries > 20) { st = s; break; } st = s; }
  check(st && st.entries > 20, 'first visit: the files read are in the cache (warm copy from the HTTP cache)', st ? `${st.entries} entries, ${(st.bytes / 1e6).toFixed(1)} MB, warmed ${st.warmed}, stored ${st.stored}` : 'no stats');
  await v1.page.close();

  // 2. second visit
  liveSeen.length = 0;
  const v2 = await visit(Q);
  const same = v2.resp.filter(r => !/\/docklands\/(\?|$)|sw-manifest\.json/.test(r.url));
  const fromSw = same.filter(r => r.sw).length;
  check(!v2.errors.length, 'second visit: no page errors', v2.errors.slice(0, 2).join(' | '));
  check(fromSw >= same.length * 0.9 && fromSw > 20, 'second visit: the deployed files come from the worker', `${fromSw} of ${same.length} same-origin responses`);
  const toServer = v2.hits.filter(p => !/^\/docklands\/$|sw-manifest\.json|sw\.js$/.test(p));
  check(toServer.length <= 3, 'second visit: the server is asked only for the page, the manifest and files not in the manifest', `${v2.server} requests: ${v2.hits.slice(0, 8).join(', ')}`);
  check(toServer.some(p => p.endsWith(BAD)), 'a file whose hash does not match the manifest is fetched again (never cached)', toServer.join(', '));
  st = await swStats(v2.page);
  check(st && !st.urls.some(u => u.endsWith(BAD)), 'the mismatched file is not in the cache', `mismatched ${st && st.mismatched}`);
  check(st && !st.urls.some(u => !u.startsWith(srv.url)), 'no other origin in the cache (live data, raw.githubusercontent.com)');
  check(st && !st.urls.some(u => /\/cwplans\/cache\//.test(u)), 'no file of the hourly cache (cwplans/cache/) in the worker cache');
  check(liveSeen.some(u => /raw\.githubusercontent\.com/.test(u)), 'second visit: live data requested from the network again', `${liveSeen.length} live requests, e.g. ${(liveSeen[0] || '').slice(0, 90)}`);
  console.log(`     second visit ready in ${v2.ms} ms (first ${v1.ms} ms); server requests ${v2.server} (first ${v1.server})`);
  await v2.page.close();

  // 4. a new deploy: one file's hash changes (here: back to its true hash) and the version moves on
  writeFileSync(MAN, JSON.stringify({ ...manifest, version: 'test-2', files: { ...manifest.files, 'docklands/perf.js': '1111111111111111' } }));
  const v3 = await visit(Q);
  await v3.page.waitForTimeout(3000);
  st = await swStats(v3.page);
  check(st && st.manifest === 'test-2', 'a new manifest is read at the next visit', st && st.manifest);
  check(st && !st.urls.some(u => u.endsWith('docklands/perf.js')), 'an entry whose hash is no longer deployed is dropped');
  check(st && st.urls.some(u => u.endsWith(BAD)), 'the file with its true hash is now cached', BAD);
  await v3.page.close();

  // 5. the way off
  const v4 = await visit(Q.replace(/^/, 'sw=0&'), { wait: true });
  await v4.page.waitForTimeout(1500);
  const off = await v4.page.evaluate(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).map(r => r.scope), caches: (await caches.keys()).filter(k => k.startsWith('londat-docklands-')) }));
  check(!off.regs.some(s => s.endsWith('/docklands/')) && !off.caches.length, '?sw=0 unregisters the worker and deletes its caches', JSON.stringify(off));
  check(!v4.errors.length, '?sw=0: no page errors', v4.errors.slice(0, 2).join(' | '));
  await v4.page.close();
} finally {
  await browser.close(); await srv.close();
  if (hadManifest && argv.includes('--keep-manifest')) writeFileSync(MAN, oldManifest); else rmSync(MAN, { force: true });
}
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
