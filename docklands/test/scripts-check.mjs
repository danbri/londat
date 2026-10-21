// Headless check of the script setting (owner, 2026-10-22: names in Latin script only, on by default, "Better no labels
// than that"; docklands/geo/script.js, docklands/script-ui.js): over Sarajevo (the place, 1.5 km), Banja Luka (Republika
// Srpska, 50 km) and Belgrade (50 km), with the box on, no visible label, card, search result, describeView text,
// featuresAt answer, spoken text, text view or WebMCP-style tool answer has a letter in another script; with
// setScriptPreference('all') the original names come back (Cyrillic in the search and the labels), the menu box follows,
// and ?lang=ru does not override the box (the menu says so). Then the no-3D page: its box, its API and its tools.
//   python3 -m http.server 8377 --bind 127.0.0.1 &      (from the repository root)
//   node docklands/test/scripts-check.mjs [--base http://127.0.0.1:8377] [--size 390x844@2] [--only sarajevo,banjaluka,belgrade,lang,no3d]
// Skill: docklands-3d-page, "Names: Latin script preferred".
import { chromium } from '@playwright/test';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8377'), ONLY = arg('--only', 'sarajevo,banjaluka,belgrade,lang,no3d').split(',');
const [W, H, DPR] = (/^(\d+)x(\d+)@(\d+(?:\.\d+)?)$/.exec(arg('--size', '390x844@2')) || [0, 390, 844, 2]).slice(1).map(Number);
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ' · ' + detail : ''}`); };
const NL = /(?=\p{L})\P{Script=Latin}/u, bad = list => list.filter(s => NL.test(s));

async function open(q) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR }), page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(/open-meteo\.com|adsb\.lol|openwaters|aisstream|aviationweather|raw\.githubusercontent/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(`${BASE}/docklands/?${q}&webgl&animate=0&weather=0&t=2026-10-12T12:00`);
  return { ctx, page, errors };
}
// everything a person or an agent can read: visible labels, search answers, the description, featuresAt, a card, speech, the text view
async function collect(page, queries) {
  return page.evaluate(async queries => {
    const G = __docklands3.globe, frames = async n => { for (let k = 0; k < n; k++) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); } };
    await G.gazetteer(); await G.skeletons(); await frames(40); await new Promise(r => setTimeout(r, 1500)); await frames(20);
    const vis = el => el.checkVisibility ? el.checkVisibility() : !el.hidden;
    const labels = [...document.querySelectorAll('#globeLabels .glab, #labels > *')].filter(vis).map(el => el.textContent.trim()).filter(Boolean);
    const titles = [...document.querySelectorAll('#globeLabels .glab[title]')].filter(vis).map(el => el.title);
    const search = []; for (const q of queries) for (const r of await docklands.findPlaces(q, 10)) search.push(JSON.stringify(r));
    const tool = JSON.stringify(await docklands.callTool('find_places', { query: queries[0], limit: 10 }));
    const d = await docklands.describeView(), f = await docklands.featuresAt(), v = docklands.getView();
    // a card of a search answer, and a card made from data with a name in another script
    const first = (await G.searchAll(queries[0], 3))[0]; if (first) G.showEntry(first);
    const card1 = document.getElementById('cardBody').innerText;
    G.showCard({ name: 'Пале', local_name: 'Пале', kind: 'town', lon: 18.57, lat: 43.82, facts: [{ label: 'Name (other script)', value: 'Пале', source: 'test' }], text: 'Пале is east of Sarajevo.' });
    await new Promise(r => setTimeout(r, 50)); const card2 = document.getElementById('cardBody').innerText;
    docklands.speak('Пале and Sarajevo'); await new Promise(r => setTimeout(r, 200)); const spoken = document.getElementById('a11yLive').textContent;
    await docklands.openTextView(); await new Promise(r => setTimeout(r, 1500)); const tv = document.getElementById('textView'); const text = tv ? tv.innerText : '';
    tv?.querySelector('button')?.click?.(); document.getElementById('textView')?.setAttribute('hidden', '');
    const box = document.getElementById('latinNames');
    return { labels, titles, search, tool, describe: JSON.stringify(d), describeText: d.text, features: JSON.stringify(f), view: v, card1, card2, spoken, text, box: box ? box.checked : null, note: document.getElementById('latinNote')?.textContent || '' };
  }, queries);
}
const report = (tag, r) => {
  const all = [...r.labels, ...r.titles, ...r.search, r.tool, r.describe, r.features, r.card1, r.card2, r.spoken, r.text];
  check(r.view.scripts === 'latin' && r.box === true, `${tag}: setting latin (getView().scripts, the menu box)`, `${r.view.scripts}, box ${r.box}`);
  check(r.labels.length > 0, `${tag}: labels shown`, `${r.labels.length}: ${r.labels.slice(0, 10).join(', ')}`);
  for (const [k, list] of Object.entries({ labels: [...r.labels, ...r.titles], search: [...r.search, r.tool], describeView: [r.describe], featuresAt: [r.features], cards: [r.card1, r.card2], spoken: [r.spoken], 'text view': [r.text] })) {
    const b = bad(list); check(b.length === 0, `${tag}: no letter in another script in ${k}`, b.length ? b.slice(0, 3).map(s => s.slice(0, 120)).join(' | ') : `${list.length} checked`); }
  check(/Sarajevo|Banja|Beograd|Belgrade/.test(r.describeText + r.search.join('')), `${tag}: Latin names still given`, r.describeText.slice(0, 160));
  return all;
};

const CASES = {
  sarajevo: { q: 'll=43.85917,18.43335,1500&ht=0,55', queries: ['Sarajevo', 'Па', 'Пањак', 'Ilidža', 'Пале'] },
  banjaluka: { q: 'll=44.7722,17.191,50000', queries: ['Banja Luka', 'Бања', 'Бе', 'Pr'] },
  belgrade: { q: 'll=44.8125,20.4612,50000', queries: ['Beograd', 'Belgrade', 'Београд', 'Novi Sad'] },
};
for (const id of ONLY.filter(k => CASES[k])) {
  const C = CASES[id]; console.log(`--- ${id} ${W}x${H}@${DPR}`);
  const { ctx, page, errors } = await open(C.q);
  await page.waitForFunction(() => { const G = window.__docklands3?.globe; return G && G.mode === 'globe' && G.ready && window.docklands; }, null, { timeout: 240000, polling: 250 });
  const r = await collect(page, C.queries); report(id, r);
  // every script: the original names come back, all at once (labels re-created), and the box follows
  await page.evaluate(() => docklands.setScriptPreference('all'));
  const a = await page.evaluate(async q => { const G = __docklands3.globe; for (let k = 0; k < 30; k++) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); }
    const vis = el => el.checkVisibility ? el.checkVisibility() : !el.hidden, out = [];
    for (const s of q) for (const x of await docklands.findPlaces(s, 10)) out.push(x.name, x.local_name || '');
    return { search: out, labels: [...document.querySelectorAll('#globeLabels .glab, #labels > *')].filter(vis).map(el => el.textContent), view: docklands.getView().scripts, box: document.getElementById('latinNames').checked, url: location.search }; }, C.queries);
  check(a.view === 'all' && a.box === false, `${id}: setScriptPreference('all') -> getView().scripts all, box off`, `${a.view}, box ${a.box}`);
  if (id !== 'belgrade') check(bad([...a.search, ...a.labels]).length > 0, `${id}: with every script the names in Cyrillic come back`, bad([...a.search, ...a.labels]).slice(0, 6).join(', '));
  else console.log(`     with every script: ${bad([...a.search, ...a.labels]).length} names in another script (${bad([...a.search, ...a.labels]).slice(0, 4).join(', ')})`);
  // the box in the menu turns it on again
  const b = await page.evaluate(async () => { const box = document.getElementById('latinNames'); box.click(); await new Promise(r => setTimeout(r, 300)); const G = __docklands3.globe; for (let k = 0; k < 10; k++) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); }
    const vis = el => el.checkVisibility ? el.checkVisibility() : !el.hidden; return { pref: docklands.getScriptPreference(), labels: [...document.querySelectorAll('#globeLabels .glab, #labels > *')].filter(vis).map(el => el.textContent), stored: localStorage.getItem('docklands-latin-preferred') }; });
  check(b.pref === 'latin' && bad(b.labels).length === 0 && b.stored === '1', `${id}: the menu box turns Latin on again, kept in the browser, labels re-created`, `${b.pref}, ${b.labels.length} labels, ${bad(b.labels).length} in another script`);
  check(errors.length === 0, `${id}: no page errors`, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
if (ONLY.includes('lang')) {   // ?lang=ru: the box wins, and the menu says so; ?scripts=all gives the Russian names
  console.log('--- ?lang=ru over Europe');
  for (const s of ['', '&scripts=all']) {
    const { ctx, page, errors } = await open('ll=48,15,4000000&lang=ru' + s);
    await page.waitForFunction(() => { const G = window.__docklands3?.globe; return G && G.mode === 'globe' && G.ready && window.docklands; }, null, { timeout: 240000, polling: 250 });
    const r = await page.evaluate(async () => { const G = __docklands3.globe; for (let k = 0; k < 30; k++) { G.dirty = true; __docklands3.draw(); await new Promise(r => requestAnimationFrame(r)); }
      const vis = el => el.checkVisibility ? el.checkVisibility() : !el.hidden;
      return { labels: [...document.querySelectorAll('#globeLabels .glab')].filter(vis).map(el => el.textContent), d: (await docklands.describeView()).text, note: document.getElementById('latinNote').textContent, scripts: docklands.getScriptPreference() }; });
    if (!s) { check(r.labels.length > 5 && bad(r.labels).length === 0 && !NL.test(r.d), '?lang=ru with the box on: labels and description in Latin script', `${r.labels.slice(0, 6).join(', ')}; ${r.d.slice(0, 120)}`);
      check(/\?lang=ru/.test(r.note), 'the menu says the page language gives way', r.note.slice(-140)); }
    else check(r.scripts === 'all' && bad(r.labels).length > 5, '?lang=ru&scripts=all: the Russian names', `${bad(r.labels).slice(0, 6).join(', ')}`);
    check(errors.length === 0, `?lang=ru${s}: no page errors`, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
}
if (ONLY.includes('no3d')) {   // the no-3D page: its box, its API, its tools
  console.log('--- no 3D (?no3d=1)');
  const { ctx, page, errors } = await open('no3d=1&view=cw');
  await page.waitForFunction(() => window.docklands && window.docklands.no3d && document.getElementById('map2dLatin'), null, { timeout: 120000, polling: 250 });
  const r = await page.evaluate(async () => { const d = await docklands.describeView(), v = docklands.getView(), t = (docklands.tools || []).map(x => x.name), box = document.getElementById('map2dLatin');
    const s1 = docklands.getScriptPreference(); box.click(); await new Promise(r => setTimeout(r, 300)); const s2 = docklands.getScriptPreference(); const r2 = await docklands.callTool('set_script_preference', { scripts: 'latin' });
    return { d: JSON.stringify(d), v: v.scripts, tools: t, s1, s2, r2, box: box.checked, text: document.getElementById('textView')?.innerText || '' }; });
  check(r.v === 'latin' && r.s1 === 'latin' && r.s2 === 'all' && r.r2.scripts === 'latin' && r.box === true, 'no 3D: the box and setScriptPreference switch the setting', `${r.s1} -> box -> ${r.s2} -> tool -> ${r.r2.scripts}, box ${r.box}`);
  check(r.tools.includes('get_script_preference') && r.tools.includes('set_script_preference'), 'no 3D: the script tools are listed', r.tools.join(', '));
  check(bad([r.d, r.text]).length === 0 && r.text.length > 100, 'no 3D: describeView and the text view in Latin script', `${r.text.length} characters of text view`);
  check(errors.length === 0, 'no 3D: no page errors', errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
