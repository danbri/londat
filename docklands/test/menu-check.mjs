// Headless check of the menu (menu.js) and the time wheels (carousel.js) of the Three.js port: at 390 and 1280 px it
// opens the drawer, shows each tab (screenshot each), checks that every item of the "Menu map" in docklands/README.md is
// reachable by its click path (tab, then the control is visible), closes the drawer by Escape, the cross, the dimmed map
// (phone) and a swipe left, and drags each wheel (the clock changes; the strip wraps). Run from the repository root with
// a server on the root:
//   python3 -m http.server 8283 --bind 127.0.0.1 &
//   node docklands/test/menu-check.mjs [--base http://127.0.0.1:8283] [--out dir] [--webgpu] [--query 'layers=planes,wind']
// --query adds to the page URL (a layer subset is faster; Menu map items of layers not loaded are then reported missing).
// Also: at 1280 px the open drawer leaves the time wheels whole and usable (they move right of it), and the bottom-left
// notes (aircraft #adsbCredit, water #surfNote) do not overlap, stay clear of the right-hand buttons and, at 390 px, the
// aircraft note folds to two lines.
// Skill: docklands-3d-page, "Three.js port".
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8283'), OUT = arg('--out', 'docklands/test/out/menu'), WEBGPU = process.argv.includes('--webgpu'), QUERY = arg('--query', '');
mkdirSync(OUT, { recursive: true });
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });

// the Menu map: [tab, selector or text of the control]; a text is matched inside the pane (label, heading or button)
const MAP = [
  ['Go', 'text=Show the walking network'], ['Time', 'text=Constellation lines'], ['Time', 'text=Star names and Messier objects (those the sky shows)'], ['Time', 'text=Sky as from a dark site'], ['Time', 'text=London City Airport approach paths'], ['Time', 'text=Sun and moon lines on the map'], ['Time', '#skxVp'], ['About', '#liveBox'], ['About', '#liveDirect'], ['About', '#liveCams'], ['Layers', '#camsLayer'], ['About', '#ugBox'], ['Layers', 'text=Station, district and dock names'],
  ['Views', '[data-view=cw]'], ['Views', '[data-view=area]'], ['Views', '[data-view=under]'], ['Views', '[data-view=plan]'],
  ['Views', '[data-view=rotherhithe]'], ['Views', '[data-view=greenland]'], ['Views', '[data-view=pier]'], ['Views', '[data-view=greenlandday]'], ['Views', '[data-view=plane]'], ['Views', '#shareBtn'], ['Views', '#glLink'],
  ['Look', '#styleProxy'], ['Look', '#look'], ['Look', '#facades'], ['Look', '#ground'], ['Look', 'text=Colour buildings by'], ['Look', 'text=Water mirror (reflections)'], ['Look', 'text=Gaussian splats'], ['Look', 'text=Music'], ['Look', 'text=Windows'], ['Look', '#vz3'],
  ['Layers', '#showLabels'], ['Layers', '#showRoads'], ['Layers', 'text=Trees'], ['Layers', 'text=Hills of London'], ['Layers', 'text=Skyline by year'], ['Layers', 'text=Night lights (aviation, riverside lamps)'], ['Layers', 'text=Crown halo colour by date'],
  ['Layers', 'text=Floors (see-through buildings)'], ['Layers', 'text=Below ground'], ['Layers', 'text=Tunnels (modelled levels)'], ['Layers', 'text=Depth gauge (right edge)'], ['Layers', 'text=Station models'],
  ['Layers', 'text=Flood walls (EA, to crest level)'], ['Layers', 'text=Riverbed (UKHO soundings)'], ['Layers', 'text=River'], ['Layers', 'text=Piers, pontoons and berthed vessels'],
  ['Layers', 'text=Ships (AIS), live'], ['Layers', 'text=Aircraft (recorded'], ['Layers', 'text=Live aircraft (adsb.lol, ODbL)'], ['Layers', 'text=Birds and foxes (simulated from open records)'], ['Layers', 'text=Hire bike docks'], ['Layers', 'text=My KML'],
  ['Layers', 'text=Banks and finance'], ['Layers', 'text=Charities'], ['Layers', 'text=Heritage records'], ['Layers', 'text=Quality issues'], ['Layers', 'text=Crime, latest month (live)'],
  ['Go', '#goSearch'], ['Go', '#rFrom'], ['Go', '#rTo'], ['Go', '#rStepFree'], ['Go', '#rGo'], ['Go', '#droneBtn'], ['Go', '#goLocate'], ['Go', '#goXr'],
  ['Time', '#hour'], ['Time', '#tNow'], ['Time', '#tNight'], ['Time', '#wheelsChk'], ['Time', '#skyNote'], ['Time', 'text=Tide'], ['Time', 'text=Weather (cloud, haze, rain) for the clock time'], ['Time', 'text=Wind from Open-Meteo for the clock time (asks api.open-meteo.com)'], ['Time', 'text=Floating debris (Thames)'],
  ['About', '#shadows'], ['About', '#bloom'], ['About', '#animate'], ['About', '#backend'], ['About', 'text=Plotter'], ['About', '#creditsH'],
];
let failed = 0; const fail = m => { failed++; console.log('FAIL ' + m); };
for (const [w, h, dpr] of [[390, 844, 2], [1280, 800, 1]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: w < 900 }), errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(`${BASE}/docklands/?view=cw&t=2026-10-09T15:00${WEBGPU ? '' : '&webgl'}&animate=0${QUERY ? '&' + QUERY : ''}`);
  await page.waitForFunction(() => globalThis.__docklands3 && globalThis.__docklands3.ready, null, { timeout: 240000 });
  await page.waitForTimeout(3000);
  const tag = `${w}x${h}`;
  // the drawer: each tab
  for (const tab of ['Views', 'Look', 'Layers', 'Go', 'Time', 'About']) {
    if (await page.locator('#drawer').isHidden()) await page.click('#menu');
    await page.click(`#dtabs >> text=${tab}`);
    await page.screenshot({ path: `${OUT}/${tag}-${tab}.png`, timeout: 180000 });
  }
  // every item of the Menu map: open the tab, find the control, scroll it into view, check it is visible and enabled or a section
  // (one evaluate: in software rendering each Playwright click waits for a slow frame) a click on the tab, then the control
  // is found in the open pane, scrolled into view and must have a box inside the drawer and be visible
  const res = await page.evaluate(MAP => MAP.map(([tab, sel]) => {
    const d = document.getElementById('drawer'); if (d.hidden) document.getElementById('menu').click();
    [...document.querySelectorAll('#dtabs [data-pane]')].find(b => b.textContent === tab).click();
    const pane = document.querySelector('#drawer .pane.on');
    let el = null;
    if (sel.startsWith('text=')) { const t = sel.slice(5); el = [...pane.querySelectorAll('label,h3,.gt,button,p,span')].find(e => e.textContent.trim() === t || (e.tagName === 'LABEL' && e.textContent.trim().startsWith(t))); }
    else el = pane.querySelector(sel);
    if (!el) return `${tab} > ${sel}: not found`;
    for (let x = el.closest('details:not([open])'); x; x = x.parentElement && x.parentElement.closest('details:not([open])')) x.open = true;   // a person opens a closed box first
    el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(), D = d.getBoundingClientRect();
    if (!el.checkVisibility() || r.width === 0 || r.left < D.left - 1 || r.right > D.right + 1 || r.top < D.top || r.bottom > D.bottom) return `${tab} > ${sel}: not visible (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)})`;
    return null;
  }), MAP);
  for (const r of res) if (r) fail(`${tag} ${r}`);
  console.log(`${tag}: ${MAP.length} menu map items checked`);
  // the open drawer and the time wheels: on a wide screen the wheels are whole, right of the drawer, and a drag still works
  if (w >= 900) {
    if (await page.locator('#drawer').isHidden()) await page.click('#menu');
    const g = await page.evaluate(() => { const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) }; }; return { d: r('drawer'), wh: r('wheels'), day: r('wDay') }; });
    if (g.wh.l < g.d.r || g.wh.r > w || g.day.w < 200) fail(`${tag} drawer open: wheels ${g.wh.l}-${g.wh.r} px, drawer to ${g.d.r} px, day strip ${g.day.w} px wide`);
    else console.log(`${tag}: drawer open (to ${g.d.r} px): wheels ${g.wh.l}-${g.wh.r} px, day strip ${g.day.w} px wide`);
    const c0 = await page.evaluate(() => __docklands3.clock), b = await page.locator('#wDay').boundingBox(), y = b.y + b.height / 2, x = b.x + b.width / 2;
    await page.mouse.move(x, y); await page.mouse.down(); for (let k = 1; k <= 8; k++) { await page.mouse.move(x - k * 15, y); await page.waitForTimeout(30); } await page.mouse.up(); await page.waitForTimeout(1500);
    const c1 = await page.evaluate(() => __docklands3.clock);
    if (c1 === c0 || (await page.locator('#drawer').isHidden())) fail(`${tag} drawer open: a drag on the day wheel ${c1 === c0 ? 'did not change the clock' : 'closed the drawer'}`); else console.log(`${tag}: drawer open: the day wheel drags (${Math.round((c1 - c0) / 60e3)} min)`);
    await page.screenshot({ path: `${OUT}/${tag}-drawer-wheels.png`, timeout: 180000 });
    await page.keyboard.press('Escape');
  }
  // the bottom-left notes: aircraft (when recorded or live aircraft show) and water surface
  { await page.waitForFunction(() => { const e = document.getElementById('adsbCredit'); return !e || !e.hidden; }, null, { timeout: 90000 }).catch(() => {});
    const n = await page.evaluate(() => { const box = id => { const e = document.getElementById(id); if (!e || e.hidden || !e.checkVisibility()) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, h: b.height }; };
      const a = box('adsbCredit'), s = box('surfNote'), l1 = document.querySelector('#adsbCredit .ln1'), l2 = document.querySelector('#adsbCredit .ln2');
      return { a, s, l1: l1 && l1.getBoundingClientRect().top, l2: l2 && l2.getBoundingClientRect().top, l1h: l1 && l1.getBoundingClientRect().height, text: document.getElementById('adsbCredit')?.textContent };
    });
    const R = v => v && `${Math.round(v.l)},${Math.round(v.t)} to ${Math.round(v.r)},${Math.round(v.b)}`;
    if (!n.a) console.log(`${tag}: no aircraft note shown (layer not loaded, or no recorded aircraft)`);
    else {
      if (n.a.r > w - 54) fail(`${tag} aircraft note reaches ${Math.round(n.a.r)} px (the right-hand buttons start at ${w - 54} px)`);
      if (n.s && !(n.a.t >= n.s.b - 0.5 || n.s.t >= n.a.b - 0.5 || n.a.l >= n.s.r || n.s.l >= n.a.r)) fail(`${tag} aircraft note ${R(n.a)} overlaps the water note ${R(n.s)}`);
      if (w < 600 && !(n.l2 > n.l1 && n.l1h < 20)) fail(`${tag} aircraft note does not fold to two lines (line tops ${n.l1}, ${n.l2}; first line ${n.l1h} px high)`);
      console.log(`${tag}: aircraft note ${R(n.a)} (${Math.round(n.a.h)} px high), water note ${n.s ? R(n.s) : 'not shown'}: "${n.text}"`);
    }
    await page.screenshot({ path: `${OUT}/${tag}-notes.png`, timeout: 180000 }); }
  // close: Escape, the cross, the dimmed map (phone only), a swipe left of more than 70 px
  const closeBy = async (name, fn) => { if (await page.locator('#drawer').isHidden()) await page.click('#menu'); await fn(); await page.waitForTimeout(100); if (!(await page.locator('#drawer').isHidden())) fail(`${tag} close by ${name}`); else console.log(`${tag}: closes by ${name}`); };
  await closeBy('Escape', () => page.keyboard.press('Escape'));
  await closeBy('the cross', () => page.click('#drawerX'));
  if (w < 900) await closeBy('the dimmed map', () => page.mouse.click(w - 15, h / 2));
  else { await page.click('#menu'); if (await page.locator('#scrim').isVisible()) fail(`${tag} the map is dimmed at ${w} px`); await page.keyboard.press('Escape'); }
  await closeBy('a swipe left', async () => { const b = await page.locator('#drawerBody').boundingBox(), y = b.y + 200, x = b.x + b.width - 30;
    await page.dispatchEvent('#drawerBody', 'pointerdown', { pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, pointerId: 7 });
    for (let k = 1; k <= 6; k++) await page.dispatchEvent('#drawerBody', 'pointermove', { pointerType: 'touch', isPrimary: true, clientX: x - k * 20, clientY: y, pointerId: 7 });
    await page.dispatchEvent('#drawerBody', 'pointerup', { pointerType: 'touch', isPrimary: true, clientX: x - 120, clientY: y, pointerId: 7 }); });
  if (w < 900) { await page.click('#menu'); await page.click('#dtabs >> text=Views'); await page.click('[data-view=area]'); await page.waitForTimeout(100); if (!(await page.locator('#drawer').isHidden())) fail(`${tag} a view button does not close the drawer`); else console.log(`${tag}: a view button closes the drawer`); }
  // the wheels: drag each; the clock changes; it wraps (day: same date, 23:xx -> 00:xx; year: Dec -> Jan, same year)
  const st = () => page.evaluate(() => ({ ...__docklands3.wheels.state, clock: __docklands3.clock, hash: location.hash }));
  const drag = async (sel, dx) => { const b = await page.locator(sel).boundingBox(), y = b.y + b.height / 2, x = b.x + b.width / 2;
    await page.mouse.move(x, y); await page.mouse.down(); for (let k = 1; k <= 10; k++) { await page.mouse.move(x + dx * k / 10, y); await page.waitForTimeout(30); } await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(1500); };
  const s0 = await st(); await drag('#wDay', -Math.round(w / 4)); const s1 = await st();
  if (s1.clock === s0.clock || s1.date !== s0.date) fail(`${tag} day wheel: ${s0.time} -> ${s1.time} (${s0.date} -> ${s1.date})`); else console.log(`${tag}: day wheel ${s0.date} ${s0.time} -> ${s1.date} ${s1.time}; hash t: ${/t=([^&]*)/.exec(s1.hash)?.[1]}`);
  await page.evaluate(() => __docklands3.setClockUser(__docklands3.fromLondon('2026-10-09T23:30')));
  await drag('#wDay', -Math.round(w / 3)); const s2 = await st();
  if (s2.date !== '2026-10-09' || !(s2.min < 23 * 60)) fail(`${tag} day wheel does not wrap: 23:30 -> ${s2.date} ${s2.time}`); else console.log(`${tag}: day wheel wraps 23:30 -> ${s2.date} ${s2.time}`);
  const y0 = await st(); await drag('#wYear', -Math.round(w / 4)); const y1 = await st();
  if (y1.date === y0.date) fail(`${tag} year wheel: ${y0.date} -> ${y1.date}`); else console.log(`${tag}: year wheel ${y0.date} -> ${y1.date} (time ${y1.time})`);
  await page.evaluate(() => __docklands3.setClockUser(__docklands3.fromLondon('2026-12-28T12:00')));
  await drag('#wYear', -Math.round(w / 2.2)); const y2 = await st();
  if (!/^2026-0[1-3]/.test(y2.date)) fail(`${tag} year wheel does not wrap: 28 Dec -> ${y2.date}`); else console.log(`${tag}: year wheel wraps 2026-12-28 -> ${y2.date}`);
  await page.waitForTimeout(6000);   // the tide range is filled in a few weeks at a time
  await page.screenshot({ path: `${OUT}/${tag}-wheels.png`, timeout: 180000 });
  await page.click('#wNow'); await page.waitForTimeout(500); const sn = await st();
  if (Math.abs(sn.clock - Date.now()) > 120000) fail(`${tag} Now: clock ${new Date(sn.clock).toISOString()}`); else console.log(`${tag}: Now -> ${sn.date} ${sn.time}`);
  await page.click('#wHide'); if (await page.locator('#wheels').isVisible()) fail(`${tag} the wheels do not hide`);
  await page.click('#menu'); await page.click('#dtabs >> text=Time'); await page.check('#wheelsChk'); if (!(await page.locator('#wheels').isVisible())) fail(`${tag} the wheels do not show again`); await page.keyboard.press('Escape');
  for (const e of errors.slice(0, 8)) fail(`${tag} ${e.slice(0, 300)}`);
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} failures` : 'all passed');
process.exit(failed ? 1 : 0);
