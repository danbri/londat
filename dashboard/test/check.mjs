// Headless check of the londat dashboard (dashboard/index.html): the page loads with no page errors, every section ends
// without "Error", and the KR5.1 (runs per UTC day) and KR5.2 (live feed gaps) sections show their numbers, chart text
// equivalents (aria-label on each chart, a table or a list) and no error box. Prints the numbers it shows.
// Requests to api.github.com go through the gh CLI (signed in: the 60-an-hour limit of a shared address does not apply)
// with --gh, else to the network; raw.githubusercontent.com is fetched by Node (the agent proxy needs no Chromium CA).
//   python3 -m http.server 8231 --bind 127.0.0.1 &   (repository root)
//   node dashboard/test/check.mjs [--base http://127.0.0.1:8231] [--gh] [--width 390 --height 844]
// Skill: cwplans-londat-cache, "The dashboard: KR5.1 and KR5.2".
import { chromium } from '@playwright/test';
import { execFile } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8231'), GHCLI = process.argv.includes('--gh');
const W = +arg('--width', 1280), H = +arg('--height', 900);
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fails = 0; const ok = (c, m, extra = '') => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${m}${extra ? ' :: ' + String(extra).slice(0, 400) : ''}`); };
const gh = path => new Promise((res, rej) => execFile('gh', ['api', '-i', path], { maxBuffer: 64e6 }, (e, out) => {
  const i = out ? out.indexOf('\r\n\r\n') >= 0 ? out.indexOf('\r\n\r\n') : out.indexOf('\n\n') : -1;
  if (i < 0) return rej(e || new Error('gh: no answer'));
  const head = out.slice(0, i), status = +((/HTTP\/[\d.]+ (\d+)/.exec(head) || [])[1] || 200);
  res({ status, body: out.slice(i).trim() });
}));

const browser = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: W < 500 ? 2 : 1 });
const page = await ctx.newPage(); page.setDefaultTimeout(90000);
const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset' };
await page.route(/^https:\/\/api\.github\.com\//, async route => {
  if (!GHCLI) return route.continue();
  const u = new URL(route.request().url()), path = u.pathname.replace(/^\//, '') + u.search;
  try { const r = await gh(path); await route.fulfill({ status: r.status, contentType: 'application/json', headers: cors, body: r.body }); }
  catch (e) { await route.fulfill({ status: 502, headers: cors, body: String(e.message) }); }
});
await page.route(/^https:\/\/(raw\.githubusercontent\.com|danbri\.github\.io)\//, async route => {
  try { const r = await fetch(route.request().url()); await route.fulfill({ status: r.status, headers: { ...cors, 'content-type': r.headers.get('content-type') || 'text/plain' }, body: Buffer.from(await r.arrayBuffer()) }); }
  catch (e) { await route.abort(); }
});
await page.goto(`${BASE}/dashboard/`);
await page.waitForFunction(() => !document.body.classList.contains('busy') && /Last checked/.test(document.getElementById('checked').textContent), null, { timeout: 120000 });
const r = await page.evaluate(() => {
  const sec = id => { const el = document.getElementById(id); return { chip: document.getElementById(id + '-chip')?.innerText.trim(), err: el.querySelector('.err')?.innerText || null,
    tiles: [...el.querySelectorAll('.tile')].map(t => t.innerText.replace(/\s+/g, ' ').trim()), svgLabel: el.querySelector('svg[role=img]')?.getAttribute('aria-label') || null,
    rows: el.querySelectorAll('tbody tr').length, items: [...el.querySelectorAll('ul.list li')].map(li => li.innerText.replace(/\s+/g, ' ').trim()).slice(0, 10) }; };
  return { summary: [...document.querySelectorAll('#summary-list li')].map(li => li.innerText.replace(/\s+/g, ' ').trim()), kr51: sec('kr51'), kr52: sec('kr52'),
    api: document.getElementById('apinote').textContent, scrollX: document.documentElement.scrollWidth - innerWidth };
});
console.log('-- summary'); for (const s of r.summary) console.log('   ' + s);
console.log('-- KR5.1 tiles: ' + r.kr51.tiles.join(' | '));
console.log('-- KR5.2 tiles: ' + r.kr52.tiles.join(' | '));
console.log('-- KR5.2 gaps:\n   ' + r.kr52.items.join('\n   '));
console.log('-- ' + r.api);
ok(!r.kr51.err && r.kr51.tiles.length === 3, 'KR5.1 section: tiles, no error', r.kr51.err);
ok(r.kr51.rows === 14 && /runs per UTC day/.test(r.kr51.svgLabel || ''), 'KR5.1: a 14-row table and a chart with a text label', `${r.kr51.rows} rows; ${r.kr51.svgLabel}`);
ok(!r.kr52.err && r.kr52.tiles.length === 4 && /old/.test(r.kr52.tiles[0]), 'KR5.2 section: four tiles with the file ages, no error', r.kr52.err);
ok(/live feed/.test(r.kr52.svgLabel || '') && (r.kr52.items.length > 0 || /No gap/.test(await page.locator('#kr52').innerText())), 'KR5.2: chart text label and the list of gaps', r.kr52.svgLabel);
ok(r.scrollX <= 0, `no horizontal scroll at ${W}x${H}`, r.scrollX);
ok(errors.length === 0, 'no page errors', errors.join(' | '));
await page.screenshot({ path: arg('--shot', '/tmp/dashboard.png'), fullPage: true }).catch(() => {});
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
