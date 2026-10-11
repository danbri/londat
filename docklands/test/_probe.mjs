import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
await page.route(/open-meteo|githubusercontent/, r => r.abort());
await page.goto('http://127.0.0.1:8192/docklands/?webgl&animate=0&wheels=0&layers=windfield&wind=5,240', { timeout: 180000 });
await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.STATS.layers, null, { timeout: 400000 });
const r = await page.evaluate(() => { const W = __docklands3.layers.windfield.api, o = [JSON.stringify([W.cell(-150,-62),W.sample(-150,6,-62),W.cell(-150,8),W.sample(-150,6,8)])]; for (const [x,z] of [[-150,120],[-150,-250],[-100,-300],[0,-280],[-300,250],[-640,-30]]) o.push(x+","+z+" "+JSON.stringify(W.cell(x,z))+" "+JSON.stringify(W.sample(x,6,z)));
  for (const x of [-250, -150, -50, 50, 150]) { let s = ''; for (let z = -200; z <= 200; z += 5) s += W.sample(x, 8, z).roof > -1e8 ? '#' : '.'; o.push(x + ' ' + s); }
  let t = ''; for (const z of [-120, -100, -80, 60, 70, 80]) { let s = ''; for (let x = -400; x <= 300; x += 5) s += W.sample(x, 8, z).roof > -1e8 ? '#' : '.'; o.push(z + ' ' + s); }
  return o; });
console.log(r.join('\n')); await browser.close();
