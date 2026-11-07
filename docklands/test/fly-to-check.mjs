// Check of fly_to, get_flight and stop_flight (api.js): headless Chromium, the globe.
//  1. fly_to Tokyo from Canary Wharf: answers at once with status flying; the view passes through points between
//     London and Tokyo (not a jump); it arrives near Tokyo; get_flight says arrived.
//  2. fly_to with via and duration_s: two legs, the length shared out; stop_flight stops it mid-way.
//  3. go_to with animate on the globe still answers with the new view.
//   python3 -m http.server 8207 --bind 127.0.0.1 &   (repository root)
//   CHROME_PATH=... node docklands/test/fly-to-check.mjs [--base http://127.0.0.1:8207]
import { chromium } from '@playwright/test';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8207');
const EXE = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fails = 0; const ok = (c, m, extra = '') => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${m}${extra ? ' :: ' + String(extra).slice(0, 300) : ''}`); };
const browser = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${BASE}/docklands/?view=cw`, { waitUntil: 'load' });
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.waitForFunction(() => globalThis.docklands && globalThis.__docklands3?.ready, null, { timeout: 300000 }).catch(e => { console.log('not ready; errors:', errors.slice(0, 8).join(' | ')); throw e; });
await page.evaluate(() => docklands.ready);
const call = (name, args) => page.evaluate(([n, a]) => globalThis.docklands.callTool(n, a), [name, args]);
const target = v => { const t = v.target || v; return { lon: +t.lon, lat: +t.lat }; };
const names = await page.evaluate(() => globalThis.docklands.tools.map(t => t.name));
ok(['fly_to', 'get_flight', 'stop_flight'].every(n => names.includes(n)), 'tools listed', names.filter(n => /fl/.test(n)).join(' '));

// warm up: the place search and the globe load once (slow in SwiftShader)
await call('find_places', { query: 'Tokyo', limit: 1 });
await call('go_to', { lon: -0.02, lat: 51.5, alt_m: 2e6 });
// 1
const t0 = Date.now(), r = await call('fly_to', { place: 'Tokyo', duration_s: 40 });
ok(r.status === 'flying' && Date.now() - t0 < 10000, 'fly_to answers at once with status flying', `${r.status} in ${Date.now() - t0} ms; legs ${JSON.stringify(r.legs)}`);
const seen = [];
for (let i = 0; i < 160; i++) { await page.waitForTimeout(500); const f = await call('get_flight'); seen.push({ ...target(f.view), p: f.progress, s: f.status }); if (f.status !== 'flying') break; }
const mid = seen.filter(p => p.lon > 10 && p.lon < 130);
ok(mid.length >= 3, 'the view passes between London and Tokyo', JSON.stringify(seen.slice(0, 6)));
const last = await call('get_flight'), end = target(last.view);
ok(last.status === 'arrived' && Math.abs(end.lon - 139.7) < 2 && Math.abs(end.lat - 35.7) < 2, 'arrives at Tokyo', `${last.status} ${end.lat.toFixed(2)},${end.lon.toFixed(2)}`);

// 2
const r2 = await call('fly_to', { lon: 2.35, lat: 48.86, via: [{ place: 'Berlin' }], duration_s: 20 });
ok(r2.legs.length === 2 && Math.abs(r2.duration_s - 20) < 0.5, 'two legs share duration_s', JSON.stringify(r2.legs));
await page.waitForTimeout(3000);
const s = await call('stop_flight'); const at = target(s.view);
await page.waitForTimeout(1500); const after = target((await call('get_flight')).view);
ok(s.status === 'stopped' && Math.abs(at.lon - after.lon) < 0.01 && Math.abs(at.lat - after.lat) < 0.01, 'stop_flight stops where the view is', `${s.status} ${JSON.stringify(at)} then ${JSON.stringify(after)}`);

// 3
const g = await call('go_to', { lon: -74.0, lat: 40.7, alt_m: 200000, animate: true });
ok(Math.abs(target(g).lon + 74) < 2, 'go_to animate on the globe', JSON.stringify(target(g)));
ok(errors.length === 0, 'no page errors', errors.join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
