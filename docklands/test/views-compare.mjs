// Photo-view parity: the Three.js port (docklands/) against the WebGL page (cwplans/docklands/). For each photo view and
// screen size, projects named landmarks (tower tops and piers, tools/view-mcp landmarks) with each page's own camera
// (WebGL page: __docklands.MVP and the canvas box; port: Vector3.project with __docklands3.camera and the canvas box) and
// prints the pixel errors and the eye of each page. The reference is always the WebGL page with setView at vz 1.
//   (default)  the port with setView(view)
//   --fresh    the port opened with ?view=<view> (a new page per view)
//   --hash     also the share hash round trips: the port reopened with its own hash (a reload), the WebGL page opened with
//              the port's hash, and the port opened with the WebGL page's hash (nav.js shareUrl)
//   --vz 3     the port at ?vz 3: the eye must keep its true height (the view table's eye y, in model metres); the
//              WebGL page's eye is printed for comparison (it goes under the water; not changed)
// Screenshots (--out, off with --no-shots): <view>-<size>-webgl.png and -port.png. Exit 1 on an error over --tol px.
// Run from the repository root with a server on the root:
//   python3 -m http.server 8188 --bind 127.0.0.1 &
//   node docklands/test/views-compare.mjs [--base http://127.0.0.1:8188] [--views a,b] [--fresh] [--hash] [--vz 3] [--layers ids] [--sizes 1280x800@1,390x844@2] [--no-shots]
// Skill: docklands-3d-page, "Three.js port: photo views".
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { landmarkById } from '../../tools/view-mcp/view-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = k => process.argv.includes(k);
const BASE = arg('--base', 'http://127.0.0.1:8188'), OUT = arg('--out', 'docklands/test/out/views'), VZ = +arg('--vz', '1');
const SHOTS = !has('--no-shots'), TOL = +arg('--tol', '3'), FRESH = has('--fresh'), HASH = has('--hash'), PLAYERS = arg('--layers', '');
const VIEWS = arg('--views', 'rotherhithe,greenland,pier,greenlandday,plane').split(',');
const SIZES = arg('--sizes', '1280x800@1,390x844@2').split(',').map(z => z.split(/[x@]/).map(Number));
const IDS = ['cwb-0413', 'cwb-0417', 'cwb-0451', 'cwb-0577', 'cwb-0514', 'cwb-0582', 'place:Greenland Pier', 'place:Canary Wharf Pier', 'place:West India Pier'];
const LM = IDS.map(id => { const l = landmarkById(id); return { id, name: l.name, xyz: l.xyz }; });
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const allErrors = [];
async function open(url, w, h, dpr, ready) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  page.on('pageerror', x => allErrors.push(`${url}: pageerror: ${x.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) allErrors.push(`${url}: console: ${m.text()}`); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 400000 });
  await page.waitForFunction(ready, null, { timeout: 400000 });
  await page.waitForTimeout(2500);   // nav.js restores a share hash after DOMContentLoaded; the port writes its hash 400 ms after a move
  return page;
}
const webgl = (q, w, h, dpr) => open(`${BASE}/cwplans/docklands/index.html${q}`, w, h, dpr, () => window.__docklands && window.__docklands.CAM && window.__docklands.renderNow);
const port = (q, w, h, dpr) => open(`${BASE}/docklands/${q.replace(/^\?/, '?webgl&animate=0&weather=0&layers=' + PLAYERS + '&').replace(/^#/, '?webgl&animate=0&weather=0&layers=' + PLAYERS + '#')}`, w, h, dpr, () => globalThis.__docklands3 && globalThis.__docklands3.ready);

// CSS pixels of each landmark in the WebGL page (null behind the eye); view: setView first, or null to keep the camera
const measureWebgl = (page, view, vz = 1) => page.evaluate(([view, LM, vz]) => {
  const D = window.__docklands; if (view) D.setView(view);
  const s = document.getElementById('vz'); if (s && +s.value !== vz) { s.value = String(vz); s.dispatchEvent(new Event('input', { bubbles: true })); }
  D.renderNow(); const C = D.CAM, m = D.MVP, r = document.getElementById('c').getBoundingClientRect(), V = D.par().vz;
  const pts = LM.map(l => { const [x, y, z] = l.xyz, p = [x, y * V, z, 1], o = [0, 1, 2, 3].map(i => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i] * p[3]);
    return o[3] <= 0 ? null : [r.left + (o[0] / o[3] + 1) / 2 * r.width, r.top + (1 - o[1] / o[3]) / 2 * r.height]; });
  return { pts, eye: [C.eye[0], C.eye[1] / V, C.eye[2]], fovY: C.fovY, vz: V, hash: globalThis.DocklandsNav ? DocklandsNav.shareUrl().hash : '' };
}, [view, LM, vz]);
async function measurePort(page, view, vz = 1) {
  await page.evaluate(([view, vz]) => { const D = __docklands3; if (view) { D.setVz(1); D.setView(view); } if (vz !== D.vz) D.setVz(vz); D.draw(); }, [view, vz]);
  await page.waitForTimeout(1500);   // the render loop applies the roll and the near plane on its next frame
  return page.evaluate(([LM]) => {
    const D = __docklands3, cam = D.camera, r = D.renderer.domElement.getBoundingClientRect(); cam.updateMatrixWorld();
    const pts = LM.map(l => { const v = new D.THREE.Vector3(...l.xyz); if (v.clone().applyMatrix4(cam.matrixWorldInverse).z >= 0) return null; v.project(cam); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; });
    return { pts, eye: new D.THREE.Vector3().setFromMatrixPosition(cam.matrixWorld).toArray(), fovY: cam.fov * Math.PI / 180, near: cam.near, vz: D.vz, hash: D.shareHash() };
  }, [LM]);
}
const shotWebgl = async (page, file) => { const png = await page.evaluate(() => { window.__docklands.renderNow(); return document.getElementById('c').toDataURL('image/png'); }); writeFileSync(file, Buffer.from(png.split(',')[1], 'base64')); };
const shotPort = (page, file) => page.screenshot({ path: file, timeout: 180000 });

const f1 = v => v.toFixed(1), fmt = p => p ? `${f1(p[0])},${f1(p[1])}` : '-', deg = r => (r * 180 / Math.PI).toFixed(2);
let worst = 0, failed = 0;
function compare(label, ref0, m, w, h, detail) {
  let max = 0; const rows = [];
  // a portrait screen caps a photo view's vertical field at 70 deg (main.js PHOTO_VMAX): same eye and aim, so the WebGL
  // page's pixels scale about the frame centre by tan(fovY WebGL / 2) / tan(fovY port / 2)
  let ref = ref0; if (Math.abs(ref0.fovY - m.fovY) > 1e-4 && w < h) { const k = Math.tan(ref0.fovY / 2) / Math.tan(m.fovY / 2); ref = { ...ref0, pts: ref0.pts.map(p => p && [w / 2 + (p[0] - w / 2) * k, h / 2 + (p[1] - h / 2) * k]) };
    console.log(`   (portrait cap: port fovY ${deg(m.fovY)} for the WebGL page's ${deg(ref0.fovY)}; WebGL pixels scaled by ${k.toFixed(3)} about the centre)`); }
  LM.forEach((l, i) => { const p = ref.pts[i], q = m.pts[i]; if (!p || p[0] < -w || p[0] > 2 * w || p[1] < -h || p[1] > 2 * h) return;
    const e = q ? Math.hypot(p[0] - q[0], p[1] - q[1]) : Infinity; max = Math.max(max, e);
    rows.push(`     ${l.name.padEnd(38)} WebGL ${fmt(p).padEnd(14)} ${label.padEnd(5).slice(0, 5)} ${fmt(q).padEnd(14)} ${isFinite(e) ? e.toFixed(2) : 'behind'} px`); });
  console.log(`   ${label}: eye ${m.eye.map(f1)} fovY ${deg(m.fovY)}${m.near ? ' near ' + m.near.toFixed(2) : ''}  max error ${isFinite(max) ? max.toFixed(2) : 'behind'} px`);
  if (detail) rows.forEach(r => console.log(r));
  worst = Math.max(worst, max); if (!(max <= TOL)) failed++;
}
for (const [w, h, dpr] of SIZES) {
  const G = await webgl(`?view=${VIEWS[0]}`, w, h, dpr);
  let P = FRESH ? null : await port(`?view=${VIEWS[0]}`, w, h, dpr);
  for (const view of VIEWS) {
    const tag = `${view}-${w}x${h}@${dpr}${VZ !== 1 ? '-vz' + VZ : ''}`;
    console.log(`\n== ${view} ${w}x${h}@${dpr}${VZ !== 1 ? ' vz ' + VZ : ''}`);
    const ref = await measureWebgl(G, view, 1);
    console.log(`   WebGL page: eye ${ref.eye.map(f1)} fovY ${deg(ref.fovY)} (reference: setView, vz 1)`);
    if (FRESH) { if (P) await P.close(); P = await port(`?view=${view}${VZ !== 1 ? '&vz=' + VZ : ''}`, w, h, dpr); }
    const b = await measurePort(P, FRESH ? null : view, VZ);
    if (VZ === 1) compare('port', ref, b, w, h, true);
    else {   // the eye's true height: the view table's eye y; the WebGL page at the same vz for comparison
      const g = await measureWebgl(G, null, VZ), ok = Math.abs(b.eye[1] - ref.eye[1]) < 0.05;
      console.log(`   vz ${VZ}: eye height (model metres) true ${f1(ref.eye[1])}, port ${b.eye[1].toFixed(2)} ${ok ? 'ok' : 'WRONG'}, WebGL page ${g.eye[1].toFixed(2)}; port fovY ${deg(b.fovY)} near ${b.near.toFixed(2)}`);
      if (!ok) failed++;
      if (SHOTS) await shotWebgl(G, `${OUT}/${tag}-webgl.png`);
      await measureWebgl(G, view, 1);
    }
    if (SHOTS) { if (VZ === 1) await shotWebgl(G, `${OUT}/${tag}-webgl.png`); await shotPort(P, `${OUT}/${tag}-port.png`); }
    if (HASH && VZ === 1) {
      const ph = b.hash, gh = ref.hash; console.log(`   port hash ${ph}\n   WebGL hash ${gh.slice(0, 120)}`);
      for (const [label, opener, q, measure] of [['port reopened with its own hash', port, ph, measurePort], ['WebGL page opened with the port hash', webgl, ph, measureWebgl], ['port opened with the WebGL page hash', port, gh, measurePort]]) {
        let pg = null; try { pg = await opener(q, w, h, dpr); compare(label, ref, await measure(pg, null), w, h, false); }
        catch (e) { console.log(`   ${label}: NOT MEASURED (${String(e.message).split('\n')[0]})`); failed++; }
        finally { if (pg) await pg.close().catch(() => {}); }
      }
    }
  }
  await G.close(); if (P) await P.close();
}
for (const e of allErrors.slice(0, 12)) console.log('   ' + e.slice(0, 300));
if (VZ === 1) console.log(`\nworst landmark error ${worst.toFixed(2)} px (limit ${TOL})`);
await browser.close();
process.exit(failed || allErrors.length ? 1 : 0);
