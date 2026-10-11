// Accessibility audit of the Three.js port (docklands/) with axe-core (npm axe-core, MPL-2.0, a devDependency): loads
// the page (WebGL 2 in SwiftShader, a few layers so it is quick), opens the drawer on each tab in turn, runs axe on the
// whole document each time and prints the violations by impact (the same rule on several tabs counts once, with all its
// nodes). Exit 1 when a critical or serious violation remains (OKR KR3.3 target: 0 serious).
//   python3 -m http.server 8205 --bind 127.0.0.1 &   (repository root)
//   node docklands/test/axe-check.mjs [--base http://127.0.0.1:8205] [--query 'view=cw&layers=...'] [--json out.json] [--full]
// --full loads every layer (slow in software: minutes). Skill: docklands-3d-page, "page API, WebMCP and non-visual access".
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8205'), FULL = process.argv.includes('--full');
const Q = arg('--query', FULL ? 'view=cw&weather=0' : 'view=cw&weather=0&layers=placenames,registry,keys,search,routes,under,ships,planes,tide,locate');
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(180000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${BASE}/docklands/?${Q}&webgl&animate=0`);
await page.waitForFunction(() => globalThis.__docklands3 && globalThis.__docklands3.ready, null, { timeout: 300000 });
await page.waitForTimeout(3000);
await page.addScriptTag({ path: AXE });
const all = new Map();
for (const pane of ['paneViews', 'paneLook', 'paneLayers', 'paneGo', 'paneTime', 'paneAbout']) {
  await page.evaluate(p => { const m = __docklands3.menu; m.openPane(p); }, pane);
  await page.waitForTimeout(500);
  const r = await page.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => n.target.join(' ') + (n.failureSummary ? ' :: ' + n.failureSummary.split('\n').slice(1, 2).join(' ').trim() : '')) })));
  for (const v of r) { const e = all.get(v.id) || { ...v, nodes: [], panes: [] }; e.panes.push(pane); for (const n of v.nodes) if (!e.nodes.includes(n)) e.nodes.push(n); all.set(v.id, e); }
}
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 }, V = [...all.values()].sort((a, b) => order[a.impact] - order[b.impact]);
for (const v of V) { console.log(`${v.impact.padEnd(8)} ${v.id} (${v.nodes.length} nodes; ${v.panes.length} tabs): ${v.help}`); for (const n of v.nodes.slice(0, 6)) console.log('           ' + n.slice(0, 220)); }
const bad = V.filter(v => v.impact === 'critical' || v.impact === 'serious');
console.log(`axe-core ${await page.evaluate(() => axe.version)}: ${V.length} rules violated; critical ${V.filter(v => v.impact === 'critical').length}, serious ${V.filter(v => v.impact === 'serious').length}, moderate ${V.filter(v => v.impact === 'moderate').length}, minor ${V.filter(v => v.impact === 'minor').length}; page errors ${errors.length}`);
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(V, null, 1));
await browser.close();
process.exit(bad.length || errors.length ? 1 : 0);
