// Headless numeric check of vertical exaggeration (?vz=3) in the camera movers of the Three.js port (docklands/): zoom to
// the cursor (the pointer ray must go through the point under the cursor), Drone (the camera at the drone's eye x vz),
// KML "Go to view" (a Camera's eye at alt x vz, as kml-layer.js), locate's orbit (the target at the ground x vz), and the
// orbit target at the centre of the screen. Prints PASS or FAIL for each. Run from the repository root:
//   python3 -m http.server 8931 --bind 127.0.0.1 &
//   node docklands/test/vz-moves.mjs [--base http://127.0.0.1:8931] [--webgpu]
// Skill: docklands-3d-page, "Three.js port".
import { chromium } from '@playwright/test';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8931'), WEBGPU = process.argv.includes('--webgpu');
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } }), errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route(/api\.open-meteo\.com/, r => r.abort());
await page.goto(`${BASE}/docklands/?view=cw&vz=3&layers=drone,kml,locate&weather=0&animate=0${WEBGPU ? '' : '&webgl'}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && __docklands3.STATS.layers, null, { timeout: 240000 });
await page.waitForTimeout(3000);
const R = await page.evaluate(async () => {
  const D = __docklands3, T = D.THREE, cam = D.camera, out = {}, near = (a, b, e) => Math.abs(a - b) <= e;
  cam.updateMatrixWorld();
  // the orbit target projects to the centre of the screen (Object3D.lookAt must read the unscaled eye)
  const t = D.controls.target.clone(); t.y /= D.vz; const p = t.clone().project(cam); out.targetCentred = { pass: near(p.x, 0, 0.01) && near(p.y, 0, 0.01), ndc: [+p.x.toFixed(4), +p.y.toFixed(4)] };
  // zoom to the cursor: the dolly direction goes through the exaggerated point under (700, 450)
  const r = D.renderer.domElement.getBoundingClientRect(), ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2((700 - r.left) / r.width * 2 - 1, -((450 - r.top) / r.height) * 2 + 1), cam);
  const hit = ray.intersectObjects([D.ctx.meshes.terrain, ...D.ctx.meshes.buildings.children], false)[0];
  D.controls._updateZoomParameters(700, 450); const dd = D.controls._dollyDirection.clone();
  const want = hit.point.clone(); want.y *= D.vz; want.sub(cam.position).normalize();
  out.zoomToCursor = { pass: dd.angleTo(want) < 0.002, angle: +dd.angleTo(want).toFixed(5) };
  // Drone: the camera at the drone's eye x vz
  const dr = D.layers.drone && D.layers.drone.api; if (dr && dr.start) { await dr.start('copter'); await new Promise(f => setTimeout(f, 800)); const st = dr.state || {}; const e = new T.Vector3().setFromMatrixPosition(cam.matrixWorld);
    out.drone = { pass: !!st.p && near(e.y, st.p[1], 0.6) && near(cam.position.y, st.p[1] * D.vz, 1.8), eyeModel: +e.y.toFixed(2), droneY: st.p && +st.p[1].toFixed(2), camY: +cam.position.y.toFixed(2) }; dr.stop && dr.stop(); }
  else out.drone = { pass: false, note: 'no drone api', keys: dr && Object.keys(dr) };
  // KML "Go to view": a Camera at 50 m OD, heading 90, tilt 80: the eye at 50 x vz in the orbit's space; the view read back
  // in model metres (kml-layer.js currentView: eye and target / VZ) has the tilt of the unexaggerated line of sight, as there
  const K = D.layers.kml && D.layers.kml.api;
  if (K && K.goView) { const g = D.ctx.A.meta.geo; K.goView({ type: 'Camera', lon: g.lon0 + .07, lat: g.lat0 + .03, alt: 50, heading: 90, tilt: 80, altitudeMode: 'absolute' }); await new Promise(f => setTimeout(f, 300));
    const cv = K.currentView(); out.kmlGoView = { pass: near(cam.position.y, 50 * D.vz, 0.5) && near(cv.alt, 50, 0.5) && near(cv.tilt, 90 - Math.atan(Math.tan(10 * Math.PI / 180) / D.vz) * 180 / Math.PI, 0.5), camY: +cam.position.y.toFixed(2), alt: +cv.alt.toFixed(2), tilt: +cv.tilt.toFixed(2) };
    K.applyCam({ tx: 0, tz: 0, ty: 20, yaw: .5, pitch: .4, dist: 500 }); const s = D.camState(); out.kmlFly = { pass: near(s.ty, 20, 0.01) && near(s.pitch, .4, 0.001), ty: s.ty, pitch: s.pitch }; }
  else out.kmlGoView = { pass: false, note: 'no kml api' };
  const Lc = D.layers.locate && D.layers.locate.api;
  if (Lc && Lc.setCam) { Lc.setCam({ tx: 100, tz: 100, ty: 5, yaw: .3, pitch: .5, dist: 600 }); const s = D.camState(); out.locate = { pass: near(s.ty, 5, 0.01) && near(s.pitch, .5, 0.001), ty: s.ty }; }
  else out.locate = { pass: false, note: 'no locate api' };
  return out;
});
for (const [k, v] of Object.entries(R)) console.log(`${v.pass ? 'PASS' : 'FAIL'} ${k} ${JSON.stringify(v)}`);
if (errors.length) console.log('errors', errors);
await browser.close();
process.exit(Object.values(R).every(v => v.pass) && !errors.length ? 0 : 1);
