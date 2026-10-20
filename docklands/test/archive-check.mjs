// Headless measurement and check of the range-read archive prototype (hosting study, docs/hosting-options.md): the UK
// skeleton (cwplans/docklands/data/uk/, 1,532 files) read as files and as one ZIP (cwplans/tools/pack-range-archive.mjs)
// through docklands/geo/range-archive.js, from cwplans/tools/range-server.mjs (Range, gzip like GitHub Pages).
//   node docklands/test/archive-check.mjs [--delays 0,40] [--no-h2] [--no-page] [--rebuild] [--live]
// --live: also the files layout from the live Pages site (3 cold runs; read requests only).
// Scenario (what the globe asks for on a flight UK -> south-east England -> London, then a search): the 10 drawn layers of
// skeleton-layers.js at level 3 over the UK, level 6 over the south-east and level 8 over London; search "Leeds"; its
// card; whereAmI at Canary Wharf. Each run in a new browser context (cold cache). Numbers: requests and bytes from the
// server, wall time in the page. Archive modes: 'archive' (cache: 'no-store', merge gap 32 KB), 'archive-gap4k' (gap
// 4 KB), 'archive-httpcache' (the HTTP cache on: Chromium then runs parallel range reads of one URL one after another,
// the cache lock; measured 2026-10-20). --delay ms per answer stands for the round trip to a far host (localhost has none).
// Then the real page: /docklands/?view=globe&archive=<zip> loads with no page errors and finds "Leeds" from the archive.
// Writes docklands/test/out/archive/results.json. Skill: docklands-3d-page, "Hosting: range reads and one-file archives".
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { startRangeServer } from '../../cwplans/tools/range-server.mjs';
import { packFolder } from '../../cwplans/tools/pack-range-archive.mjs';

const argv = process.argv, arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const DELAYS = arg('--delays', '0,40').split(',').map(Number), H2 = !argv.includes('--no-h2'), PAGE = !argv.includes('--no-page');
const OUT = 'docklands/test/out/archive', ZIP = `${OUT}/uk.zip`;
mkdirSync(OUT, { recursive: true });
if (argv.includes('--rebuild') || !existsSync(ZIP)) {
  const { zip, report } = packFolder('cwplans/docklands/data/uk', { last: 'manifest.json', exclude: /^(log\.json|README\.md)$/ });
  writeFileSync(ZIP, zip); console.log('packed', JSON.stringify(report));
}
let tls = null;
if (H2) {
  const c = `${OUT}/cert.pem`, k = `${OUT}/key.pem`;
  if (!existsSync(c)) execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', k, '-out', c, '-days', '2', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
  tls = [c, k];
}
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors'] });
let failed = 0; const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ' · ' + detail : ''}`); };

async function scenario(srv, mode) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${srv.url}/docklands/test/out/archive/blank.html`);
  await page.evaluate(() => fetch('/__reset'));
  const r = await page.evaluate(async ({ mode }) => {
    const { openSkeleton } = await import('/docklands/geo/skeleton.js');
    const t0 = performance.now(), base = location.origin + '/cwplans/docklands/data/uk/', steps = {};
    let opt = {}, ar = null;
    if (mode !== 'files') { const m = await import('/docklands/geo/range-archive.js'); ar = await m.openRangeArchive(location.origin + '/docklands/test/out/archive/uk.zip', { cache: /httpcache/.test(mode) ? 'default' : 'no-store', gap: /gap4k/.test(mode) ? 4096 : 32768 }); opt = { fetchJson: m.archiveFetchJson(ar, base) }; }
    const sk = await openSkeleton(base, opt); steps.open = performance.now() - t0;
    const layers = ['boundaries', 'roads', 'rail', 'rivers', 'lakes', 'built-up', 'national-parks', 'landscapes', 'places', 'stations'];
    const views = { uk: [[-8.7, 49.85, 1.8, 60.9], 3], southeast: [[-2, 50.5, 1.8, 52.6], 6], london: [[-0.6, 51.25, 0.35, 51.75], 8] };
    const counts = {};
    for (const [k, [bbox, level]] of Object.entries(views)) { const t = performance.now(); const fs = await Promise.all(layers.map(l => sk.features(l, bbox, level))); steps[k] = performance.now() - t; counts[k] = fs.reduce((s, f) => s + f.length, 0); }
    let t = performance.now(); const hits = await sk.search('Leeds', { limit: 5 }); steps.search = performance.now() - t;
    t = performance.now(); const card = await sk.card(hits[0]); steps.card = performance.now() - t;
    t = performance.now(); const where = await sk.whereAmI(-0.0195, 51.5049); steps.where = performance.now() - t;
    for (const k in steps) steps[k] = Math.round(steps[k]);
    return { ms: Math.round(performance.now() - t0), steps, counts, leeds: hits[0] && hits[0].name, card: !!card, where: where.district && where.district.name, reader: ar && ar.stats };
  }, { mode });
  const stats = await page.evaluate(() => fetch('/__stats').then(r => r.json()));
  await ctx.close();
  return { ...r, requests: stats.requests, bytes: stats.bytes, errors };   // /__reset and /__stats are not counted
}

const results = { date: new Date().toISOString(), zip: ZIP, runs: [] };
writeFileSync(`${OUT}/blank.html`, '<!doctype html><meta charset="utf-8"><title>archive check</title>');
for (const proto of H2 ? ['h1', 'h2'] : ['h1']) for (const delay of DELAYS) {
  const srv = await startRangeServer({ root: '.', port: 0, gzip: true, delay, tls: proto === 'h2' ? tls : null });
  try {
    for (const mode of ['files', 'archive', 'archive-gap4k', 'archive-httpcache']) {
      const r = await scenario(srv, mode);
      results.runs.push({ proto, delay, mode, ...r });
      console.log(`${proto} delay ${String(delay).padStart(3)} ms  ${mode.padEnd(21)}  requests ${String(r.requests).padStart(4)}  bytes ${String(r.bytes).padStart(9)}  ${String(r.ms).padStart(6)} ms  ${JSON.stringify(r.steps)}  features ${JSON.stringify(r.counts)}`);
      check(!r.errors.length && r.leeds === 'Leeds' && r.card && r.where, `${proto}/${delay}/${mode}: scenario ran (Leeds, card, district ${r.where})`, r.errors.join('; '));
    }
    const [f, ...rest] = results.runs.slice(-4);
    check(rest.every(a => JSON.stringify(f.counts) === JSON.stringify(a.counts)), `${proto}/${delay}: same feature counts from files and archive`);
  } finally { await srv.close(); }
}

if (argv.includes('--live')) {   // the files layout from the live GitHub Pages site (HTTP/2, real network), 3 cold runs
  results.live = [];
  for (let run = 0; run < 3; run++) {
    const ctx = await browser.newContext(), page = await ctx.newPage();
    await page.goto('https://danbri.github.io/londat/README.md');
    const r = await page.evaluate(async () => {
      performance.setResourceTimingBufferSize(5000);
      const { openSkeleton } = await import('/londat/docklands/geo/skeleton.js');
      const t0 = performance.now(), steps = {};
      const sk = await openSkeleton(location.origin + '/londat/cwplans/docklands/data/uk/'); steps.open = performance.now() - t0;
      const layers = ['boundaries', 'roads', 'rail', 'rivers', 'lakes', 'built-up', 'national-parks', 'landscapes', 'places', 'stations'];
      for (const [k, bbox, level] of [['uk', [-8.7, 49.85, 1.8, 60.9], 3], ['southeast', [-2, 50.5, 1.8, 52.6], 6], ['london', [-0.6, 51.25, 0.35, 51.75], 8]]) { const t = performance.now(); await Promise.all(layers.map(l => sk.features(l, bbox, level))); steps[k] = performance.now() - t; }
      let t = performance.now(); const hits = await sk.search('Leeds', { limit: 5 }); steps.search = performance.now() - t;
      t = performance.now(); await sk.card(hits[0]); steps.card = performance.now() - t;
      t = performance.now(); await sk.whereAmI(-0.0195, 51.5049); steps.where = performance.now() - t;
      const res = performance.getEntriesByType('resource').filter(e => /data\/uk\//.test(e.name));
      for (const k in steps) steps[k] = Math.round(steps[k]);
      return { ms: Math.round(performance.now() - t0), steps, requests: res.length, transfer: res.reduce((s, e) => s + e.transferSize, 0), protocol: [...new Set(res.map(e => e.nextHopProtocol))] };
    });
    results.live.push(r); console.log('live Pages files', JSON.stringify(r));
    await ctx.close();
  }
}

if (PAGE) {   // the real page with the flag
  const srv = await startRangeServer({ root: '.', port: 0, gzip: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }), page = await ctx.newPage(), errors = [];
    page.setDefaultTimeout(240000);
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather|api\.github\.com|raw\.githubusercontent\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto(`${srv.url}/docklands/?view=globe&archive=/docklands/test/out/archive/uk.zip&webgl&animate=0&weather=0`);
    await page.waitForFunction(() => window.__docklands3?.globe?.ready && window.docklands, null, { timeout: 240000 });
    const hits = await page.evaluate(async () => (await docklands.findPlaces('Leeds', 5)).map(h => h.name + ' / ' + (h.kind || '')));
    const ar = await page.evaluate(() => (globalThis.__rangeArchives || []).map(a => a.stats));
    const st = await page.evaluate(() => fetch('/__stats').then(r => r.json()));
    const ukFiles = Object.keys(st.paths).filter(p => p.startsWith('/cwplans/docklands/data/uk/'));
    check(!errors.length, 'page ?view=globe&archive=...: no page errors', errors.slice(0, 3).join(' | '));
    check(hits.some(h => /^Leeds/.test(h)), 'page: findPlaces("Leeds") answers from the archive', hits.slice(0, 3).join('; '));
    check(ar.length === 1 && ar[0].requests >= 1 && st.paths['/docklands/test/out/archive/uk.zip'], 'page: the skeleton was read from uk.zip', JSON.stringify(ar[0]));
    check(ukFiles.length === 0, 'page: no file of the uk/ folder was read', ukFiles.slice(0, 3).join(' '));
    results.page = { hits, archive: ar[0], ukFiles: ukFiles.length, errors };
    await ctx.close();
  } finally { await srv.close(); }
}
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
await browser.close();
console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
process.exit(failed ? 1 : 0);
