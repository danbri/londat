// Trees of the Three.js port through the year, and a verdict on "trees more realistic including seasonality, species from
// OSM or official data".
// 1. STATS.trees (layers/trees.js): the counts (trees, drawn, species known) and, for every 7th day of 2026, the season
//    state that the shaders draw (seasonAt(day): leaf fraction, autumn-colour share, bloom share; evergreen, deciduous and
//    the 12 most common profiles). From these: evergreen against deciduous in January, the bloom days, the autumn days.
// 2. Pixels: the same views at noon on 20 March, 15 January, 15 April, 15 July, 15 October and 15 November 2026 (?t=), only
//    the trees layer, WebGL 2 in software; the share of foliage-green, autumn-coloured and blossom pixels among the pixels
//    that the trees change (a frame with the layer hidden is the baseline).
//   node docklands/test/trees-season.mjs --base http://127.0.0.1:8613 [--out docklands/test/out/audit/trees] [--no-render]
//   node docklands/test/trees-season.mjs --criteria-only docklands/test/out/audit/trees/trees.json   # the criteria again, no browser
// Prints the criteria and PASS / PARTIAL / FAIL. Results: docklands/AUDIT.md, item 5. Skill: docklands-3d-page,
// "Three.js port" (Trees: species and seasons).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8613'), OUT = arg('--out', 'docklands/test/out/audit/trees'), FROM = arg('--criteria-only'); let RENDER = !process.argv.includes('--no-render'); mkdirSync(OUT, { recursive: true });
const DATES = ['2026-01-15T12:00', '2026-03-20T12:00', '2026-04-15T12:00', '2026-07-15T12:00', '2026-10-15T12:00', '2026-11-15T12:00'];
const VIEWS = { mudchute: 'v=1&c=520,1560,2,300,2.4,0.5&n=0', mudchuteclose: 'v=1&c=560,1500,2,120,2.4,0.35&n=0' };
let res = { stats: null, year: null, views: {} };
if (FROM) { res = JSON.parse(readFileSync(FROM, 'utf8')); RENDER = Object.values(res.views).some(v => v.dates); } else {
const { createCanvas, loadImage } = await import('@napi-rs/canvas');
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const doy = s => (Date.parse(s.slice(0, 10)) - Date.parse(s.slice(0, 4) + '-01-01')) / 864e5 + 1;
let first = true;
for (const [v, h] of Object.entries(VIEWS)) {
  if (!RENDER && !first) break;
  const page = await browser.newPage({ viewport: { width: 640, height: 420 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/docklands/?webgl&animate=0&weather=0&wheels=0&look=0&layers=trees&t=${DATES[0]}#${h}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__docklands3 && __docklands3.ready && __docklands3.STATS.trees && __docklands3.layers.trees && __docklands3.layers.trees.api, null, { timeout: 300000 });
  if (first) {   // the year from STATS.trees (no render needed)
    res.stats = await page.evaluate(() => { const S = __docklands3.STATS.trees; return { trees: S.trees, file: S.file, speciesKnown: S.speciesKnown, speciesKnownShare: S.speciesKnownShare, speciesLevelShare: S.speciesLevelShare, evergreen: S.evergreen, deciduous: S.deciduous, inferred: S.inferred, speciesFile: S.speciesFile, drawn: S.drawn, byProfile: S.byProfile }; });
    res.year = await page.evaluate(() => { const S = __docklands3.STATS.trees, o = {}; for (let d = 1; d <= 365; d += 2) o[d] = S.seasonAt(d); return o; });
    first = false;
  }
  if (!RENDER) { res.views[v] = { errors }; await page.close(); break; }
  await page.evaluate(() => { for (const e of document.querySelectorAll('body > *')) if (e.tagName !== 'CANVAS' && !e.querySelector('canvas') && !/^(SCRIPT|STYLE)$/.test(e.tagName)) e.style.visibility = 'hidden'; });
  res.views[v] = { dates: {} };
  for (const t of DATES) {
    await page.evaluate(async t => { const D = __docklands3; D.setClock(D.fromLondon(t)); for (let k = 0; k < 4; k++) { D.draw(); await new Promise(r => setTimeout(r, 500)); } }, t);
    const px = async png => { const im = await loadImage(png), c = createCanvas(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
    await page.evaluate(async () => { __docklands3.layers.trees.api.setVisible(false); for (let k = 0; k < 2; k++) { __docklands3.draw(); await new Promise(r => setTimeout(r, 400)); } });
    const d0 = await px(await page.screenshot({ timeout: 180000 }));
    await page.evaluate(async () => { __docklands3.layers.trees.api.setVisible(true); for (let k = 0; k < 3; k++) { __docklands3.draw(); await new Promise(r => setTimeout(r, 400)); } });
    const png = await page.screenshot({ timeout: 180000 }); writeFileSync(`${OUT}/${v}-${t.slice(5, 10)}.png`, png); const d = await px(png);
    let green = 0, autumn = 0, blossom = 0, other = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (Math.abs(r - d0[i]) + Math.abs(gg - d0[i + 1]) + Math.abs(b - d0[i + 2]) < 24) continue; n++;
      if (r > 150 && gg > 130 && b > 130 && Math.max(r, gg, b) - Math.min(r, gg, b) < 70 && b > gg * 0.85) blossom++;   // pale: white or pink flower
      else if (gg > r * 1.08 && gg > b * 1.08) green++; else if (r > gg * 1.12 && r > b * 1.3) autumn++; else other++; }
    const st = await page.evaluate(() => { const S = __docklands3.STATS.trees; return { day: S.day, drawn: S.drawn, season: S.season }; });
    res.views[v].dates[t] = { treePixels: n, green: +(green / n).toFixed(3), autumn: +(autumn / n).toFixed(3), blossom: +(blossom / n).toFixed(3), bareOrOther: +(other / n).toFixed(3), stats: { day: st.day, drawn: st.drawn, leafFraction: st.season.leafFraction, autumnShare: st.season.autumnShare, bloomShare: st.season.bloomShare } };
    console.log(v, t, JSON.stringify(res.views[v].dates[t]));
  }
  res.views[v].errors = errors; await page.close();
}
await browser.close();
writeFileSync(`${OUT}/trees.json`, JSON.stringify(res, null, 1));
}

// ---------- criteria
const Y = res.year, days = Object.keys(Y).map(Number), at = d => Y[days.reduce((a, b) => Math.abs(b - d) < Math.abs(a - d) ? b : a)];
const jan = at(15), C = [];
const crit = (name, pass, partial, detail) => { C.push({ name, verdict: pass ? 'PASS' : partial ? 'PARTIAL' : 'FAIL', detail }); };
const S = res.stats;
crit('species from official or OSM data', S.speciesKnownShare >= 0.6, S.speciesKnownShare >= 0.4,
  `${(100 * S.speciesKnownShare).toFixed(1)} % of ${S.trees} trees have a taxon from the source (species ${(100 * S.speciesLevelShare).toFixed(1)} %, genus or family the rest); ${S.inferred} inferred from the setting`);
crit('January: evergreens in leaf, deciduous trees bare', jan.evergreen.leafFraction >= 0.95 && jan.deciduous.leafFraction <= 0.05, jan.evergreen.leafFraction > jan.deciduous.leafFraction,
  `15 Jan: evergreen leaf ${jan.evergreen.leafFraction} (${jan.evergreen.trees} trees), deciduous leaf ${jan.deciduous.leafFraction} (${jan.deciduous.trees} trees)`);
// bloom: the day of the highest bloom share, per profile that blooms
const prof = Object.keys(jan.byProfile), peak = {}, aut50 = {}, fall50 = {}, out50 = {};
for (const p of prof) { let best = null; for (const d of days) { const b = Y[d].byProfile[p]; if (b && b.bloomShare > 0.2 && (!best || b.bloomShare > best[1])) best = [d, b.bloomShare]; } if (best) peak[p] = best[0];
  const ev = at(15).byProfile[p] && at(15).byProfile[p].leafFraction > 0.9; if (ev) continue;
  for (const d of days) { const b = Y[d].byProfile[p]; if (d > 60 && d < 200 && out50[p] == null && b.leafFraction >= 0.5) out50[p] = d; if (d > 200 && aut50[p] == null && b.autumnShare >= 0.5) aut50[p] = d; if (d > 200 && fall50[p] == null && b.leafFraction < 0.5) fall50[p] = d; } }
const bl = Object.entries(peak).sort((a, b) => a[1] - b[1]), blSpread = bl.length ? bl[bl.length - 1][1] - bl[0][1] : 0;
crit('spring flowering by species', bl.length >= 3 && blSpread >= 21, bl.length >= 1, `bloom peaks (day of year): ${bl.map(([p, d]) => `${p} ${d}`).join(', ') || 'none'}; spread ${blSpread} days`);
const au = Object.entries(aut50).sort((a, b) => a[1] - b[1]), auSpread = au.length ? au[au.length - 1][1] - au[0][1] : 0;
crit('species-specific autumn timing', au.length >= 4 && auSpread >= 14, au.length >= 2, `day the autumn colour passes half the foliage: ${au.map(([p, d]) => `${p} ${d}`).join(', ')}; spread ${auSpread} days. Leaf-out (half in leaf): ${Object.entries(out50).sort((a, b) => a[1] - b[1]).map(([p, d]) => `${p} ${d}`).join(', ')}. Half the leaves down: ${Object.entries(fall50).sort((a, b) => a[1] - b[1]).map(([p, d]) => `${p} ${d}`).join(', ')}`);
if (RENDER) { const V = res.views.mudchuteclose.dates, g = k => V[k], j = g(DATES[0]), m = g(DATES[1]), a = g(DATES[2]), u = g(DATES[3]), o = g(DATES[4]);
  crit('pixels follow the season', j.green < a.green && a.green < u.green && o.autumn > u.autumn && o.autumn > a.autumn, j.green < u.green,
    `close view, green share Jan ${j.green}, Mar ${m.green}, Apr ${a.green}, Jul ${u.green}, Oct ${o.green}; autumn share Jul ${u.autumn}, Oct ${o.autumn}; blossom Mar ${m.blossom}, Apr ${a.blossom}, Jul ${u.blossom}`);
  crit('no page errors', Object.values(res.views).every(x => !x.errors.length), false, Object.values(res.views).flatMap(x => x.errors).join('; ') || 'none'); }
const worst = C.some(c => c.verdict === 'FAIL') ? 'FAIL' : C.some(c => c.verdict === 'PARTIAL') ? 'PARTIAL' : 'PASS';
res.criteria = C; res.verdict = worst;
for (const c of C) console.log(`${c.verdict.padEnd(8)}${c.name}: ${c.detail}`);
console.log('VERDICT (automatic criteria)', worst);
writeFileSync(`${OUT}/trees.json`, JSON.stringify(res, null, 1));
