// Record what https://map.canarywharf.com/ asks the network for: one page load at floor 0 and one at floor -1 in headless
// Chromium; every request's method, type, URL, headers and status, and the bodies of JSON and vector-tile answers.
// Used to find the Living Map API behind the page. Nothing is committed: the output stays in data/raw/cwg-map/.
//   node magpie/cwplans/tools/probe-cwg-map.mjs [outdir]
// Skill: cwplans-web-harvest, "Mall plans" (the Living Map service; harvest only after the owner decides).
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
const OUT = process.argv[2] || new URL('../data/raw/cwg-map', import.meta.url).pathname; mkdirSync(OUT + '/resp', { recursive: true });
const b = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage(); const log = [];
p.on('request', r => log.push({ t: Date.now(), method: r.method(), type: r.resourceType(), url: r.url(), headers: r.headers(), post: r.postData()?.slice(0, 2000) }));
p.on('response', async r => {
  const e = log.find(x => x.url === r.url() && x.status == null); if (!e) return;
  e.status = r.status(); e.ctype = r.headers()['content-type'] || ''; e.rheaders = r.headers();
  if (/json|protobuf|x-protobuf|octet|geo/.test(e.ctype) || /\.pbf|\.json/.test(e.url)) { try { const body = await r.body(); e.size = body.length; const f = createHash('sha1').update(r.url()).digest('hex').slice(0, 16); writeFileSync(`${OUT}/resp/${f}`, body); e.saved = f; } catch {} }
});
p.on('console', m => m.type() === 'error' && log.push({ console: m.text().slice(0, 300) }));
await p.goto('https://map.canarywharf.com/?screenmode=base&floor=0#hash=16/51.50509/-0.021/-80.1', { waitUntil: 'networkidle', timeout: 90000 }).catch(e => log.push({ gotoError: e.message }));
await p.waitForTimeout(8000);
await p.screenshot({ path: OUT + '/shot-floor0.png' });
// try another floor via the URL parameter
await p.goto('https://map.canarywharf.com/?screenmode=base&floor=-1#hash=17/51.5045/-0.0195/-80.1', { waitUntil: 'networkidle', timeout: 90000 }).catch(e => log.push({ gotoError: e.message }));
await p.waitForTimeout(6000);
await p.screenshot({ path: OUT + '/shot-floor-1.png' });
writeFileSync(OUT + '/requests.json', JSON.stringify(log, null, 1));
await b.close();
console.log(log.length, 'entries');
