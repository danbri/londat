#!/usr/bin/env node
// Step 3c: the brand's own page for each Canary Wharf branch, for the 30 brands with the most branches
// (counted across Greater London in OSM, london-brand-counts.mjs) that are present in the box.
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/registry/sources/brands/tools/storelocator.mjs
// in:  branches.json (a first build-branches.mjs pass), data/raw/registry/london-brand-counts.json,
//      tools/storelocator-manual.json (URLs found by hand on the brand's own site, keyed by branch ref), wikidata-brands.json,
//      data/raw/registry/storelocator-cache.json (read and written)
// Every input and output, with endpoints and rules: magpie/cwplans/pipeline.json, activity "storelocator".
// out: storelocator.json; then re-run build-branches.mjs to attach the verified URLs.
// A candidate is the OSM website=* of the branch when it is a page below the brand's own domain (not its
// home page, not canarywharf.com), else the manual entry. Each is fetched once (GET, identifying
// User-Agent, redirects followed, <= 1 request/s per host); ok = 2xx and the page names Canary Wharf, the
// street or the postcode. 401/403/429 or a bot-challenge page = blocked (recorded, not retried).
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { OUT, RAW, UA, readJSON, sleep } from './lib.mjs';

const branches = readJSON(join(OUT, 'branches.json')).branches;
const counts = readJSON(join(RAW, 'london-brand-counts.json')).counts;
const wdb = readJSON(join(OUT, 'wikidata-brands.json')).brands;
const manual = JSON.parse(readFileSync(new URL('./storelocator-manual.json', import.meta.url), 'utf8'));
// a brand family: a brand and its Wikidata parent count as one (Tesco Express / Tesco)
const fam = q => { const p = (wdb[q]?.parents || []).find(p => branches.some(b => b.brand_wikidata === p)); return p || q; };
const famCount = {};
for (const b of branches) if (b.brand_wikidata) { const f = fam(b.brand_wikidata); famCount[f] = Math.max(famCount[f] || 0, counts[b.brand_wikidata] || 0, counts[f] || 0); }
const top = Object.entries(famCount).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([q, n]) => ({ q, n }));
const ref = b => b.osm_id || b.cwg_url || (b.fhrs_id != null ? String(b.fhrs_id) : null);
const lastHit = {};
// a store URL whose own path names the place (JS-rendered locator pages carry no text to check)
const PLACE_IN_URL = /canary|wharf|cabot|canada|jubilee|churchill|crossrail|westferry|west-ferry|bank-street|marsh-wall|south-quay|e-?14|docklands|isle-of-dogs|harbour|cubitt|poplar|manchester-r|landmark|cold-?harbour/i;
const CACHE_F = join(RAW, 'storelocator-cache.json');
const cache = (() => { try { return readJSON(CACHE_F); } catch { return {}; } })();
async function check(url) {
  if (cache[url]) return cache[url];
  const r = await check1(url);
  if (r.status) { cache[url] = r; writeFileSync(CACHE_F, JSON.stringify(cache)); }
  return r;
}
async function check1(url) {
  const host = new URL(url).host;
  const wait = 1100 - (Date.now() - (lastHit[host] || 0)); if (wait > 0) await sleep(wait);
  lastHit[host] = Date.now();
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(60000) });
    const txt = (await res.text()).slice(0, 600000);
    const title = (txt.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim().slice(0, 160) || null;
    const challenge = /captcha|cf-chl|Incapsula|_Incapsula_Resource|Access Denied|Request unsuccessful|Pardon Our Interruption|akamai.*reference/i.test(txt.slice(0, 20000)) && txt.length < 60000;
    return { status: res.status, final_url: res.url, title, bytes: txt.length, challenge, text: txt.slice(0, 300000).toLowerCase() };
  } catch (e) { return { status: 0, error: e.cause?.code || e.message }; }
}
const checked = [];
for (const t of top) {
  const mine = branches.filter(b => b.brand_wikidata && fam(b.brand_wikidata) === t.q);
  for (const b of mine) {
    const r = ref(b);
    let url = null, how = null;
    if (manual[r]) { url = manual[r].url; how = 'manual: ' + (manual[r].how || 'found on the brand site'); }
    else if (b.website && !/canarywharf\.com/.test(b.website)) {
      const u = new URL(b.website);
      if (u.pathname.replace(/\/$/, '') !== '' || u.search) { url = b.website; how = 'osm website=*'; }
    }
    const rec = { brand: b.brand, brand_wikidata: b.brand_wikidata, london_osm_branches: t.n, branch_ref: r, branch_name: b.name || null, mall: b.mall || null, postcode: b.postcode || null, store_url: url, how };
    if (!url) { rec.note = manual[`none:${r}`]?.why || 'no store page found'; checked.push(rec); continue; }
    const c = await check(url);
    rec.status = c.status; rec.final_url = c.final_url !== url ? c.final_url : undefined; rec.title = c.title; rec.error = c.error;
    const hay = (c.text || '').toLowerCase();
    rec.names_place = !!c.text && ['canary wharf', (b.postcode || '#').toLowerCase(), (b.mall || '#').toLowerCase()].some(s => s !== '#' && hay.includes(s));
    rec.url_names_place = PLACE_IN_URL.test(decodeURIComponent(c.final_url || url));
    rec.blocked = [401, 403, 429].includes(c.status) || !!c.challenge;
    const two = c.status >= 200 && c.status < 300 && !c.challenge;
    rec.ok = two && (rec.names_place || rec.url_names_place);
    rec.result = rec.ok ? 'verified' : two ? 'resolves (page does not name the place)' : rec.blocked ? 'blocked' : c.status ? `broken (${c.status})` : `no answer (${c.error})`;
    if (manual[r]?.note) rec.note = manual[r].note;
    if (manual[`none:${r}`]) rec.note = manual[`none:${r}`].why;
    checked.push(rec);
    console.log(rec.result, c.status, b.brand, '|', url, rec.final_url ? '-> ' + rec.final_url : '', rec.names_place ? '' : '(place not named)');
  }
}
writeFileSync(join(OUT, 'storelocator.json'), JSON.stringify({
  generated: new Date().toISOString(), user_agent: UA,
  rule: 'top 30 brand families present in the box by Greater London OSM branch count; URL = OSM website=* below the brand domain, else found by hand on the brand site; verified = 2xx, no bot challenge, and the page text or the URL path names Canary Wharf / the postcode / the mall or street',
  top30: top.map(t => ({ brand_wikidata: t.q, label: wdb[t.q]?.label, london_osm_branches: t.n })),
  summary: { branches: checked.length, with_url: checked.filter(c => c.store_url).length, by_result: checked.reduce((m, c) => (m[c.result || 'no store page found'] = (m[c.result || 'no store page found'] || 0) + 1, m), {}) },
  checked,
}, null, 1));
console.log(JSON.stringify(top.map(t => wdb[t.q]?.label + ':' + t.n)));
console.log(checked.filter(c => c.ok).length, 'ok of', checked.length, 'branches;', checked.filter(c => c.blocked).length, 'blocked');
