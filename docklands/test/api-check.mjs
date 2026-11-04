// Check of the page API, WebMCP tools and non-visual access of the Three.js port (docklands/api.js, describe.js,
// textview.js): headless Chromium (WebGL 2 in SwiftShader), a few layers so a run takes minutes, not tens of minutes.
//  1. ?view=cw: no page errors; window.docklands.version; WebMCP (a mock document.modelContext, installed before the
//     page loads, gets every tool, and a tool call through it answers); getView, shareLink, describeView names Canary
//     Wharf landmarks; featuresAt (One Canada Square by WGS84 point; the screen centre); findPlaces; goTo a name and a
//     point; setTime; listLayers / setLayer; the live region speaks when the switch is on and after the view settles;
//     the arrow keys and + move the camera with the map focused; V speaks; T opens the text view.
//  2. ?view=greenlanddock: describeView names Greenland Dock.
//  4. The frame path (frame-bridge.js): test/fixtures/frame-host.html on another origin holds the page in a frame;
//     the parent gets the tool list, calls get_view and go_to, an unknown tool is an error answer, webmcp.list lists
//     again, and a call from another frame of the host is not answered.
//  3. WebGL disabled (--disable-webgl --disable-3d-apis): ?view=greenlanddock opens the text view by itself, with the
//     description and the place lists, no page errors; ?ll=51.4944,-0.0402&text=1 too.
//   python3 -m http.server 8205 --bind 127.0.0.1 &   (repository root)
//   node docklands/test/api-check.mjs [--base http://127.0.0.1:8205] [--only 1,2,3,4] [--layers a,b]
// Skill: docklands-3d-page, "Three.js port: page API, WebMCP and non-visual access (2026-10-11)".
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
// the version the page must report, read from api.js as text (api.js imports three.js, so it is not imported here)
const API_VERSION = /export const API_VERSION = '([^']+)'/.exec(readFileSync(new URL('../api.js', import.meta.url), 'utf8'))[1];

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8205'), ONLY = (arg('--only', '1,2,3,4')).split(',');
const LAYERS = arg('--layers', 'placenames,registry,keys,search,ships,planes,under');
const EXE = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', GL = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let fails = 0; const ok = (c, m, extra = '') => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${m}${extra ? ' :: ' + String(extra).slice(0, 300) : ''}`); };
const watch = page => { const e = []; page.on('pageerror', x => e.push('pageerror: ' + x.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) e.push('console: ' + m.text()); }); return e; };
// a WebMCP host as the explainer describes it (document.modelContext.registerTool(tool, { signal })); records the tools
const MOCK = () => { const tools = new Map(); globalThis.__mcTools = tools; document.modelContext = { registerTool(t, o) { tools.set(t.name, t); o?.signal?.addEventListener('abort', () => tools.delete(t.name)); } }; };

async function open(browser, q, { mock = false, viewport = { width: 1280, height: 800 } } = {}) {
  const ctx = await browser.newContext({ viewport }), page = await ctx.newPage(); page.setDefaultTimeout(180000);
  if (mock) await page.addInitScript(MOCK);
  const errors = watch(page), t0 = Date.now();
  await page.goto(`${BASE}/docklands/?${q}`);
  return { ctx, page, errors, t0 };
}
const ready = page => page.waitForFunction(() => globalThis.docklands && globalThis.__docklands3?.ready, null, { timeout: 300000 }).then(() => page.evaluate(() => docklands.ready));

if (ONLY.includes('1') || ONLY.includes('2')) {
  const browser = await chromium.launch({ headless: true, executablePath: EXE, args: GL });
  if (ONLY.includes('1')) {
    const { ctx, page, errors, t0 } = await open(browser, `view=cw&layers=${LAYERS}&weather=0&webgl&animate=0`, { mock: true });
    await ready(page); console.log(`-- 1. view=cw: API ready after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const r = await page.evaluate(async () => {
      const d = docklands, o = {};
      o.version = d.version; o.nTools = d.tools.length; o.webmcp = { ...d.webmcp, controller: undefined }; o.mock = [...globalThis.__mcTools.keys()];
      const mt = globalThis.__mcTools.get('describe_view'); o.mockCall = mt ? await mt.execute({ maxItems: 3 }) : null;
      o.view = d.getView(); o.share = d.shareLink();
      o.desc = await d.describeView();
      o.f1 = await d.featuresAt(-0.01952, 51.504938); o.fc = await d.featuresAt();
      o.find = await d.findPlaces('greenland', 5);
      o.views = d.listViews().length;
      o.goName = await d.goTo('Mudchute Park and Farm'); o.goPt = await d.goTo({ lon: -0.0402, lat: 51.4944, range_m: 800, heading_deg: 90, pitch_deg: 30 });
      // outside the model the globe takes the view (2026-10-13; before, an error), then a view id brings the model back
      try { const g = await d.goTo({ lon: 2.35, lat: 48.85, alt_m: 1500000 }); o.outside = g.mode + ' ' + g.target.lat.toFixed(2); await d.goTo({ view: 'cw' }); o.back = __docklands3.globe ? __docklands3.globe.mode : 'model'; } catch (e) { o.outside = e.message; }
      o.time = d.setTime('2026-10-11T22:00'); o.night = __docklands3.night;
      o.layers = d.listLayers(); o.roadsOff = d.setLayer('roads', false); o.roadsBox = document.getElementById('showRoads').checked; o.pnOff = d.setLayer('placenames', false); o.pnOn = d.setLayer('placenames', true);
      try { d.setLayer('nosuch', true); o.badLayer = 'no error'; } catch (e) { o.badLayer = e.message; }
      return o;
    });
    ok(r.version === API_VERSION, `window.docklands.version is ${API_VERSION} (api.js)`, r.version);
    ok(r.nTools >= 18 && r.mock.length === r.nTools && r.webmcp.registered.length === r.nTools && r.webmcp.api === 'document.modelContext', `WebMCP: every tool of window.docklands.tools (${r.nTools}) registered on document.modelContext`, r.mock.join(' '));
    ok(r.mockCall && /One Canada Square/.test(r.mockCall.content[0].text), 'WebMCP: describe_view called through the host answers', r.mockCall && r.mockCall.content[0].text.slice(0, 160));
    ok(Math.abs(r.view.eye.lat - 51.495) < 0.01 && Math.abs(r.view.heading_deg - 321.5) < 2 && r.view.fov_deg.vertical > 40 && r.view.time.time_zone, 'getView: eye, heading, field, time zone', JSON.stringify({ eye: r.view.eye, h: r.view.heading_deg, f: r.view.fov_deg, t: r.view.time }));
    ok(/#v=1&c=/.test(r.share), 'shareLink has the share hash', r.share);
    ok(/One Canada Square/.test(r.desc.text) && r.desc.in_view.buildings.length >= 3 && r.desc.in_view.water.length >= 2, 'describeView at view=cw names Canary Wharf landmarks', r.desc.text);
    ok(r.f1.building && r.f1.building.name === 'One Canada Square' && /^way\//.test(r.f1.building.osm) && r.f1.building.registry && r.f1.building.registry.occupant_names?.length > 0, 'featuresAt(One Canada Square)', r.f1.text + ' occupants: ' + (r.f1.building?.registry?.occupant_names || []).slice(0, 4).join(', '));
    ok(r.fc && r.fc.text && (r.fc.building || r.fc.water || r.fc.nearest?.length), 'featuresAt() at the screen centre', r.fc.text);
    ok(r.find.some(p => p.name === 'Greenland Dock'), 'findPlaces("greenland")', r.find.map(p => p.name).join('; '));
    ok(r.views >= 16, 'listViews', r.views);
    ok(r.goName.found && r.goName.found.name === 'Mudchute Park and Farm' && Math.abs(r.goName.target.lat - 51.491) < 0.01, 'goTo(place name)', JSON.stringify(r.goName.target));
    ok(Math.abs(r.goPt.target.lat - 51.4944) < 1e-3 && Math.abs(r.goPt.target.lon + 0.0402) < 1e-3 && Math.abs(r.goPt.heading_deg - 90) < 1 && Math.abs(r.goPt.pitch_deg + 30) < 1 && Math.abs(r.goPt.range_m - 800) < 2, 'goTo({lon, lat, range, true heading, pitch})', JSON.stringify({ t: r.goPt.target, h: r.goPt.heading_deg, p: r.goPt.pitch_deg, r: r.goPt.range_m }));
    ok(/^globe 48\.85/.test(r.outside) && r.back === 'model', 'goTo outside the model: the globe, then view cw: the model', r.outside + ' -> ' + r.back);
    ok(/22:00/.test(r.time.time.local) && r.night === true, 'setTime(wall-clock time of the place)', r.time.time.local);
    ok(r.layers.some(l => l.id === 'placenames') && r.roadsOff.on === false && r.roadsBox === false && r.pnOff.on === false && r.pnOn.on === true, 'listLayers / setLayer', r.layers.map(l => l.id + ':' + l.on).join(' '));
    ok(/No layer/.test(r.badLayer), 'setLayer(unknown) says so', r.badLayer);

    // the live region: switch on, wait for a settled view to be spoken
    await page.evaluate(() => { docklands.describing = true; });
    const spoke = await page.waitForFunction(() => (document.getElementById('a11yLive').textContent || '').length > 40, null, { timeout: 30000 }).then(() => true).catch(() => false);
    const said1 = await page.evaluate(() => document.getElementById('a11yLive').textContent);
    ok(spoke, 'live region speaks when the switch is on', said1);
    // keyboard: focus the map, arrows and + move the camera; the view settles and is spoken again
    const c0 = await page.evaluate(() => __docklands3.camState());
    await page.focus('#view canvas');
    for (const k of ['ArrowUp', 'ArrowUp', 'ArrowLeft', '+', '+']) { await page.keyboard.press(k); await page.waitForTimeout(150); }
    const c1 = await page.evaluate(() => __docklands3.camState());
    ok(Math.hypot(c1.tx - c0.tx, c1.tz - c0.tz) > 1 && c1.dist < c0.dist, 'keyboard: arrows pan, + zooms in', `moved ${Math.hypot(c1.tx - c0.tx, c1.tz - c0.tz).toFixed(1)} m, dist ${c0.dist.toFixed(0)} -> ${c1.dist.toFixed(0)}`);
    const n0 = await page.evaluate(() => docklands.spoken.length);
    const spoke2 = await page.waitForFunction(n => docklands.spoken.length > n, n0, { timeout: 30000 }).then(() => true).catch(() => false);
    ok(spoke2, 'live region speaks again after the keyboard move settles', await page.evaluate(() => docklands.spoken.at(-1)?.text));
    const n1 = await page.evaluate(() => docklands.spoken.length);
    await page.keyboard.press('v');
    ok(await page.waitForFunction(n => docklands.spoken.length > n, n1, { timeout: 30000 }).then(() => true).catch(() => false), 'key V speaks the view');
    // focus order: Menu first; the Menu button moves the focus to the selected tab; the arrow keys change tabs
    const order = await page.evaluate(() => { const f = [...document.querySelectorAll('button,a[href],input,select,[tabindex]')].filter(e => e.tabIndex >= 0 && e.getClientRects().length && !e.closest("[hidden]")); return f.slice(0, 4).map(e => e.id || e.tagName); });
    ok(order[0] === 'menu', 'Tab order starts with the Menu button', order.join(' '));
    await page.evaluate(() => document.getElementById('menu').focus()); await page.keyboard.press('Enter'); await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'tab', null, { timeout: 20000 }).catch(() => {});
    const tabFocus = await page.evaluate(() => document.activeElement?.getAttribute('role')); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(800);
    const tab2 = await page.evaluate(() => ({ id: document.activeElement?.id, sel: document.activeElement?.getAttribute('aria-selected') }));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const back = await page.evaluate(() => document.activeElement?.id);
    ok(tabFocus === 'tab' && tab2.sel === 'true' && back === 'menu', 'drawer: focus to the tab, arrows change tabs, Escape returns to Menu', JSON.stringify({ tabFocus, tab2, back }));
    // T: the text view
    await page.focus('#view canvas'); await page.keyboard.press('t');
    const tv = await page.waitForFunction(() => document.querySelector('#textView[data-ready="1"]:not([hidden])'), null, { timeout: 30000 }).then(() => true).catch(() => false);
    const tvText = tv ? await page.evaluate(() => ({ t: document.getElementById('tvText').textContent, links: document.querySelectorAll('#textView a[data-lat]').length, focus: document.activeElement?.id })) : null;
    ok(tv && tvText.links > 100 && tvText.focus === 'tvH', 'key T opens the text view (focus on its heading)', tvText && `${tvText.links} place links; ${tvText.t.slice(0, 120)}`);
    await page.keyboard.press('Escape');
    ok(await page.evaluate(() => document.getElementById('textView').hidden), 'Escape closes the text view');
    ok(errors.length === 0, 'no page errors (view=cw)', errors.join(' | '));
    await ctx.close();
  }
  if (ONLY.includes('2')) {
    const { ctx, page, errors, t0 } = await open(browser, `view=greenlanddock&layers=${LAYERS}&weather=0&webgl&animate=0`);
    await ready(page); console.log(`-- 2. view=greenlanddock: API ready after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const d = await page.evaluate(() => docklands.describeView());
    ok(/Greenland Dock/.test(d.text) && d.in_view.water.some(w => w.name === 'Greenland Dock'), 'describeView at view=greenlanddock names Greenland Dock', d.text);
    ok(errors.length === 0, 'no page errors (view=greenlanddock)', errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
}
if (ONLY.includes('3')) {
  const browser = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--disable-webgl', '--disable-webgl2', '--disable-3d-apis', '--disable-gpu'] });
  for (const q of ['view=greenlanddock', 'll=51.4944,-0.0402&text=1']) {
    const { ctx, page, errors, t0 } = await open(browser, q);
    const tv = await page.waitForFunction(() => document.querySelector('#textView[data-ready="1"]:not([hidden])'), null, { timeout: 60000 }).then(() => true).catch(() => false);
    const r = tv ? await page.evaluate(() => ({ t: document.getElementById('tvText').textContent, links: document.querySelectorAll('#textView a[data-lat]').length, gl: !!document.createElement('canvas').getContext('webgl2'), state: globalThis.__docklandsText.state() })) : null;
    console.log(`-- 3. no WebGL, ${q}: text view after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    ok(tv && r.gl === false && r.state.no3d && /Greenland Dock/.test(r.t) && r.links > 100, `text view without WebGL (${q})`, r && `webgl2 ${r.gl}; ${r.links} links; ${r.t}`);
    ok(errors.length === 0, `no page errors without WebGL (${q})`, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
}
if (ONLY.includes('4')) {
  // The frame path (frame-bridge.js): a host page on another origin holds the page in a frame, as the foafos shell does,
  // and a second frame in that host tries to call a tool. Only the parent is answered. The host is test/fixtures/
  // frame-host.html at 127.0.0.1 and the page is at localhost: two origins, both local (Chrome refuses a public page
  // that frames a local one).
  const browser = await chromium.launch({ headless: true, executablePath: EXE, args: GL });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = watch(page), t0 = Date.now();
  const src = `${BASE.replace('127.0.0.1', 'localhost')}/docklands/?view=cw&layers=${LAYERS}&weather=0&webgl&animate=0`;
  await page.goto(`${BASE}/docklands/test/fixtures/frame-host.html?src=${encodeURIComponent(src)}`);
  await page.waitForFunction(() => globalThis.__tools, null, { timeout: 300000 });
  console.log(`-- 4. frame path: tool list after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const r = await page.evaluate(async () => {
    const t = __tools, o = { api: t.api, n: t.tools.length, names: t.tools.map(x => x.name), schema: !!t.tools.find(x => x.name === 'go_to')?.inputSchema?.properties, ro: t.tools.find(x => x.name === 'get_view')?.readOnly };
    o.view = await call('get_view', {}); o.go = await call('go_to', { view: 'greenlanddock' }); o.view2 = await call('get_view', {});
    o.bad = await call('no_such_tool', {});
    const before = __msgs.filter(m => m.type === 'webmcp.tools').length; D().postMessage({ type: 'webmcp.list' }, '*');
    await new Promise(res => setTimeout(res, 1500)); o.relisted = __msgs.filter(m => m.type === 'webmcp.tools').length > before;
    document.getElementById('f').contentWindow.postMessage({ go: 1 }, '*'); await new Promise(res => setTimeout(res, 3000));
    o.foreign = __msgs.some(m => m.id === 'foreign'); o.view3 = await call('get_view', {});
    return o; });
  ok(r.n >= 20 && r.names.includes('go_to') && r.names.includes('describe_view') && r.schema && r.ro === true, `the parent gets the tool list (${r.n} tools, api ${r.api})`, r.names.join(' '));
  ok(r.view.ok && r.view.value && typeof r.view.value === 'object', 'get_view through the frame answers', JSON.stringify(r.view).slice(0, 200));
  ok(r.go.ok && r.view2.ok && JSON.stringify(r.view2.value) !== JSON.stringify(r.view.value), 'go_to through the frame moves the view', JSON.stringify(r.go).slice(0, 200));
  ok(r.bad.ok === false && /unknown tool/.test(r.bad.error), 'an unknown tool is an error answer, not a throw', JSON.stringify(r.bad));
  ok(r.relisted, 'webmcp.list sends the tool list again');
  ok(!r.foreign && r.view3.ok, 'a call from another frame of the host is not answered');
  ok(errors.length === 0, 'no page errors (frame path)', errors.join(' | '));
  await ctx.close(); await browser.close();
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
