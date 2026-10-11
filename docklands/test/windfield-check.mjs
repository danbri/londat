// Wind in 3D (layers/windfield.js) of the Three.js port: the wind by height and the street-level model, and the cost.
//   node docklands/test/windfield-check.mjs --base http://127.0.0.1:8192 [--out docklands/test/out/windfield] [--shots] [--webgpu]
// api.open-meteo.com is answered by a Playwright route with a made-up day that has the height variables (the container's
// daily limit is shared; the test must not depend on it). Fails (exit 1) on a page error or a failed check.
// Skill: docklands-3d-page, "Three.js port: wind in 3D (2026-10-11)".
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8192'), OUT = arg('--out', 'docklands/test/out/windfield'), SHOTS = process.argv.includes('--shots') || process.argv.includes('--shots-only'), ONLY = process.argv.includes('--shots-only'), GPU = process.argv.includes('--webgpu');
mkdirSync(OUT, { recursive: true });
// a made-up Open-Meteo day (2026-10-11 and 12, GMT): 10 m 5 m/s from 240 degrees true, faster and veering with height
const LEV = { 10: [5, 240], 80: [7.4, 244], 120: [8.1, 247], 180: [8.9, 249] }, HPA = { 1000: [110, 9, 250], 975: [320, 10.5, 252], 950: [540, 11.8, 256], 925: [770, 12.6, 259], 900: [1000, 13.2, 261], 850: [1480, 14.5, 265] };
function meteo(url) {
  const u = new URL(url), day = u.searchParams.get('start_date'), t0 = Date.parse(day + 'T00:00:00Z') / 1000, n = 48, H = { time: Array.from({ length: n }, (_, i) => t0 + i * 3600) };
  for (const v of (u.searchParams.get('hourly') || '').split(',')) H[v] = new Array(n).fill(0);
  for (const [h, [s, d]] of Object.entries(LEV)) { H[`wind_speed_${h}m`] = new Array(n).fill(s); H[`wind_direction_${h}m`] = new Array(n).fill(d); }
  H.wind_gusts_10m = new Array(n).fill(8);
  for (const [p, [g, s, d]] of Object.entries(HPA)) { H[`wind_speed_${p}hPa`] = new Array(n).fill(s); H[`wind_direction_${p}hPa`] = new Array(n).fill(d); H[`geopotential_height_${p}hPa`] = new Array(n).fill(g + 5); }
  H.visibility = new Array(n).fill(30000); H.temperature_2m = new Array(n).fill(14); H.relative_humidity_2m = new Array(n).fill(70);
  return { latitude: 51.5, longitude: -0.02, elevation: 5, hourly: H };
}
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (GPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
const errors = [], fails = [], res = {};
const check = (ok, what, v) => { console.log(ok ? 'PASS' : 'FAIL', what, v !== undefined ? JSON.stringify(v) : ''); if (!ok) fails.push(what); };
async function open(q, vp = { width: 1000, height: 640 }) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
  await page.route(/api\.open-meteo\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(meteo(r.request().url())) }));
  await page.route(/raw\.githubusercontent\.com/, r => r.abort());
  await page.goto(`${BASE}/docklands/?${GPU ? '' : 'webgl&'}${q}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && __docklands3.STATS.layers && __docklands3.layers.windfield, null, { timeout: 400000 });
  return page;
}
const shot = async (page, name) => { const png = await page.evaluate(async () => { const D = __docklands3; D.layers.windfield.api.warm(); D.draw(); await new Promise(r => setTimeout(r, 1500)); return new Promise(r => { globalThis.__d3snap = r; D.draw(); }); });
  if (png) { writeFileSync(`${OUT}/${name}.png`, Buffer.from(png.split(',')[1], 'base64')); console.log('shot', `${OUT}/${name}.png`); } };

// ---------- 1. the field (layers wind + windfield only, fixed 10 m wind 5 m/s from 240 degrees true)
// The street: North Colonnade, Canary Wharf, east of Cabot Square: a 20 m gap between blocks at model z -70 to -55 at x -150
// (the 5 m roof raster), running about grid bearing 98 degrees. The dock: Middle Dock south of the estate (x -150, z 120).
const STREET = { x: -150, z: -62 }, DOCK = { x: -150, z: 120 };
const CAMS = {
  street: { tx: -60, ty: 22, tz: -62, dist: 190, yaw: -Math.PI / 2, pitch: -0.03 },   // eye about 7 m over North Colonnade (x -250), looking east
  above: { tx: -100, ty: 0, tz: 0, dist: 600, yaw: 0.6, pitch: 0.55 },                 // eye about 315 m up
};
let page;
if (!ONLY) {
page = await open('animate=0&wheels=0&layers=wind,windfield&wind=5,240&t=2026-10-11T12:45');
await page.waitForFunction(() => __docklands3.STATS.windfield.profile.source === 'Open-Meteo', null, { timeout: 60000 }).catch(() => {});
const F = await page.evaluate(({ STREET, DOCK }) => {
  const W = __docklands3.layers.windfield.api, S = __docklands3.STATS, WU = S.surface && S.surface.wind;
  const g = W.sample(STREET.x, 0, STREET.z).ground, gd = W.sample(DOCK.x, 0, DOCK.z).ground;
  return { stats: JSON.parse(JSON.stringify(S.windfield)), wind10: WU, profile: W.profile(), cell: W.cell(STREET.x, STREET.z),
    street: [2, 5, 10, 20, 40, 80, 150].map(h => ({ h, ...W.sample(STREET.x, g + h, STREET.z) })), dock: [5, 10].map(h => ({ h, ...W.sample(DOCK.x, gd + h, DOCK.z) })), dockCell: W.cell(DOCK.x, DOCK.z) };
}, { STREET, DOCK });
res.field = F; console.log(JSON.stringify({ wind10: F.wind10, profile: F.profile, cell: F.cell, street: F.street, dock: F.dock }));
const lineDiff = (a, b) => { const d = Math.abs(((a - b) % 180 + 180) % 180); return Math.min(d, 180 - d); };
const s5 = F.street[1], d5 = F.dock[0], wGrid = F.wind10.gridDir;
check(F.stats.profile.source === 'Open-Meteo' && F.stats.profile.levels >= 8, 'profile from the (mocked) Open-Meteo height variables', F.stats.profile);
const p10 = F.profile.find(p => p.z === 10), p150 = F.profile.find(p => p.z === 150);
check(p150.speed > p10.speed * 1.3, 'profile: 150 m faster than 10 m', { v10: p10.speed, v150: p150.speed });
check(p150.turn > 3, 'profile: veers clockwise with height (mock: 240 -> 249 at 180 m)', { turn150: p150.turn });
check(!F.cell.open && F.cell.coherence > 0.5 && F.cell.aspect > 2, 'North Colonnade cell is a coherent canyon', F.cell);
check(lineDiff(s5.dir, F.cell.axis) < lineDiff(wGrid, F.cell.axis) - 10, 'street level (5 m): the flow turns towards the street axis', { flow: s5.dir, wind: wGrid, axis: F.cell.axis, before: +lineDiff(wGrid, F.cell.axis).toFixed(1), after: +lineDiff(s5.dir, F.cell.axis).toFixed(1) });
check(s5.speed < 0.7 * d5.speed, 'street level (5 m): slower than over the dock at 5 m', { street: s5.speed, dock: d5.speed });
check(F.dockCell.open && Math.abs(F.dock[1].speed - F.wind10.speed) < 0.3, 'over the dock at 10 m: the free 10 m wind', { dock10: F.dock[1].speed, wind10: F.wind10.speed });
const s150 = F.street[6]; check(s150.street < 0.05 && Math.abs(s150.speed - p150.speed) < 0.5, 'above the roofs (150 m over the street): the profile', s150);
// the estimate (no profile): ?windprofile=est
await page.close();
page = await open('animate=0&wheels=0&layers=wind,windfield&wind=5,240&windprofile=est&t=2026-10-11T12:45');
const P2 = await page.evaluate(() => ({ src: __docklands3.STATS.windfield.profile.source, prof: __docklands3.layers.windfield.api.profile([10, 150, 500, 1000]) }));
res.estimate = P2; console.log(JSON.stringify(P2));
check(P2.src === 'estimate' && Math.abs(P2.prof[1].speed / P2.prof[0].speed - Math.pow(15, 0.3)) < 0.05 && Math.abs(P2.prof[2].turn - 15) < 0.5, 'estimate: (z/10)^0.3 and +15 degrees at 500 m', P2.prof);
await page.close();

// ---------- 2. cost and motion (animation on) at street level and from 300 m
page = await open('wheels=0&layers=wind,windfield&wind=5,240&t=2026-10-11T12:45');
for (const [name, c] of Object.entries(CAMS)) {
  const M = await page.evaluate(async c => { const D = __docklands3, W = D.layers.windfield.api; D.setCam(c); W.warm(); const s0 = W.stats.steps, t0 = performance.now(), p0 = D.STATS.windfield.region;
    for (let w = 0; w < 120 && W.stats.steps - s0 < 24; w++) await new Promise(r => setTimeout(r, 1000));   // software frames are slow under load: wait for 24 steps (2 s of wind), at most 2 minutes
    const frame = W.stats.frameMs, steps = W.stats.steps - s0, secs = +((performance.now() - t0) / 1000).toFixed(1);
    return { frame, steps, secs, stepMs: [W.bench(30), W.bench(30), W.bench(30)], region: W.stats.region, fps: document.getElementById('fps').textContent }; }, c);
  res['cost_' + name] = M; console.log(name, JSON.stringify(M));
  check(M.steps > 0, `motion ${name}: the particles stepped with animation on`, { steps: M.steps, secs: M.secs });
  const sm = [...M.stepMs].sort((a, b) => a - b)[1]; check(sm < 2, `cost ${name}: one advection step of all particles under 2 ms (median of 3 x 30, software)`, M.stepMs);
}
await page.close();
}

// ---------- 3. screenshots (animate=0 after a warm-up of the trails): read them
if (SHOTS) {
  const views = [
    ['greenlanddock-day', 'view=greenlanddock&t=2026-10-11T12:45', null],
    ['street-day', 't=2026-10-11T12:45', CAMS.street], ['above-day', 't=2026-10-11T12:45', CAMS.above],
    ['street-night', 't=2026-10-11T22:00', CAMS.street], ['above-night', 't=2026-10-11T22:00', CAMS.above],
  ];
  for (const [name, q, cam] of views) {
    page = await open(`animate=0&wheels=0&layers=trees,water,wind,windfield&wind=5,240&${q}`, { width: 1000, height: 640 });
    if (cam) await page.evaluate(c => __docklands3.setCam(c), cam);
    await shot(page, name);
    await page.evaluate(() => __docklands3.layers.windfield.api.setVisible(false)); await shot(page, name + '-off');
    await page.close();
  }
}
await browser.close();
res.errors = errors; writeFileSync(`${OUT}/windfield.json`, JSON.stringify(res, null, 1));
if (errors.length) { console.log('page errors', errors.slice(0, 8)); fails.push('page errors'); }
console.log(fails.length ? `FAILED: ${fails.join('; ')}` : 'all checks passed'); process.exit(fails.length ? 1 : 0);
