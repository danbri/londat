// Roof shapes in the Three.js port vs the WebGL page: the same share-hash views on both pages (day, 4 Oct 2026 12:00),
// screenshots side by side, and the number of roof prisms each page builds (DocklandsRoofs.prism is wrapped before the
// pages run: calls and distinct buildings in the last build). WebGL 2 on the port (software). Run from the repository root
// with a server on it:
//   node docklands/test/roofs-compare.mjs --base http://127.0.0.1:8613 [--out docklands/test/out/audit/roofs]
// Results: docklands/AUDIT.md, item 2. Skill: docklands-3d-page, "Roof shapes" and "Three.js port".
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8613'), OUT = arg('--out', 'docklands/test/out/audit/roofs'); mkdirSync(OUT, { recursive: true });
const T = '2026-10-04T12:00';
const VIEWS = {   // the skill's roof views (terraces in Deptford, Bow, Deptford Park outriggers) and an oblique one over Canary Wharf
  deptford: 'v=1&c=-1450,3480,4,160,0.6,0.7&n=0',
  bow: 'v=1&c=-1425,1875,4,220,0.3,0.6&n=0',
  outriggers: 'v=1&c=1875,-1875,8,260,0.5,0.65&n=0',
  isle: 'v=1&c=300,900,4,900,0.8,0.5&n=0',
};
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// count DocklandsRoofs.prism calls: wrap it when roofs-layer.js defines it; a new build (the port's buildBuildings, the WebGL
// page's buildBld) starts with prism on the first building again, so keep the counts of the last pass
const counter = () => { let R; Object.defineProperty(globalThis, 'DocklandsRoofs', { configurable: true, get: () => R, set: v => {
  const p = v.prism; globalThis.__roofCount = { calls: 0, set: new Set(), passes: 0, kinds: {} };
  v.prism = function (M, b, rf, ...a) { const C = globalThis.__roofCount; if (C.set.has(b)) { C.passes++; C.last = { calls: C.calls, distinct: C.set.size, kinds: C.kinds }; C.calls = 0; C.set = new Set(); C.kinds = {}; }
    C.calls++; C.set.add(b); const k = rf && (rf.kind || rf.shape || rf.k || '?'); C.kinds[k] = (C.kinds[k] || 0) + 1; return p.call(this, M, b, rf, ...a); };
  R = v; } }); };
const res = {};
async function shot(kind, name, hash) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(counter);
  const t0 = Date.now(); let png;
  if (kind === 'port') {
    await page.goto(`${BASE}/docklands/?webgl&animate=0&layers=&weather=0&look=0&wheels=0&t=${T}#${hash}&t=${T}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && __docklands3.STATS && __docklands3.STATS.buildings, null, { timeout: 300000 });
    await page.waitForTimeout(4000);
    await page.evaluate(() => { for (const e of document.querySelectorAll('body > *')) if (e.tagName !== 'CANVAS' && !e.querySelector('canvas') && !/^(SCRIPT|STYLE)$/.test(e.tagName)) e.style.visibility = 'hidden'; __docklands3.draw(); });
    await page.waitForTimeout(3000); png = await page.screenshot({ timeout: 180000 });
  } else {
    await page.goto(`${BASE}/cwplans/docklands/index.html?t=${T}#${hash}&t=${T}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.__docklands && __docklands.AT && __docklands.ROOFS, null, { timeout: 300000 });
    await page.waitForTimeout(5000);
    const url = await page.evaluate(() => { document.getElementById('labels').style.visibility = 'hidden'; __docklands.renderNow(); return document.getElementById('c').toDataURL('image/png'); });
    png = Buffer.from(url.split(',')[1], 'base64');
  }
  writeFileSync(`${OUT}/${name}-${kind}.png`, png);
  const C = await page.evaluate(() => { const C = globalThis.__roofCount; if (!C) return null; return { lastPass: { calls: C.calls, distinct: C.set.size, kinds: C.kinds }, passes: C.passes + 1, roofsLoaded: (globalThis.__docklands && __docklands.ROOFS && __docklands.ROOFS.size) || null }; });
  (res[name] ||= {})[kind] = { ...C, seconds: Math.round((Date.now() - t0) / 1000), errors: errors.slice(0, 3) };
  console.log(name, kind, JSON.stringify(res[name][kind]));
  await page.close();
}
for (const [name, hash] of Object.entries(VIEWS)) { await shot('port', name, hash); await shot('webgl', name, hash); }
await browser.close();
writeFileSync(`${OUT}/roofs.json`, JSON.stringify(res, null, 1));
