// Check of the near-live sources of the Three.js port (docklands/): the live-cache branch (aircraft.json, ships.json,
// metar.json; cwplans/tools/fetch-live-cache.mjs) as the page uses them. Cases (each a fresh page, WebGL 2 unless
// --webgpu): aircraft near now (label "Live (adsb.lol, n min ago)", near-live aircraft drawn, trails), aircraft at a past
// day (label "Recorded"), aircraft with ?adsblive=0&adsbrec=0 (simulation); ships near now (live Open Waters or the
// live-cache buffer, trails) and yesterday (the hourly cache); wind and weather with ?t= inside a METAR hour and with none.
// ?layers= limits the page to the layers named (faster in software; the other layers are not loaded).
//   python3 -m http.server 8931 --bind 127.0.0.1 &      (in the repository root, or a copy)
//   node docklands/test/live-cache-check.mjs [--base http://127.0.0.1:8931] [--webgpu] [--only planes|ships|metar]
// Skills: docklands-sky ("Live aircraft in the Three.js port", "METAR"), cwplans-river-and-water ("AIS: Open Waters").
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8931'), WEBGPU = process.argv.includes('--webgpu'), ONLY = arg('--only', '');
const OUT = 'docklands/test/out/live-cache'; mkdirSync(OUT, { recursive: true });
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (WEBGPU) args.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });

const iso = t => new Date(t).toISOString().slice(0, 16);
const now = Date.now();
// the newest METAR hour of the branch, for the METAR cases
const metar = await fetch('https://raw.githubusercontent.com/danbri/londat/live-cache/metar.json').then(r => r.json()).catch(() => null);
const mT = metar && metar.obs.length ? metar.obs.at(-3).t * 1000 + 10 * 60e3 : now - 3600e3;
const CASES = [
  { id: 'planes-now', grp: 'planes', q: 'layers=planes,water,tide&view=cw', want: s => s.planes && s.planes.near > 0 && /^Live \(adsb\.lol, \d+ min ago\)/.test(s.credit) && s.trailSegs > 0 },
  { id: 'planes-past', grp: 'planes', q: `layers=planes,water,tide&view=cw&t=${iso(now - 86400e3)}`, want: s => s.planes && s.planes.rec > 0 && /^Recorded/.test(s.credit) },
  { id: 'planes-sim', grp: 'planes', q: 'layers=planes,water,tide&view=cw&adsblive=0&adsbrec=0', want: s => s.planes && s.planes.near == null && s.planes.rec == null && (s.planes.lcy + s.planes.lhr + s.planes.h4) > 0 && s.credit === '' },
  { id: 'ships-now', grp: 'ships', q: 'layers=ships,water,tide&view=cw', want: s => s.ships && s.ships.shown > 0 && s.ships.from === 'live' && s.ships.trails > 0 },
  { id: 'ships-livecache', grp: 'ships', q: 'layers=ships,water,tide&view=cw&aislive=0', want: s => s.ships && s.ships.shown > 0 && /live-cache/.test(s.ships.from) && s.ships.trails > 0 },
  { id: 'ships-yesterday', grp: 'ships', q: `layers=ships,water,tide&view=cw&t=${iso(now - 86400e3)}`, want: s => s.ships && s.ships.shown > 0 && s.ships.from === 'cache' },
  { id: 'metar-in', grp: 'metar', q: `layers=wind,weather,water,tide&view=cw&t=${iso(mT)}`, want: s => s.wind && /London City Airport METAR/.test(s.wind.source || '') && s.weather && /METAR/.test(s.weather.source || '') },
  { id: 'metar-none', grp: 'metar', q: `layers=wind,weather,water,tide&view=cw&t=2026-09-20T12:00`, want: s => s.wind && !/METAR/.test(s.wind.source || '') && !(s.weather && /METAR/.test(s.weather.source || '')) },
];
let failed = 0;
for (const C of CASES) {
  if (ONLY && C.grp !== ONLY) continue;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [], hosts = {};
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('request', r => { const h = new URL(r.url()).host; hosts[h] = (hosts[h] || 0) + 1; });
  await page.goto(`${BASE}/docklands/?${C.q}${WEBGPU ? '' : '&webgl'}&animate=0&weather=0`);
  const ok = await page.waitForFunction(() => globalThis.__docklands3 && globalThis.__docklands3.ready, null, { timeout: 180000 }).then(() => true).catch(() => false);
  let s = null;
  for (let k = 0; k < 20 && ok; k++) {
    await page.waitForTimeout(3000);
    s = await page.evaluate(() => {
      const D = __docklands3, L = D.layers || {}, P = L.planes && L.planes.api, St = D.STATS || {};
      const tr = D.scene ? (() => { let n = 0; D.scene.traverse(o => { if (/trails/.test(o.name) && o.geometry && o.visible) n += o.geometry.drawRange.count / 2; }); return n; })() : null;
      return { backend: D.backend, planes: St.planes, ships: St.ships, wind: St.surface && St.surface.wind, weather: St.weather && St.weather.now, credit: (document.querySelector('#adsbCredit .ln1') || {}).textContent || '',
        creditShown: !!document.querySelector('#adsbCredit:not([hidden])'), trailSegs: tr, near: P && P.nearLive, labels: [...document.querySelectorAll('.lab.plane:not([hidden]), .lab.ship:not([hidden])')].slice(0, 6).map(e => e.textContent + (e.style.opacity ? ` (${e.style.opacity})` : '')) };
    });
    if (C.want(s)) break;
  }
  const pass = ok && s && C.want(s) && !errors.length; if (!pass) failed++;
  await page.screenshot({ path: `${OUT}/${C.id}${WEBGPU ? '-webgpu' : ''}.png`, timeout: 180000 }).catch(() => {});
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${C.id} ${s ? s.backend : 'not ready'} ${JSON.stringify(s && { planes: s.planes && { near: s.planes.near, near_age_s: s.planes.near_age_s, rec: s.planes.rec, rec_day: s.planes.rec_day, sim: s.planes.lcy + s.planes.lhr + s.planes.h4 }, credit: s.credit, trailSegs: s.trailSegs, ships: s.ships, wind: s.wind, weather: s.weather && { cover: s.weather.cover, low: s.weather.low, mid: s.weather.mid, vis: s.weather.vis, source: s.weather.source }, labels: s.labels })}`);
  console.log(`     requests by host: ${JSON.stringify(hosts)}`);
  for (const e of errors.slice(0, 6)) console.log('     ' + e.slice(0, 300));
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
