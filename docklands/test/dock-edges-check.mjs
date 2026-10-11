// Dock edges of the Three.js port follow the water outlines (build.js terrainGeometry / terrainModel; fault F54; owner,
// 2026-10-11: "why does greenland dock not have straight sides?").
//  (a) geometry, in the page: along the outline of Greenland Dock (A.water[65]) and of a stretch of the Thames (the tidal
//      polygon with the longest outline, inside the box), at points every 2 m, the terrain mesh (a vertical ray against
//      the terrain geometry, its current index; with the tide layer on, the foreshore too) 0.5 m inside the water must be at the sunk height of that water (docks:
//      level - 1.5 m; Thames: the river bed, or with the tide layer on no higher than the land) and 0.5 m outside at the land height (surfaceAt), each within 0.5 m. Points
//      within 1 m of another outline vertex pair or of the model box are skipped. Reported: the share of points that pass,
//      the worst misses. Also the terrain's build ms and triangles (G.userData.stats).
//  (b) screenshots: ?view=greenlanddock&t=2026-10-11T12:45 at 1288 x 966 at DPR 2 (the owner's photo
//      data/images/contrib/greenlanddock/2026-10-11-gd-01-greenland-dock-east.jpg), and from 600 m over Surrey Docks
//      looking down (x -1400, z 1150);
//  (c) no page errors.
//   node docklands/test/dock-edges-check.mjs [--base http://127.0.0.1:8196] [--layers water,walls] [--tide 0] [--out DIR]
// --layers: load only these layers (fast iterations); the default is the full page. --tide 0: the Thames without the
// foreshore (the base terrain cut). Skill: docklands-3d-page, "Three.js port: dock edges follow the outlines (2026-10-11)".
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8196'), LAYERS = arg('--layers', ''), TIDE = arg('--tide', ''), OUT = arg('--out', 'docklands/test/out');
mkdirSync(OUT, { recursive: true });
const q = `labels=0&webgl&animate=0&weather=0${LAYERS ? '&layers=' + LAYERS : ''}${TIDE ? '&tide=' + TIDE : ''}`;
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1288, height: 966 }, deviceScaleFactor: 2 }), errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.route(/open-meteo/, r => r.abort());
await page.goto(`${BASE}/docklands/?view=greenlanddock&t=2026-10-11T12:45&${q}`);
await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready, null, { timeout: 400000 });
await page.waitForTimeout(6000);

const geo = await page.evaluate(async () => {
  const B = await import('/docklands/build.js'), D = __docklands3, A = B.A, E = A.meta.extent, THREE = D.THREE, TM = B.terrainModel();
  const mesh = D.ctx.meshes.terrain, G = mesh.geometry, tideOn = !!(D.layers.tide && D.layers.tide.on && globalThis.__tide3);
  // the terrain's triangles (and, with the tide layer on, the foreshore's, which replace the squares at the tidal water) in
  // 20 m buckets (x, z), for vertical rays: one position array, foreshore vertices after the terrain's
  let P = G.attributes.position.array, I = G.index.array;
  if (tideOn) { const F = __tide3.fore.geometry, FP = F.attributes.position.array, FI = F.index.array, n0 = P.length / 3, P2 = new Float32Array(P.length + FP.length), I2 = new Uint32Array(I.length + FI.length);
    P2.set(P); P2.set(FP, P.length); I2.set(I); for (let k = 0; k < FI.length; k++) I2[I.length + k] = FI[k] + n0; P = P2; I = I2; }
  const C = 20, buck = new Map(), key = (a, b) => a * 100003 + b;
  for (let k = 0; k < I.length; k += 3) { const a = 3 * I[k], b = 3 * I[k + 1], c = 3 * I[k + 2];
    if (P[a + 1] === P[b + 1] && P[b + 1] === P[c + 1] && P[a] === P[b] && P[a + 2] === P[b + 2]) continue;
    const x0 = Math.floor(Math.min(P[a], P[b], P[c]) / C), x1 = Math.floor(Math.max(P[a], P[b], P[c]) / C), z0 = Math.floor(Math.min(P[a + 2], P[b + 2], P[c + 2]) / C), z1 = Math.floor(Math.max(P[a + 2], P[b + 2], P[c + 2]) / C);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const kk = key(i, j); if (!buck.has(kk)) buck.set(kk, []); buck.get(kk).push(k); } }
  // the highest non-vertical surface of the terrain at (x, z) (the wall faces are vertical: skipped)
  const meshAt = (x, z) => { let best = -1e9; for (const k of buck.get(key(Math.floor(x / C), Math.floor(z / C))) || []) { const a = 3 * I[k], b = 3 * I[k + 1], c = 3 * I[k + 2];
    const d = (P[b] - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (P[b + 2] - P[a + 2]); if (Math.abs(d) < 1e-9) continue;
    const u = ((x - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (z - P[a + 2])) / d, v = ((P[b] - P[a]) * (z - P[a + 2]) - (x - P[a]) * (P[b + 2] - P[a + 2])) / d;
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue; best = Math.max(best, P[a + 1] + u * (P[b + 1] - P[a + 1]) + v * (P[c + 1] - P[a + 1])); } return best; };
  // the expected sunk height of water wi at (x, z): docks level - 1.5 (or the LiDAR when lower: grid points only, so
  // the bound is level - 1.5 +- 0.5); Thames: the bed, interpolated on the terrain triangle (bed at the corners)
  const T = A.terrain, bedAt = TM.bedAt;
  const sunk = (wi, x, z) => { const w = A.water[wi]; if (!w.tidal) return w.level - 1.5;
    const u = (x - T.x0) / T.cell, v = (z - T.z0) / T.cell, i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j, g = (ii, jj) => { const k = jj * T.nx + ii; return TM.tm[k] ? TM.sink[k] : bedAt(T.x0 + ii * T.cell, T.z0 + jj * T.cell); };
    return fx + fz <= 1 ? g(i, j) + fx * (g(i + 1, j) - g(i, j)) + fz * (g(i, j + 1) - g(i, j)) : g(i + 1, j + 1) + (1 - fx) * (g(i, j + 1) - g(i + 1, j + 1)) + (1 - fz) * (g(i + 1, j) - g(i + 1, j + 1)); };
  // all outline edges, for the "near another edge" skip
  const segs = []; A.water.forEach((w, wi) => { const f = B.dec(w.p), st = [0, ...(w.holes || []), f.length / 2]; for (let r = 0; r < st.length - 1; r++) for (let i = st[r]; i < st[r + 1]; i++) { const j = i + 1 < st[r + 1] ? i + 1 : st[r]; segs.push([f[2 * i], f[2 * i + 1], f[2 * j], f[2 * j + 1], wi, r, i]); } });
  const d2seg = (x, z, s) => { const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / l2)) : 0; return (s[0] + t * dx - x) ** 2 + (s[1] + t * dz - z) ** 2; };
  const inPoly = (wi, x, z) => { let c = false; for (const s of segs) { if (s[4] !== wi) continue; if ((s[1] > z) !== (s[3] > z) && x < (s[2] - s[0]) * (z - s[1]) / (s[3] - s[1]) + s[0]) c = !c; } return c; };
  const inAny = (x, z) => A.water.some((w, wi) => inPoly(wi, x, z));
  function check(wi, maxM) {
    const own = segs.filter(s => s[4] === wi); let n = 0, ok = 0, okIn = 0, okOut = 0, worst = [], walked = 0;
    for (const s of own) { const L = Math.hypot(s[2] - s[0], s[3] - s[1]); if (L < 1e-3) continue;
      for (let t = 1; t < L - 1 && walked < maxM; t += 2, walked += 2) { const x = s[0] + (s[2] - s[0]) * t / L, z = s[1] + (s[3] - s[1]) * t / L, nx = -(s[3] - s[1]) / L, nz = (s[2] - s[0]) / L;
        if (x < E.x0 + 2 || x > E.x1 - 2 || z < E.z0 + 2 || z > E.z1 - 2) continue;
        if (segs.some(o => o !== s && d2seg(x, z, o) < 1)) continue;   // a corner or another outline within 1 m
        // which side is the water: the side inside this polygon
        let wx = x + nx * .5, wz = z + nz * .5, lx = x - nx * .5, lz = z - nz * .5; if (!inPoly(wi, wx, wz)) { [wx, lx] = [lx, wx]; [wz, lz] = [lz, wz]; }
        if (inAny(lx, lz)) continue;   // water on both sides (a lock, two polygons)
        const hw = meshAt(wx, wz), hl = meshAt(lx, lz), ew = sunk(wi, wx, wz), el = B.surfaceAt(lx, lz);
        // with the tide layer on, the tidal water's edge is its foreshore (a wall foot, a beach or a revetment from the
        // bank: layers/tide.js); there the water side must only be no higher than the land side
        const fore = tideOn && A.water[wi].tidal, gw = fore ? hw > -20 && hw <= hl + .05 : Math.abs(hw - ew) <= .5 || (!A.water[wi].tidal && hw <= ew + .5 && hw >= ew - 5), gl = Math.abs(hl - el) <= .5;
        n++; if (gw) okIn++; if (gl) okOut++; if (gw && gl) ok++; else worst.push({ x: +x.toFixed(1), z: +z.toFixed(1), water: +hw.toFixed(2), want_w: +ew.toFixed(2), land: +hl.toFixed(2), want_l: +el.toFixed(2) }); } }
    worst.sort((a, b) => Math.abs(b.water - b.want_w) + Math.abs(b.land - b.want_l) - Math.abs(a.water - a.want_w) - Math.abs(a.land - a.want_l));
    return { name: A.water[wi].n || '#' + wi, tidal: !!A.water[wi].tidal, level: A.water[wi].level, points: n, pass: +(ok / Math.max(1, n)).toFixed(4), water_ok: okIn, land_ok: okOut, worst: worst.slice(0, 4) };
  }
  // the Thames: the tidal polygon with the most vertices; 2 km of its outline
  let th = -1; A.water.forEach((w, wi) => { if (w.tidal && (th < 0 || w.p.length > A.water[th].p.length)) th = wi; });
  return { terrain: G.userData.stats || mesh.userData.stats, tideOn, greenland: check(65, 1e9), thames: check(th, 2000) };
});
console.log(JSON.stringify(geo, null, 1));

// (b) the photo view, then Surrey Docks from above
await page.screenshot({ path: `${OUT}/dock-edges-greenlanddock.png`, timeout: 300000 });
await page.evaluate(() => { const D = __docklands3; D.setCam({ tx: -1400, tz: 1150, ty: 4, yaw: 0, pitch: 1.5, dist: 600 }); D.controls.update?.(); D.draw?.(); });
await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUT}/dock-edges-surrey-above.png`, timeout: 300000 });
await page.evaluate(() => { const D = __docklands3; D.setCam({ tx: -1180, tz: 1090, ty: 4, yaw: 0, pitch: 1.5, dist: 160 }); D.controls.update?.(); D.draw?.(); });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/dock-edges-greenland-close.png`, timeout: 300000 });
await browser.close();
for (const e of errors) console.log(e.slice(0, 300));
const bad = errors.length + (geo.greenland.pass < 0.95 ? 1 : 0) + (geo.thames.pass < 0.9 ? 1 : 0);
console.log(`${bad ? 'FAIL' : 'ok'}: errors ${errors.length}; Greenland Dock ${geo.greenland.pass}; Thames ${geo.thames.pass} -> ${OUT}/dock-edges-*.png`);
process.exit(bad ? 1 : 0);
