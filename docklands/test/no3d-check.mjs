// Check of the Docklands page without 3D (OKR KR3.2, KR3.3): the text view, the 2D map (no3d.js) and the data-only page
// API, in headless Chromium with no WebGL and no WebGPU, at 390x844@2 (a phone).
//  1. The renderer fails (--disable-webgl --disable-3d-apis, navigator.gpu removed): ?view=cw shows the text view with
//     Canary Wharf places, the 2D map (drawn: not one colour), window.docklands.no3d; no page errors; no sideways scroll.
//  2. The browser has neither API (WebGL2RenderingContext and navigator.gpu removed before the page runs): index.html does
//     not run main.js (the static modulepreload hints still fetch three.js: counted, not failed); the deep link ?ll=51.4944,-0.0402 names Greenland Dock.
//  3. ?no3d=1&place=Greenland Dock: the deep link ?place=; the API: findPlaces, goTo a view and a name, setTime (the
//     address keeps the time), featuresAt One Canada Square (named once the building keys are in), describeView; the map
//     keys (arrow) move the view and rewrite the share hash; a link in the text moves the view without a reload.
//   python3 -m http.server 8231 --bind 127.0.0.1 &   (repository root)
//   node docklands/test/no3d-check.mjs [--base http://127.0.0.1:8231] [--only 1,2,3] [--shot /tmp/no3d.png]
// Skill: docklands-3d-page, "No 3D: text view, 2D map and page API (KR3.2)".
import { chromium } from '@playwright/test';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8231'), ONLY = arg('--only', '1,2,3').split(','), SHOT = arg('--shot', '');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fails = 0; const ok = (c, m, extra = '') => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${m}${extra ? ' :: ' + String(extra).slice(0, 300) : ''}`); };
const NO_GPU = () => { try { Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true }); } catch { /* */ } };
const NO_API = () => { try { Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true }); } catch { /* */ } delete globalThis.WebGL2RenderingContext; delete globalThis.WebGLRenderingContext; };
const browser = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--disable-webgl', '--disable-webgl2', '--disable-3d-apis', '--disable-gpu'] });

async function open(q, init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true }), page = await ctx.newPage(); page.setDefaultTimeout(60000);
  await page.addInitScript(init);
  const errors = [], three = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('request', r => { if (/three\.webgpu\.js|three\.core\.js/.test(r.url())) three.push(r.url()); });
  const t0 = Date.now(); await page.goto(`${BASE}/docklands/?${q}`);
  await page.waitForFunction(() => globalThis.docklands && globalThis.docklands.no3d && document.querySelector('#textView[data-ready="1"]:not([hidden])'), null, { timeout: 60000 });
  console.log(`-- ${q}: text view and API after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { ctx, page, errors, three };
}
const look = page => page.evaluate(() => {
  const cv = document.getElementById('map2dCanvas'), g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data, cols = new Set();
  for (let i = 0; i < d.length; i += 4 * 997) cols.add(d[i] >> 4 << 8 | d[i + 1] >> 4 << 4 | d[i + 2] >> 4);
  const boot = document.getElementById('boot');
  return { text: document.getElementById('tvText').textContent, links: document.querySelectorAll('#textView a[data-lat]').length, colours: cols.size, label: cv.getAttribute('aria-label'),
    boot: boot ? getComputedStyle(boot).display : 'none', scrollX: document.getElementById('textView').scrollWidth - document.getElementById('textView').clientWidth, gl: !!document.createElement('canvas').getContext('webgl2'), timing: docklands.timing };
});

if (ONLY.includes('1')) {
  const { ctx, page, errors } = await open('view=cw', NO_GPU), r = await look(page);
  ok(r.gl === false && /Canada Square|Canary Wharf|South Quay|Bank Street/.test(r.text) && r.links > 100, 'text view without WebGL names Canary Wharf places', `${r.links} links; ${r.text.slice(0, 200)}`);
  ok(r.colours >= 4 && /2D map, north up/.test(r.label), '2D map drawn, with a text label', `${r.colours} colours; ${r.label}; timing ${JSON.stringify(r.timing)}`);
  ok(r.boot === 'none', 'the "Starting the 3D view" cover is gone', r.boot);
  ok(r.scrollX <= 0, 'no sideways scroll at 390 px', r.scrollX);
  if (SHOT) await page.screenshot({ path: SHOT });
  ok(errors.length === 0, 'no page errors (renderer fails)', errors.join(' | '));
  await ctx.close();
}
if (ONLY.includes('2')) {
  const { ctx, page, errors, three } = await open('ll=51.4944,-0.0402', NO_API), r = await look(page);
  const ran = await page.evaluate(() => !!document.querySelector('script[src="main.js"]') || !!globalThis.__docklands3);
  ok(!ran, 'main.js does not run when the browser has neither API', ran);
  console.log(`info three.js requests (the static modulepreload hints of index.html): ${three.length}`);
  ok(/Greenland Dock/.test(r.text), 'deep link ?ll= names Greenland Dock', r.text.slice(0, 200));
  ok(errors.length === 0, 'no page errors (no API)', errors.join(' | '));
  await ctx.close();
}
if (ONLY.includes('3')) {
  const { ctx, page, errors } = await open('no3d=1&place=' + encodeURIComponent('Greenland Dock'), NO_GPU);
  await page.waitForFunction(() => /c=/.test(location.hash));
  const r = await page.evaluate(async () => {
    const d = docklands, o = {};
    o.placeText = document.getElementById('tvText').textContent; o.placeHash = location.hash;
    o.find = await d.findPlaces('mudchute', 3);
    o.view = await d.goTo('cw'); o.goName = await d.goTo('Mudchute Park and Farm');
    o.time = await d.setTime('2026-10-11T22:00'); o.timeHash = location.hash; o.text = document.getElementById('tvText').textContent;
    o.keys = await d.keys; o.f = await d.featuresAt(-0.01952, 51.504938); o.desc = await d.describeView({ maxItems: 4 });
    o.tools = d.tools.map(t => t.name); o.layers = d.listLayers();
    return o;
  });
  ok(/Greenland Dock/.test(r.placeText) && /c=/.test(r.placeHash), 'deep link ?place=Greenland Dock', r.placeText.slice(0, 160));
  ok(r.find[0] && /Mudchute/.test(r.find[0].name), 'findPlaces', JSON.stringify(r.find[0]));
  ok(r.goName.found && r.goName.found.name === 'Mudchute Park and Farm' && /Mudchute/.test(r.text), 'goTo a name moves the view and the text', r.text.slice(0, 120));
  ok(r.time.night === true && /t=2026-10-11T22(%3A|:)00/.test(r.timeHash) && /October 11, 2026 at 22:00/.test(r.text), 'setTime: night, in the address and the text', r.timeHash);
  ok(r.keys === true && /One Canada Square/.test(r.f.text), 'featuresAt One Canada Square (named from the registry index)', r.f.text);
  ok(r.desc.mode === 'no3d' && r.desc.in_view && r.desc.text.length > 50, 'describeView', r.desc.text.slice(0, 120));
  ok(r.tools.length === 10 && r.tools.includes('set_script_preference') && r.layers[0].id === 'map2d', 'tools and layers', r.tools.join(' '));
  // the map keys: an arrow moves the view; the share hash follows after the move settles
  const h0 = await page.evaluate(() => location.hash);
  await page.focus('#map2dCanvas'); await page.keyboard.press('ArrowRight'); await page.waitForFunction(h => location.hash !== h, h0, { timeout: 5000 }).catch(() => {});
  const h1 = await page.evaluate(() => location.hash);
  ok(h1 !== h0 && /c=/.test(h1), 'arrow key on the map moves the view (share hash)', `${h0} -> ${h1}`);
  // a link in the text view: no reload, the view moves
  await page.evaluate(() => { globalThis.__noReload = 1; });
  await page.click('#textView a[data-view="greenlanddock"]');
  await page.waitForFunction(() => /Greenland/.test(document.getElementById('tvText').textContent), null, { timeout: 5000 }).catch(() => {});
  const lk = await page.evaluate(() => ({ same: globalThis.__noReload === 1, text: document.getElementById('tvText').textContent }));
  ok(lk.same && /Greenland/.test(lk.text), 'a view link in the text moves the view without a reload', lk.text.slice(0, 120));
  ok(errors.length === 0, 'no page errors (?no3d=1)', errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
