// Green areas of the Three.js port on the terrain (build.js greensGeometry, surfaceAt): opens ?view=greenwich, finds the
// green polygon with the most relief (Greenwich Park), reports how far the old flat slab (ground under the first vertex
// + 0.4 m) was above and below the ground, the vertex count, the largest vertex error against surfaceAt + 0.4 m, and the
// lift range at 4 random points in every triangle; then a screenshot over that polygon at 390 x 844.
//   node docklands/test/greens-check.mjs out.png      (server on the repository root at 127.0.0.1:8420)
// Skill: docklands-3d-page, "Three.js port: parks on the terrain (2026-10-10)".
import { chromium } from '@playwright/test';
const OUT = process.argv[2], b = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://127.0.0.1:8420/docklands/?view=greenwich&webgl&animate=0&weather=0&planes=0&ships=0&wildlife=0&t=2026-10-10T15:00');
await p.waitForFunction(() => globalThis.__docklands3?.ready, null, { timeout: 400000 });
const r = await p.evaluate(async () => { const B = await import('/docklands/build.js'), A = B.A, T = A.terrain, D = __docklands3;
  // largest relief green; old slab vs surface; new vertices vs surface
  let worst = null; for (const g of A.greens) { const f = B.dec(g.p); let lo = 1e9, hi = -1e9, cx = 0, cz = 0, n = f.length / 2; for (let i = 0; i < f.length; i += 2) { const h = B.surfaceAt(f[i], f[i + 1]); lo = Math.min(lo, h); hi = Math.max(hi, h); cx += f[i] / n; cz += f[i + 1] / n; }
    const old = B.groundAt(f[0], f[1]) + .4; const air = old - (lo + .4), under = (hi + .4) - old; if (!worst || hi - lo > worst.relief) worst = { relief: hi - lo, air, under, cx, cz, n: g.name || '' }; }
  const G = D.scene.children.find(o => o.isMesh && o.geometry.attributes.color && o.geometry === (D.meshes?.greens?.geometry)) ;
  let geo = null; D.scene.traverse(o => { if (o.isMesh && o.material && o.geometry.attributes.color && !geo && o.geometry.index && o.geometry.attributes.position.count && o.geometry.attributes.color.array[1] > .41 && o.geometry.attributes.color.array[1] < .43 && Math.abs(o.geometry.attributes.color.array[0] - .30) < .01) geo = o.geometry; });
  let dev = 0, lo = 9, hi = -9; if (geo) { const P = geo.attributes.position.array, I = geo.index.array; for (let i = 0; i < P.length; i += 3) dev = Math.max(dev, Math.abs(P[i + 1] - B.surfaceAt(P[i], P[i + 2]) - .4));
    for (let k = 0; k < I.length; k += 3) for (let s = 0; s < 4; s++) { let a = Math.random(), b = Math.random(); if (a + b > 1) { a = 1 - a; b = 1 - b; } const c = 1 - a - b, q = [I[k], I[k + 1], I[k + 2]].map(n => 3 * n), x = a * P[q[0]] + b * P[q[1]] + c * P[q[2]], y = a * P[q[0] + 1] + b * P[q[1] + 1] + c * P[q[2] + 1], z = a * P[q[0] + 2] + b * P[q[1] + 2] + c * P[q[2] + 2], g = y - B.surfaceAt(x, z); lo = Math.min(lo, g); hi = Math.max(hi, g); } }
  // camera: low over the park, looking across the slope
  const c = D.camera, t = D.controls.target; t.set(worst.cx, B.surfaceAt(worst.cx, worst.cz) + 5, worst.cz); c.position.set(worst.cx - 250, B.surfaceAt(worst.cx - 250, worst.cz + 150) + 60, worst.cz + 150); c.lookAt(t); D.controls.update?.();
  return { worst, verts: geo && geo.attributes.position.count, dev, lift: [lo, hi] }; });
console.log(JSON.stringify(r)); await p.waitForTimeout(8000); await p.screenshot({ path: OUT, timeout: 300000 }); console.log('errors', errs.length, errs.slice(0, 3).join(' | ')); await b.close();
