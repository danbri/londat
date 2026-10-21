// Headless check of the place-aware page clock (OKR KR1.2; docklands/clockzone.js, geo/zone.js): the time wheels, the
// clock label, getView, describeView and the WebMCP tools show the wall clock of the view's zone: London time at
// ?view=cw, Madrid time over León on the globe (?ll= the place), ?t= without an offset read in the start view's zone, the
// instant kept when the zone changes (León -> the model), setTimeZone / set_time_zone and ?tz=. No page errors.
// Screenshots of the wheels in --out (default docklands/test/out/zone/).
//   python3 -m http.server 8190 --bind 127.0.0.1 &      (from the repository root)
//   node docklands/test/zone-check.mjs [--base http://127.0.0.1:8190] [--sizes 390x844@2]
// Skill: docklands-sky, "Place-aware page clock".
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8190'), OUT = arg('--out', 'docklands/test/out/zone');
const SIZES = arg('--sizes', '390x844@2').split(',').map(s => { const m = /^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(s); return [+m[1], +m[2], +m[3]]; });
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ' · ' + detail : ''}`); };
const iso = t => new Date(t).toISOString().slice(0, 16) + 'Z';

async function open(w, h, dpr, query) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }), page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather|raw\.githubusercontent|api\.github\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(`${BASE}/docklands/?${query}&webgl&animate=0&weather=0&wheels=1`);
  await page.waitForFunction(() => !!(window.docklands && window.__docklands3?.wheels), null, { polling: 250 });
  return { ctx, page, errors };
}
const state = page => page.evaluate(() => { const D = __docklands3; D.wheels.draw(true); return { clock: D.clock, wheels: D.wheels.state, aria: document.getElementById('wDay').getAttribute('aria-valuetext'), label: document.getElementById('clock')?.textContent, zone: D.zone.describe(D.clock), mode: D.globe?.mode || 'model' }; });

for (const [w, h, dpr] of SIZES) {
  const tag = `${w}x${h}@${dpr}`;
  // 1. the model: London time; ?t= in the repeated hour of 25 October 2026 is the first (BST)
  { console.log(`--- ?view=cw ${tag}`);
    const { ctx, page, errors } = await open(w, h, dpr, 'view=cw&t=2026-10-25T01:30');
    const s = await state(page), v = await page.evaluate(() => docklands.getView());
    check(iso(s.clock) === '2026-10-25T00:30Z', '?t= read as London time (first 01:30, BST)', iso(s.clock));
    check(s.wheels.time_zone === 'Europe/London' && s.wheels.time === '01:30' && s.wheels.date === '2026-10-25', 'wheels show London time', JSON.stringify(s.wheels));
    check(/BST/.test(s.aria) && /BST \(UTC\+1\)/.test(s.wheels.label), 'wheel label and spoken value name BST', `${s.aria} | ${s.wheels.label}`);
    check(/01:30 BST/.test(s.label || ''), 'clock label', s.label);
    check(v.time.time_zone === 'Europe/London' && v.time.abbreviation === 'BST' && v.time.wall_clock === '2026-10-25T01:30' && v.time.source === 'region:docklands', 'getView().time', JSON.stringify(v.time));
    await page.screenshot({ path: `${OUT}/wheels-cw-${tag}.png`, clip: { x: 0, y: 0, width: w, height: 150 } });
    check(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
    await ctx.close(); }
  // 2. León on the globe: Madrid time; then the model again (the instant stays); the API
  { console.log(`--- León ?ll= ${tag}`);
    const { ctx, page, errors } = await open(w, h, dpr, 'll=42.59732,-5.56654,1500&ht=0,55&t=2026-10-12T12:00');
    await page.waitForFunction(() => __docklands3.globe?.mode === 'globe' && __docklands3.zone.tz === 'Europe/Madrid', null, { polling: 250 });
    await page.waitForTimeout(1500);
    const s = await state(page), v = await page.evaluate(() => docklands.getView()), d = await page.evaluate(() => docklands.describeView());
    check(iso(s.clock) === '2026-10-12T10:00Z', '?t= read as León (Madrid) time', iso(s.clock));
    check(s.wheels.time_zone === 'Europe/Madrid' && s.wheels.time === '12:00' && s.wheels.date === '2026-10-12', 'wheels show Madrid time over León', JSON.stringify(s.wheels));
    check(/CEST \(UTC\+2\)/.test(s.wheels.label) && /CEST/.test(s.aria), 'wheel label CEST (UTC+2)', `${s.aria} | ${s.wheels.label}`);
    check(/12:00 CEST/.test(s.label || ''), 'clock label', s.label);
    check(v.time.time_zone === 'Europe/Madrid' && v.time.source === 'region:leon' && !v.time.approximate && v.time.wall_clock === '2026-10-12T12:00', 'getView().time', JSON.stringify(v.time));
    check(/CEST/.test(d.text) && /Europe\/Madrid/.test(d.text), 'describeView text names the zone', d.text.slice(0, 200));
    await page.screenshot({ path: `${OUT}/wheels-leon-${tag}.png`, clip: { x: 0, y: 0, width: w, height: 150 } });
    // sunrise in León (later than London's by the clock: about 08:30 CEST in mid October)
    const sun = await page.evaluate(() => { const S = __docklands3.wheels.sunDay(__docklands3.wheels.state.date); return { rise: S.rise, set: S.set }; });
    check(sun.rise > 8 * 60 && sun.rise < 9 * 60 && sun.set > 19 * 60 && sun.set < 20 * 60, 'León sunrise and sunset on the wheel (local clock)', `${(sun.rise / 60).toFixed(2)} h, ${(sun.set / 60).toFixed(2)} h`);
    // set_time_zone / setTimeZone, set_time in a named zone, get_time_zone
    const r = await page.evaluate(async () => { const out = {}; out.utc = await docklands.callTool('set_time_zone', { time_zone: 'UTC' }); __docklands3.wheels.draw(true); out.wUtc = __docklands3.wheels.state.time;
      out.auto = docklands.setTimeZone('auto'); __docklands3.wheels.draw(true); out.wAuto = __docklands3.wheels.state.time;
      out.set = await docklands.callTool('set_time', { time: '2026-10-25T02:30', time_zone: 'Europe/Sarajevo' }); out.clock = __docklands3.clock;
      out.get = await docklands.callTool('get_time_zone', {}); out.tools = docklands.tools.map(t => t.name); return out; });
    check(r.utc.time_zone === 'UTC' && r.wUtc === '10:00', 'set_time_zone UTC: the wheels show 10:00, the instant kept', JSON.stringify([r.utc.wall_clock, r.wUtc]));
    check(r.auto.time_zone === 'Europe/Madrid' && r.wAuto === '12:00', 'setTimeZone("auto"): follows the view again', r.auto.time_zone);
    check(iso(r.clock) === '2026-10-25T00:30Z' && r.get.time_zone === 'Europe/Madrid', 'set_time with time_zone (Sarajevo, repeated hour: first)', `${iso(r.clock)} ${r.get.wall_clock} ${r.get.abbreviation}`);
    check(r.tools.includes('get_time_zone') && r.tools.includes('set_time_zone'), 'WebMCP tools listed', r.tools.join(','));
    // back to the model: London, the instant unchanged
    const t0 = await page.evaluate(() => __docklands3.clock);
    await page.evaluate(() => __docklands3.setView('cw'));
    await page.waitForFunction(() => __docklands3.zone.tz === 'Europe/London', null, { polling: 250, timeout: 60000 });
    const m = await state(page);
    check(m.clock === t0 && m.wheels.time_zone === 'Europe/London' && m.wheels.time === '01:30', 'model view: London time, same instant', `${iso(m.clock)} ${m.wheels.time} ${m.wheels.label}`);
    check(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
    await ctx.close(); }
  // 3. ?tz= fixes the zone in the model
  { console.log(`--- ?tz=Europe/Sarajevo&view=cw ${tag}`);
    const { ctx, page, errors } = await open(w, h, dpr, 'tz=Europe/Sarajevo&view=cw&t=2026-07-01T12:00');
    await page.waitForTimeout(1200);
    const s = await state(page);
    check(iso(s.clock) === '2026-07-01T10:00Z' && s.wheels.time === '12:00' && s.zone.fixed && s.zone.time_zone === 'Europe/Sarajevo', '?tz= in the model: Sarajevo time', `${iso(s.clock)} ${s.wheels.time} ${s.wheels.label}`);
    check(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
    await ctx.close(); }
}
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
