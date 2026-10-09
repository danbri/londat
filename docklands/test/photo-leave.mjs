// Leaving a photo view on a phone: opens the port at 390 x 844 with ?view=rotherhithe, checks the portrait cap of the
// vertical field (70 deg), drags once (the lens must ease back to 45.8 deg and the orbit target move to the ground under
// the screen centre), then puts the pointer on the nearest tree in view and zooms with the wheel until the eye is within
// 30 m of a tree (the owner, 2026-10-09: "I cannot get close [to the woods] and the world is more fisheye").
// Run from the repository root with a server on the root:
//   python3 -m http.server 8188 --bind 127.0.0.1 &
//   node docklands/test/photo-leave.mjs [--base http://127.0.0.1:8188] [--view rotherhithe] [--webgpu] [--out docklands/test/out]
// Skill: docklands-3d-page, "Three.js port: photo views".
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8188'), VIEW = arg('--view', 'rotherhithe'), OUT = arg('--out', 'docklands/test/out'), WEBGPU = process.argv.includes('--webgpu');
mkdirSync(OUT, { recursive: true });
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }), errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
await page.goto(`${BASE}/docklands/?view=${VIEW}${WEBGPU ? '' : '&webgl'}&animate=0&weather=0&layers=trees`, { timeout: 400000 });
await page.waitForFunction(() => globalThis.__docklands3?.ready, null, { timeout: 400000 });
await page.waitForTimeout(2000);
const state = () => page.evaluate(async () => {
  const D = __docklands3, cam = D.camera; cam.updateMatrixWorld();
  const T = globalThis.__treesForTest || (globalThis.__treesForTest = (await (await fetch('../cwplans/docklands/data/trees.json')).json()).trees);
  const e = new D.THREE.Vector3().setFromMatrixPosition(cam.matrixWorld), g = D.ctx.groundAt;
  let best = Infinity; for (const t of T) { const dx = t[0] - e.x, dz = t[1] - e.z; if (Math.abs(dx) > best || Math.abs(dz) > best) continue; const d = Math.hypot(dx, g(t[0], t[1]) - e.y, dz); if (d < best) best = d; }
  return { fov: cam.fov, eye: e.toArray().map(v => +v.toFixed(1)), target: D.controls.target.toArray().map(v => +v.toFixed(1)), dist: +cam.position.distanceTo(D.controls.target).toFixed(1), nearestTree: +best.toFixed(1), hash: D.shareHash() };
});
let ok = true; const check = (c, msg) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`); if (!c) ok = false; };
const s0 = await state();
check(s0.fov <= 70.01, `photo view ${VIEW} at 390 x 844: vertical field ${s0.fov.toFixed(2)} deg (cap 70); eye ${s0.eye}; target ${s0.dist} m out`);
await page.screenshot({ path: `${OUT}/photo-leave-0-${VIEW}.png`, timeout: 180000 });
// one drag: a short turn to the right
await page.mouse.move(195, 500); await page.mouse.down(); for (let i = 1; i <= 6; i++) await page.mouse.move(195 - i * 6, 500); await page.mouse.up();
await page.waitForTimeout(2500);
const s1 = await state();
check(Math.abs(s1.fov - 45.8) < 0.05, `after a drag: vertical field ${s1.fov.toFixed(2)} deg (normal 45.8); target ${s1.target} (${s1.dist} m from the eye), hash ${s1.hash.slice(0, 70)}`);
// the pointer on the nearest tree in view, then the wheel
const aimAt = await page.evaluate(async () => {
  const D = __docklands3, cam = D.camera, T = globalThis.__treesForTest, g = D.ctx.groundAt; cam.updateMatrixWorld();
  const e = new D.THREE.Vector3().setFromMatrixPosition(cam.matrixWorld); let best = null;
  for (const t of T) { const p = new D.THREE.Vector3(t[0], g(t[0], t[1]) + 4, t[1]), d = p.distanceTo(e); if (best && d >= best.d) continue;
    const c = p.clone().applyMatrix4(cam.matrixWorldInverse); if (c.z >= 0) continue; p.project(cam); const x = (p.x + 1) / 2 * 390, y = (1 - p.y) / 2 * 844;
    if (x > 20 && x < 370 && y > 150 && y < 800 && document.elementFromPoint(x, y) === D.renderer.domElement) best = { d, x, y }; }   // not under a label: the wheel goes to the canvas
  return best;
});
check(!!aimAt, `nearest tree in view: ${aimAt ? aimAt.d.toFixed(0) + ' m, at ' + aimAt.x.toFixed(0) + ',' + aimAt.y.toFixed(0) + ' px' : 'none'}`);
let s2 = s1, n = 0;
if (aimAt) { await page.mouse.move(aimAt.x, aimAt.y);
  for (n = 1; n <= 80; n++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(250); if (n % 5 === 0) { s2 = await state(); if (s2.nearestTree < 30) break; } }
  console.log(`     the pointer was over ${await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + (e.className ? '.' + e.className : '') : 'nothing'; }, [aimAt.x, aimAt.y])} at the end`); }
s2 = await state();
check(s2.nearestTree < 30, `after ${n} wheel steps: eye ${s2.eye}, nearest tree ${s2.nearestTree} m (limit 30), target ${s2.dist} m out`);
await page.screenshot({ path: `${OUT}/photo-leave-1-${VIEW}.png`, timeout: 180000 });
// a drag up from 85 % of the height on a fresh page (the owner's "white flashes on the horizon": the eye went under the water)
{ const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p2.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await p2.goto(`${BASE}/docklands/?view=${VIEW}&t=2026-10-09T22:00${WEBGPU ? '' : '&webgl'}&animate=0&weather=0&layers=`, { timeout: 400000 });
  await p2.waitForFunction(() => globalThis.__docklands3?.ready, null, { timeout: 400000 }); await p2.waitForTimeout(1500);
  const above = () => p2.evaluate(() => { const D = __docklands3, c = D.camera; c.updateMatrixWorld(); const e = new D.THREE.Vector3().setFromMatrixPosition(c.matrixWorld); return +(e.y - D.ctx.groundAt(e.x, e.z)).toFixed(2); });
  let low = await above();
  await p2.mouse.move(195, 717); await p2.mouse.down(); for (let i = 1; i <= 20; i++) { await p2.mouse.move(195, 717 - i * 30); low = Math.min(low, await above()); } await p2.mouse.up();
  for (let i = 0; i < 6; i++) { await p2.waitForTimeout(500); low = Math.min(low, await above()); }
  // limit: the ground wall of main.js navigation is nav.js's 1 m (before 2026-10-09 evening the orbit lift held the eye at 1.6 m and
  // this limit was 1.5); the page has no layers/under.js here, so a push cannot pass Below ground: the eye must stay above
  check(low > 0.99, `drag up from 85 % height after ?view=${VIEW}&t=2026-10-09T22:00: lowest eye ${low} m above the ground (limit 0.99: the 1 m wall)`);
  await p2.screenshot({ path: `${OUT}/photo-leave-2-${VIEW}-dragup.png`, timeout: 180000 }); await p2.close(); }
check(!errors.length, `no page or console errors${errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''}`);
await browser.close();
process.exit(ok ? 0 : 1);
