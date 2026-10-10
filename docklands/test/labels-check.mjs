// Headless check of the 2026-10-10 changes to the Three.js port (owner, iPhone: "Nav is good but too much clutter / Cam
// label ignores depth / buildings in front / Drone and icon and day/night toggle belong in bamburger menu, and label toggle
// should hide plane labels, cam labels. Also wind and other metadataand credits hidden when labels off"):
//  (a) no Drone, Below ground or Day or night button on the map; Menu > Look > Night, Menu > Go > Move > Drone and Below
//      ground work and show their state (aria-pressed); the controls left on the map do not overlap (390 x 844, 1280 x 800);
//  (b) the Labels button off: no label, note or credit on the map (the credits stay in Menu > About with the OSM link);
//      the choice is kept after a reload; on again: they come back;
//  (c) occlusion (occlude.js): in a view from 400 m over the river south of Canary Wharf the TfL camera "Limehouse Tnl
//      Aspen Way" is behind One Canada Square and its label is hidden, "ASPEN WAY - UPPER BANK STREET" is in clear view
//      and its label shows; every tested label is compared with an exact three.js ray cast against the building tiles
//      (a hit on the building whose footprint holds the anchor is the label's own structure, as occlude.js); cost.
// Run from the repository root with a server on the root:
//   python3 -m http.server 8188 --bind 127.0.0.1 &
//   node docklands/test/labels-check.mjs [--base http://127.0.0.1:8188] [--out docklands/test/out] [--webgpu]
// Skill: docklands-3d-page, "Three.js port: less clutter, labels switch, label occlusion (2026-10-10)".
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8188'), OUT = arg('--out', 'docklands/test/out'), WEBGPU = process.argv.includes('--webgpu');
mkdirSync(OUT, { recursive: true });
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
let ok = true; const errors = [];
const check = (c, msg) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`); if (!c) ok = false; };
// the test view (c): target One Canada Square at 100 m OD, eye at (125, 400, 599) model metres
const VIEW = '#v=1&c=-35,-10,100,698,0.2569,0.4446';
const Q = `view=cw${WEBGPU ? '' : '&webgl'}&animate=0&ships=0&wildlife=0`;   // aircraft stay on (their labels); ships and wildlife move every frame

async function open(w, h, touch, hash = '') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch }), page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${w}: pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${w}: console: ${m.text()}`); });
  await page.goto(`${BASE}/docklands/?${Q}${hash}`, { timeout: 400000 });
  await ready(page); return page;
}
const ready = page => page.waitForFunction(() => globalThis.__docklands3?.ready && __docklands3.occ().ready && document.querySelector('#goMove #droneBtn') && document.getElementById('labelsBtn'), null, { timeout: 400000 }).then(() => page.waitForTimeout(4000));
// clicks by DOM (one evaluate): a Playwright click waits for a free frame, and a software frame of the full page takes seconds
const click = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error(s + ' not found'); e.click(); }, sel);
const frames = async (page, ms = 4000) => { await page.evaluate(() => __docklands3.draw()); await page.waitForTimeout(ms); };
// what shows on the map: labels by class, and the notes and credits
const shown = page => page.evaluate(() => {
  const vis = e => !!e && e.checkVisibility({ visibilityProperty: true }) && e.getBoundingClientRect().width > 0;
  const by = {}; for (const e of document.querySelectorAll('#labels > *')) if (vis(e)) { const k = e.className.split(' ').pop() || e.tagName; by[k] = (by[k] || 0) + 1; }
  const hud = {}; for (const id of ['blNotes', 'credit', 'attribI', 'stat', 'hud']) hud[id] = vis(document.getElementById(id));
  return { by, n: Object.values(by).reduce((s, v) => s + v, 0), hud, kml: getComputedStyle(document.getElementById('labels')).visibility };
});

for (const [w, h, touch] of [[390, 844, true], [1280, 800, false]]) {
  const page = await open(w, h, touch), tag = `${w}x${h}`;
  // ---------- (a) the buttons
  const a = await page.evaluate(() => {
    const inDrawer = id => !!document.getElementById(id)?.closest('#drawer');
    const fixed = ['menu', 'labelsBtn', 'styleBox', 'wheels', 'locBtns', 'blNotes', 'stat', 'credit', 'attribI', 'xrBtns'].map(id => document.getElementById(id)).filter(e => e && e.checkVisibility({ opacityProperty: true }) && !e.classList.contains('off') && e.getBoundingClientRect().width > 0);   // #credit.off: folding into (i) (0.4 s)
    const R = fixed.map(e => { const r = e.getBoundingClientRect(); return { id: e.id, r: [r.left, r.top, r.right, r.bottom].map(Math.round) }; });
    const over = []; for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const p = R[i].r, q = R[j].r; if (R[i].id + R[j].id === 'creditattribI') continue;   // the credit line folds into (i) in its place (menu.js)
      if (p[0] < q[2] && p[2] > q[0] && p[1] < q[3] && p[3] > q[1]) over.push(R[i].id + '/' + R[j].id); }
    const roundOnMap = [...document.querySelectorAll('button.btn')].filter(b => !b.closest('#drawer') && b.checkVisibility()).map(b => b.id);
    return { droneRound: !!document.getElementById('droneRound'), night: inDrawer('nightBtn'), dig: inDrawer('digBtn'), drone: inDrawer('droneBtn'), roundOnMap, R, over };
  });
  check(!a.droneRound && a.night && a.dig && a.drone && a.roundOnMap.join() === 'menu,labelsBtn', `${tag}: round buttons on the map: ${a.roundOnMap.join(', ')}; Night, Below ground and Drone in the menu (${a.night}, ${a.dig}, ${a.drone})`);
  check(!a.over.length, `${tag}: controls on the map do not overlap (${a.R.map(x => x.id + ' ' + x.r.join(',')).join('; ')})${a.over.length ? ' OVERLAP ' + a.over.join(' ') : ''}`);
  await page.screenshot({ path: `${OUT}/labels-${w}-map.png`, timeout: 180000 });
  const tab = async t => { if (await page.locator('#drawer').isHidden()) await click(page, '#menu'); await page.evaluate(t => [...document.querySelectorAll('#dtabs [data-pane]')].find(b => b.textContent === t).click(), t); };
  // Night: the clock goes to 22:00 and back to 13:00; the button shows the state
  await tab('Look'); const n0 = await page.evaluate(() => __docklands3.night);
  await click(page, '#nightBtn'); await frames(page, 1500);
  const n1 = await page.evaluate(() => ({ night: __docklands3.night, pressed: document.getElementById('nightBtn').getAttribute('aria-pressed') }));
  await tab('Look'); await click(page, '#nightBtn'); await frames(page, 1500);
  const n2 = await page.evaluate(() => ({ night: __docklands3.night, pressed: document.getElementById('nightBtn').getAttribute('aria-pressed') }));
  check(n1.night !== n0 && n1.pressed === String(n1.night) && n2.night === n0 && n2.pressed === String(n0), `${tag}: Menu > Look > Night: night ${n0} -> ${n1.night} (pressed ${n1.pressed}) -> ${n2.night} (pressed ${n2.pressed})`);
  // Below ground: the depth gauge on, then off
  await tab('Go'); await click(page, '#digBtn'); await page.waitForTimeout(800);
  const g1 = await page.evaluate(() => ({ gauge: __docklands3.layers.under.api.gaugeOn(), pressed: document.getElementById('digBtn').getAttribute('aria-pressed'), drawer: !document.getElementById('drawer').hidden }));
  await tab('Go'); await click(page, '#digBtn'); await page.waitForTimeout(800);
  const g2 = await page.evaluate(() => ({ gauge: __docklands3.layers.under.api.gaugeOn(), pressed: document.getElementById('digBtn').getAttribute('aria-pressed') }));
  check(g1.gauge && g1.pressed === 'true' && !g2.gauge && g2.pressed === 'false' && (w >= 900 || !g1.drawer), `${tag}: Menu > Go > Below ground: gauge ${g1.gauge} (pressed ${g1.pressed}, menu ${g1.drawer ? 'open' : 'closed'}), then ${g2.gauge} (pressed ${g2.pressed})`);
  // Drone: on, then the cross
  await tab('Go'); await click(page, '#droneBtn'); await page.waitForTimeout(1200);
  const d1 = await page.evaluate(() => ({ on: DocklandsDrone.on, pressed: document.getElementById('droneBtn').getAttribute('aria-pressed') }));
  if (!(await page.locator('#drawer').isHidden())) await click(page, '#drawerX');
  await click(page, '#drExit'); await page.waitForTimeout(800);
  const d2 = await page.evaluate(() => ({ on: DocklandsDrone.on, pressed: document.getElementById('droneBtn').getAttribute('aria-pressed'), ctrl: __docklands3.controls.enabled }));
  check(d1.on && d1.pressed === 'true' && !d2.on && d2.pressed === 'false' && d2.ctrl, `${tag}: Menu > Go > Drone: on ${d1.on} (pressed ${d1.pressed}), the cross: on ${d2.on} (pressed ${d2.pressed}), orbit back ${d2.ctrl}`);
  if (!(await page.locator('#drawer').isHidden())) await click(page, '#drawerX');
  await page.evaluate(() => __docklands3.setView('cw')); await frames(page, 5000);

  // ---------- (b) the labels switch
  const on0 = await shown(page);
  await click(page, '#labelsBtn'); await frames(page, 2500);
  const off = await shown(page);
  const about = await page.evaluate(() => ({ osm: !!document.querySelector('#credits a[href="https://www.openstreetmap.org/copyright"]'), adsb: /adsb\.lol contributors/.test(document.getElementById('credits').textContent), box: document.getElementById('showLabels').checked, body: document.body.classList.contains('noLabels'), pressed: document.getElementById('labelsBtn').getAttribute('aria-pressed') }));
  check(on0.n > 0 && (on0.hud.credit || on0.hud.attribI) && on0.hud.stat, `${tag}: labels on: ${on0.n} labels shown ${JSON.stringify(on0.by)}; notes and credits ${JSON.stringify(on0.hud)}`);
  check(off.n === 0 && !Object.values(off.hud).some(Boolean) && !about.box && about.body && about.pressed === 'false', `${tag}: labels off: ${off.n} labels shown, notes and credits ${JSON.stringify(off.hud)} (button pressed ${about.pressed})`);
  check(about.osm && about.adsb, `${tag}: labels off: Menu > About keeps the © OpenStreetMap contributors link (${about.osm}) and the adsb.lol credit (${about.adsb})`);
  await page.screenshot({ path: `${OUT}/labels-${w}-off.png`, timeout: 180000 });
  if (w >= 900) {   // kept after a reload (localStorage d3.labels)
    await page.reload({ timeout: 400000 }); await ready(page);
    const r = await page.evaluate(() => ({ box: document.getElementById('showLabels').checked, body: document.body.classList.contains('noLabels') }));
    check(!r.box && r.body, `${tag}: labels off kept after a reload (box ${r.box}, body.noLabels ${r.body})`);
    await page.evaluate(() => __docklands3.setView('cw')); await frames(page, 4000);
  }
  await click(page, '#labelsBtn'); await frames(page, 2000);
  // a software frame of the full page takes 5 to 10 s: wait for the frame that places the labels again
  await page.waitForFunction(n => document.querySelectorAll('#labels > :not([hidden])').length > n, on0.by.camLab || 0, { timeout: 120000 }).catch(() => {});
  const on1 = await shown(page);
  check(on1.n > 0 && (on1.hud.credit || on1.hud.attribI) && on1.hud.stat, `${tag}: labels on again: ${on1.n} labels shown ${JSON.stringify(on1.by)}; notes and credits ${JSON.stringify(on1.hud)}`);

  // ---------- (c) occlusion (1280 x 800)
  if (w >= 900) {
    await page.evaluate(h => { history.replaceState(null, '', location.pathname + location.search + h); }, VIEW);
    await page.reload({ timeout: 400000 }); await ready(page); await frames(page, 6000);
    const c = await page.evaluate(() => {
      const D = __docklands3, O = D.occ(), T = D.THREE, M = D.ctx.meshes, cam = D.camera; cam.updateMatrixWorld();
      const eye = new T.Vector3().setFromMatrixPosition(cam.matrixWorld), rc = new T.Raycaster(), objs = [M.terrain, ...M.buildings.children, ...M.models.children];
      // the exact answer: the first hit on the ray from the eye that is not the anchor's own building (its footprint holds
      // the anchor: area.js places sit 20 m up inside their tower) and not within 2 m of the anchor
      const A = D.ctx.A, dec = D.ctx.dec, inside = (i, x, z) => { const b = A.buildings[i]; if (!b) return false; const f = dec(b.p), n = b.holes && b.holes.length ? b.holes[0] : f.length / 2; let c = false; for (let k = 0, j = n - 1; k < n; j = k++) { const ax = f[2 * k], az = f[2 * k + 1], bx = f[2 * j], bz = f[2 * j + 1]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; } return c; };
      const exact = (x, y, z) => { const a = new T.Vector3(x, y, z), d = a.clone().sub(eye), L = d.length(); d.normalize(); rc.set(eye, d); rc.far = L; const hs = rc.intersectObjects(objs, true);
        const h = hs.find(q => { if (q.distance > L - 2) return false; const bi = q.object.geometry.userData.bi, i = bi && q.face ? bi[q.face.a] : -1; return !(i >= 0 && inside(i, x, z)); }); return h ? h.point.toArray().map(Math.round) : null; };
      const cams = [...document.querySelectorAll('#labels .camLab')], one = t => { const el = cams.find(e => e.title === t), e = el && O.entries().find(q => q.el === el); if (!e) return { title: t, missing: true };
        const v = new T.Vector3(e.x, e.y, e.z).project(cam); return { title: t, hidden: el.hidden, occ: e.occ, exact: exact(e.x, e.y, e.z), at: [Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)] }; };
      let agree = 0, n = 0; const dis = [];
      for (const e of O.entries()) { if (!e.el.isConnected) continue; n++; const x = !!exact(e.x, e.y, e.z); if (x === e.occ) agree++; else dis.push(`${e.el.className.split(' ').pop()} "${(e.el.title || e.el.textContent).slice(0, 30)}" grid ${e.occ} exact ${x}`); }
      // cost: the march alone (fresh keys), and an exact ray for comparison
      const pts = O.entries().slice(0, 200); let t0 = performance.now(), k = 0; for (let r = 0; r < 20; r++) for (const e of pts) { O.test({}, e.x, e.y, e.z); k++; } const marchUs = (performance.now() - t0) * 1000 / k;
      t0 = performance.now(); for (const e of pts.slice(0, 20)) exact(e.x, e.y, e.z); const exactMs = (performance.now() - t0) / Math.min(20, pts.length);
      return { blocked: one('Limehouse Tnl Aspen Way'), clear: one('ASPEN WAY - UPPER BANK STREET'), agree, n, dis: dis.slice(0, 12), marchUs: +marchUs.toFixed(2), exactMs: +exactMs.toFixed(2), stats: O.stats, eye: eye.toArray().map(Math.round), hash: D.shareHash() };
    });
    console.log(`     view ${c.hash}, eye ${c.eye}`);
    check(c.blocked.hidden && c.blocked.occ && !!c.blocked.exact, `occlusion: "${c.blocked.title}" behind a tower: label hidden ${c.blocked.hidden}, grid ${c.blocked.occ}, exact ray hits ${c.blocked.exact} (screen ${c.blocked.at})`);
    check(!c.clear.hidden && !c.clear.occ && !c.clear.exact, `occlusion: "${c.clear.title}" in clear view: label shown ${!c.clear.hidden}, grid ${c.clear.occ}, exact ray ${c.clear.exact} (screen ${c.clear.at})`);
    check(c.agree / Math.max(1, c.n) >= 0.9, `occlusion: grid and exact ray agree for ${c.agree} of ${c.n} labels${c.dis.length ? ': ' + c.dis.join('; ') : ''}`);
    console.log(`     cost: one march ${c.marchUs} µs, one exact three.js ray ${c.exactMs} ms; grid ${c.stats.cells.toLocaleString()} cells of ${c.stats.cell} m: ground ${c.stats.groundMs} ms, ${c.stats.tris.toLocaleString()} roof triangles ${c.stats.buildMs} ms; most in one frame ${c.stats.maxFrameMs.toFixed(2)} ms; ${c.stats.tests} marches, ${(c.stats.steps / Math.max(1, c.stats.tests)).toFixed(0)} steps each`);
    await page.screenshot({ path: `${OUT}/labels-occlusion-1280.png`, timeout: 180000 });
  }
  await page.close();
}
await browser.close();
for (const e of errors) console.log('     ' + e.slice(0, 300));
check(!errors.length, `no page errors (${errors.length})`);
process.exit(ok ? 0 : 1);
