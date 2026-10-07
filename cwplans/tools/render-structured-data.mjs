#!/usr/bin/env node
// Render every web page the registry links to in headless Chromium and extract its schema.org structured data:
// JSON-LD (raw text), microdata (as JSON) and RDFa (as N-Triples). Then write the committed copy in
// third_party/cwplans-structured-data/. Facts are pulled out of that copy by tools/extract-structured-data.mjs.
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/render-structured-data.mjs          # render what is not done, then build
//   ... --list           count URLs by source and priority, no network
//   ... --refresh        render every URL again
//   ... --retry-failed   render again the URLs whose last attempt failed with a transient error
//   ... --build-only     write third_party/cwplans-structured-data/ from the local results, no network
//   ... --limit=N --host=h   test runs (outputs are still written from everything done so far)
// URLs: the same fields as tools/crawl-sites.mjs plus occupants[].cwg_website and charities[].website
// (registry/sources/registers/charities.json). Order: shopfinder / store pages first, then pages the plain crawl got no
// structured data from (bot challenge, 4xx, script-rendered), then the rest. Skipped: FSA ratings, OSM, Wikidata,
// Wikipedia, Companies House, Land Registry, register pages, canarywharf.com (Imperva). Internet Archive copies of
// canarywharf.com pages are NOT fetched: the copies fetch-cwg.mjs saved are read with scripts off (no network).
// Politeness: robots.txt per host (crawl-sites.mjs's cached robots.json, else fetched; RFC 9309, checked for every
// document navigation including redirects), one page at a time per host, >= 2 s between page loads on a host,
// at most 3 pages at once; images, media and fonts are not loaded. No logins, no forms; a cookie banner is
// accepted only when the page shows no structured data and a known consent button is present.
// Raw (not committed): data/raw/rendered/<host>/<sha1(url)[0:16]>.html.gz (rendered DOM) + .json (result).
// Lessons and method: skills/docklands-data-curation/SKILL.md, "Structured data from rendered pages".
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { gzipSync, gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractStructuredData } from './structured-dom.mjs';

const CW = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(CW, '..');
const OUT_RAW = join(CW, 'data/raw/rendered');
const CRAWL = join(CW, 'data/raw/crawl');
const TP = join(REPO, 'third_party/cwplans-structured-data');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const UA_TOKEN = 'glitchcan-cwplans';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 glitchcan-cwplans/0.1 (+https://github.com/danbri/londat)';
const PARALLEL = 3, HOST_GAP_MS = 2000, CAP_MS = 20000, LATE_MS = 1500, MAX_BLOCK = 200 * 1024;
const argv = process.argv.slice(2), args = new Set(argv);
const opt = k => (argv.find(a => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJSON = p => JSON.parse(readFileSync(join(CW, p), 'utf8'));
const sha1 = s => createHash('sha1').update(s).digest('hex').slice(0, 16);
const T0 = Date.now();

// ---------------------------------------------------------------- 1. URLs, the entries they serve, and a priority
const B = readJSON('registry/buildings.json').buildings;
const BR = readJSON('registry/sources/brands/branches.json').branches;
const SL = readJSON('registry/sources/brands/storelocator.json').checked;
const CWG = readJSON('registry/sources/brands/cwg-directory.json').directory;
const CHAR = readJSON('registry/sources/registers/charities.json').records;
const SF = readJSON('registry/sources/web/site-facts.json');
const prior = new Map(SF.pages.map(p => [p.url, p]));
const cwgByUrl = new Map(CWG.filter(d => d.archived).map(d => [d.cwg_url, d]));
const urls = new Map(), skipped = {}, refsBySource = {};
const skip = r => { skipped[r] = (skipped[r] || 0) + 1; };
const STORE_FIELD = /store_url/;
function add(raw, field, key) {
  if (!raw || typeof raw !== 'string') return;
  refsBySource[field] = (refsBySource[field] || 0) + 1;
  let u = raw.trim().replace(/ \(closest capture\)$/, '');
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u.replace(/^\/+/, '');
  let p; try { p = new URL(u); } catch { return skip('not a URL'); }
  const h = p.hostname.replace(/^www\./, '');
  if (/(^|\.)food\.gov\.uk$/.test(h)) return skip('FSA ratings page');
  if (/(^|\.)(openstreetmap\.org|wikidata\.org|wikipedia\.org|company-information\.service\.gov\.uk|find-and-update\.company-information\.service\.gov\.uk|landregistry\.data\.gov\.uk)$/.test(h)) return skip('OSM, Wikidata, Wikipedia, Companies House or Land Registry page');
  if (/(^|\.)(facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com)$/.test(h)) return skip('social network page');
  if (/(^|\.)canarywharf\.com$/.test(h)) {
    const d = cwgByUrl.get(p.href) || cwgByUrl.get(p.href + '/');
    if (!d) return skip('canarywharf.com page with no archived copy (live site blocks scripts)');
    u = d.archived; field += '→archived';
  }
  const e = urls.get(u) || urls.set(u, { refs: new Set(), for: new Set() }).get(u);
  e.refs.add(field); e.for.add(key);
}
for (const b of B) for (const o of b.occupants || []) {
  const key = `${b.id}|${o.name}`;
  add(o.website, 'buildings.occupants.website', key);
  add(o['contact:website'], 'buildings.occupants.contact:website', key);
  add(o.cwg_website, 'buildings.occupants.cwg_website', key);
  add(o.store_url, 'buildings.occupants.store_url', key);
  add(o.cwg_archived || o.cwg_url, 'buildings.occupants.cwg_archived', key);
  if (o.url) { refsBySource['buildings.occupants.url'] = (refsBySource['buildings.occupants.url'] || 0) + 1; skip('FSA ratings page'); }
}
const branchRef = x => x.osm_id || (x.fhrs_id && 'fhrs/' + x.fhrs_id) || (x.cwg_url && 'cwg/' + x.cwg_url.split('/').filter(Boolean).pop()) || x.wikidata_item || x.name;
for (const x of BR) {
  const key = `branch:${x.brand_wikidata || x.brand}@${branchRef(x)}`;
  add(x.website, 'branches.website', key); add(x.cwg_website, 'branches.cwg_website', key);
  add(x.store_url, 'branches.store_url', key); add(x.cwg_archived || x.cwg_url, 'branches.cwg_archived', key);
}
for (const x of SL) add(x.store_url, 'storelocator.store_url', `branch:${x.brand_wikidata}@${x.branch_ref}`);
for (const d of CWG) { add(d.website, 'cwg-directory.website', `cwg:${d.slug}`); if (d.archived) add(d.archived, 'cwg-directory.archived', `cwg:${d.slug}`); }
for (const r of CHAR) if (r.website && r.status === 'registered') add(r.website, 'charities.website', r.id);
const ARCHIVED = u => /^https:\/\/web\.archive\.org\/web\/\d+\//.test(u);
const priorityOf = (u, e) => {
  if ([...e.refs].some(f => STORE_FIELD.test(f))) return 1;                          // shopfinder / store page
  const p = prior.get(u);
  if (!p || p.error || !(p.facts?.jsonld?.blocks || p.facts?.microdata_items)) return 2; // no facts from the plain crawl (or never crawled)
  return 3;
};
const all = [...urls.entries()].map(([u, e]) => ({ url: u, for: [...e.for].sort(), sources: [...e.refs].sort(), priority: ARCHIVED(u) ? 4 : priorityOf(u, e), host: new URL(u).host }));
if (args.has('--list')) {
  const by = all.reduce((o, x) => (o[x.priority] = (o[x.priority] || 0) + 1, o), {});
  console.log(JSON.stringify({ refsBySource, skipped, urls: all.length, hosts: new Set(all.map(x => x.host)).size, by_priority: by }, null, 1));
  process.exit(0);
}

// ---------------------------------------------------------------- 2. robots.txt (RFC 9309; same rules as crawl-sites.mjs)
function parseRobots(txt) {
  const groups = []; let cur = null, lastWasUA = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!lastWasUA) groups.push(cur = { agents: [], rules: [] }); cur.agents.push(v.toLowerCase()); lastWasUA = true; continue; }
    lastWasUA = false;
    if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({ allow: k === 'allow', path: v });
  }
  const mine = groups.filter(g => g.agents.some(a => a !== '*' && UA_TOKEN.startsWith(a.replace(/\/.*/, ''))));
  const pick = mine.length ? mine : groups.filter(g => g.agents.includes('*'));
  return pick.flatMap(g => g.rules).filter(r => r.path !== '' || !r.allow);
}
function robotsAllows(rules, path) {
  let best = null;
  for (const r of rules || []) {
    if (r.path === '') continue;
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}
const robots = new Map();
async function robotsFor(origin) {
  if (robots.has(origin)) return robots.get(origin);
  const host = new URL(origin).host, cached = join(CRAWL, host, 'robots.json'), mine = join(OUT_RAW, host, 'robots.json');
  for (const f of [mine, cached]) if (existsSync(f)) { const r = JSON.parse(readFileSync(f, 'utf8')); if (r.state !== 'unreachable') { r.from = f === cached ? 'crawl-sites cache' : 'render cache'; robots.set(origin, r); return r; } }
  const p = (async () => {
    let out;
    try {
      let url = origin + '/robots.txt', r;
      for (let hop = 0; hop < 5; hop++) {
        r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
        if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), url).href; continue; }
        break;
      }
      if (r.status >= 500) out = { state: 'unreachable', status: r.status, rules: null };
      else if (r.status >= 400) out = { state: 'none', status: r.status, rules: [] };
      else { const t = await r.text(); out = /<html|<!doctype/i.test(t.slice(0, 500)) ? { state: 'none', status: r.status, note: 'HTML instead of robots.txt', rules: [] } : { state: 'ok', status: r.status, rules: parseRobots(t) }; }
    } catch (e) { out = { state: 'unreachable', error: String(e?.cause?.code || e?.name || e).slice(0, 80), rules: null }; }
    if (out.state === 'unreachable' && browser) {           // some CDNs stall non-browser TLS clients: ask through Chromium
      const ctx = await browser.newContext({ userAgent: UA }); const pg = await ctx.newPage();
      try {
        const r = await pg.goto(origin + '/robots.txt', { timeout: CAP_MS, waitUntil: 'load' });
        const st = r?.status() ?? 0, t = st ? await r.text() : '';
        const via = { via: 'chromium', node_fetch_error: out.error };
        if (st >= 500 || !st) out = { state: 'unreachable', status: st || null, ...via, rules: null };
        else if (st >= 400) out = { state: 'none', status: st, ...via, rules: [] };
        else out = /<html|<!doctype/i.test(t.slice(0, 500)) ? { state: 'none', status: st, ...via, note: 'HTML instead of robots.txt', rules: [] } : { state: 'ok', status: st, ...via, rules: parseRobots(t) };
      } catch (e) { out.chromium_error = String(e.message || e).split('\n')[0].slice(0, 100); } finally { await ctx.close().catch(() => {}); }
    }
    out.fetched = new Date().toISOString(); out.from = 'fetched';
    mkdirSync(dirname(mine), { recursive: true }); writeFileSync(mine, JSON.stringify(out));
    return out;
  })();
  robots.set(origin, p); const v = await p; robots.set(origin, v); return v;
}
// why robots.txt could not be read: the site's own failure class (dns, tls, timeout...), else a 5xx (RFC 9309: disallow all)
const robotsWhy = r => { const e = String(r.chromium_error || r.node_fetch_error || r.error || ''); if (r.status === 502 && /CERT|SSL|TLS/i.test(e)) return 'tls';
  if (r.chromium_error || (!r.status && e)) { const c = errClass(e); return /ENOTFOUND|EAI_AGAIN/.test(e) ? 'dns' : /Timeout/i.test(e) ? 'timeout' : c; }
  return 'robots.txt ' + (r.status || '5xx') + ' (treated as disallow)'; };
const robotsCheck = async (u) => { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return { ok: true }; const r = await robotsFor(x.origin); if (r.state === 'unreachable') return { ok: false, why: robotsWhy(r), robots_unreachable: true }; return robotsAllows(r.rules, x.pathname + x.search) ? { ok: true } : { ok: false, why: 'robots disallowed' }; };

// ---------------------------------------------------------------- 3. render
const CHALLENGE = /Just a moment\.\.\.|cf-browser-verification|Attention Required! \| Cloudflare|_Incapsula_Resource|Incapsula incident|Request unsuccessful\. Incapsula|captcha-delivery\.com|px-captcha|perimeterx|Pardon Our Interruption|Access Denied<\/title>|errors\.edgesuite\.net|Checking your browser|Verifying you are human|Enable JavaScript and cookies to continue/i;
const CONSENT = ['#onetrust-accept-btn-handler', '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', '#CybotCookiebotDialogBodyButtonAccept', '#didomi-notice-agree-button', 'button#truste-consent-button', '.cc-allow', '#cookie-accept', 'button[data-cookiefirst-action="accept"]', '#hs-eu-confirmation-button', '.cmplz-accept', '#wt-cli-accept-all-btn', '#cookie_action_close_header', 'button.fc-cta-consent'];
const pathsFor = u => { const host = new URL(u).host; const h = sha1(u); return { dir: join(OUT_RAW, host), html: join(OUT_RAW, host, h + '.html.gz'), json: join(OUT_RAW, host, h + '.json') }; };
const sha256 = s => createHash('sha256').update(s).digest('hex');
const errClass = m => /ERR_NAME_NOT_RESOLVED/.test(m) ? 'dns' : /ERR_CERT|SSL|ERR_BAD_SSL/.test(m) ? 'tls' : /Timeout|timed? ?out|ERR_TIMED_OUT/i.test(m) ? 'timeout'
  : /ERR_CONNECTION|ERR_EMPTY_RESPONSE|ERR_SOCKET|ERR_NETWORK|ERR_TUNNEL|ERR_PROXY|ERR_HTTP2|ERR_ADDRESS/.test(m) ? 'connection' : /ERR_BLOCKED_BY_CLIENT|robots/.test(m) ? 'robots disallowed'
  : /ERR_HTTP_RESPONSE_CODE_FAILURE/.test(m) ? 'HTTP error status (no page body)' : /ERR_TOO_MANY_REDIRECTS/.test(m) ? 'too many redirects' : /ERR_ABORTED/.test(m) ? 'aborted (download or navigation cancelled)' : 'browser: ' + m.replace(/\s+/g, ' ').slice(0, 60);

let browser, staticCtx;
async function staticExtract(url, html) {               // the same extractor over the server HTML with scripts off and no network
  const page = await staticCtx.newPage();
  try {
    await page.route('**/*', r => r.request().url() === url && r.request().resourceType() === 'document' ? r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }) : r.abort());
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    return await page.evaluate(extractStructuredData);
  } catch (e) { return { error: String(e.message || e).split('\n')[0].slice(0, 120) }; } finally { await page.close().catch(() => {}); }
}
const hostNext = new Map();
async function hostSlot(host) { for (;;) { const t = hostNext.get(host) || 0; if (t <= Date.now()) { hostNext.set(host, Infinity); return; } await sleep(Math.min(t - Date.now(), 500)); } }   // a lock: held until hostDone
const hostDone = host => hostNext.set(host, Date.now() + HOST_GAP_MS);

async function renderOne(x) {
  const P = pathsFor(x.url);
  const rec = { url: x.url, fetched: new Date().toISOString(), method: 'chromium', for: x.for, sources: x.sources, priority: x.priority };
  if (ARCHIVED(x.url)) return archivedOne(x, rec, P);
  const rb = await robotsCheck(x.url);
  if (!rb.ok) return Object.assign(rec, { error: rb.why, detail: rb.robots_unreachable ? 'on robots.txt' : undefined });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'en-GB', viewport: { width: 1366, height: 900 }, serviceWorkers: 'block', acceptDownloads: false });
  const page = await ctx.newPage();
  const navs = [], blockedNav = [];
  let mainBody = null;
  await ctx.route('**/*', async route => {
    const req = route.request(), t = req.resourceType();
    if (t === 'image' || t === 'media' || t === 'font') return route.abort('blockedbyclient');
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
      const c = await robotsCheck(req.url()); if (!c.ok) { blockedNav.push(req.url()); return route.abort('blockedbyclient'); }
      navs.push(req.url());
    }
    return route.continue();
  });
  try {
    let resp, err = null;
    const t0 = Date.now();
    try { resp = await page.goto(x.url, { waitUntil: 'load', timeout: CAP_MS }); } catch (e) { err = String(e.message || e).split('\n')[0]; }
    if (err && !/Timeout/i.test(err)) { rec.error = blockedNav.length ? 'robots disallowed' : errClass(err); rec.detail = err.slice(0, 160); if (blockedNav.length) rec.robots_blocked = blockedNav[0]; return rec; }
    if (err) rec.load_timeout = true;
    try { await page.waitForLoadState('networkidle', { timeout: Math.max(1000, CAP_MS - (Date.now() - t0)) }); } catch { rec.networkidle_timeout = true; }
    await sleep(LATE_MS);
    if (resp) { rec.status = resp.status(); try { mainBody = (await resp.body()).toString('utf8'); } catch { mainBody = null; } rec.content_type = resp.headers()['content-type'] || null; }
    let out = await page.evaluate(extractStructuredData).catch(async e => { await sleep(2000); return page.evaluate(extractStructuredData); });
    if (!out.jsonld.length && !out.microdata.length) {          // cookie wall only: accept and look again
      for (const sel of CONSENT) {
        const b = await page.$(sel).catch(() => null);
        if (b && await b.isVisible().catch(() => false)) {
          await b.click({ timeout: 3000 }).catch(() => {}); rec.consent_clicked = sel;
          try { await page.waitForLoadState('networkidle', { timeout: 6000 }); } catch {}
          await sleep(LATE_MS); out = await page.evaluate(extractStructuredData); break;
        }
      }
    }
    const html = await page.content();
    rec.final_url = out.final_url; rec.title = (out.title || '').slice(0, 200); rec.lang = out.lang;
    rec.redirects = navs.length > 1 ? navs.slice(1) : undefined;
    rec.html_sha256 = sha256(html); rec.html_bytes = html.length;
    if (rec.status >= 400) rec.error = CHALLENGE.test(html.slice(0, 30000)) ? 'bot challenge' : rec.status === 401 || rec.status === 403 ? '401/403 refused' : rec.status === 404 || rec.status === 410 ? '404/410 not found' : rec.status === 429 ? '429' : rec.status >= 500 ? '5xx' : '4xx other';
    else if (CHALLENGE.test(html.slice(0, 30000)) && html.length < 80000 && !out.jsonld.length) rec.error = 'bot challenge';
    // server HTML of the same visit (the final response body); else the plain crawl's copy
    let server = mainBody, serverFrom = 'same visit';
    if (!server) {
      const pc = join(CRAWL, x.host, sha1(x.url) + '.html.gz');
      if (existsSync(pc)) { server = gunzipSync(readFileSync(pc)).toString('utf8'); serverFrom = 'crawl-sites cache'; }
    }
    let st = null;
    if (server && /html|xml/i.test(rec.content_type || 'text/html')) st = await staticExtract(out.final_url || x.url, server);
    rec.server_html_from = st && !st.error ? serverFrom : null;
    const norm = s => s.replace(/\s+/g, ' ').trim();
    const sJ = new Set((st?.jsonld || []).map(norm)), sM = new Set((st?.microdata || []).map(m => JSON.stringify(m))), sR = new Set((st?.rdfa_ntriples || '').split('\n').filter(Boolean).map(l => l.replace(/_:b\d+/g, '_:')));
    const known = !!(st && !st.error);
    rec.jsonld = out.jsonld.map(t => ({ text: t, origin: known ? (sJ.has(norm(t)) ? 'server' : 'script') : 'unknown' }));
    rec.microdata = out.microdata.map(m => ({ item: m, origin: known ? (sM.has(JSON.stringify(m)) ? 'server' : 'script') : 'unknown' }));
    rec.rdfa_ntriples = out.rdfa_ntriples; rec.rdfa_triples = out.rdfa_triples;
    if (out.rdfa_error) rec.rdfa_error = out.rdfa_error;
    rec.rdfa_script_only_triples = known ? out.rdfa_ntriples.split('\n').filter(Boolean).filter(l => !sR.has(l.replace(/_:b\d+/g, '_:'))).length : null;
    if (st?.error) rec.static_error = st.error;
    mkdirSync(P.dir, { recursive: true }); writeFileSync(P.html, gzipSync(html));
    return rec;
  } finally { await ctx.close().catch(() => {}); }
}
async function archivedOne(x, rec, P) {                   // Internet Archive copy saved by fetch-cwg.mjs: scripts off, no network
  const d = CWG.find(c => c.archived === x.url);
  const base = d && join(CW, 'data/raw/registry/cwg/pages', `${d.kind}__${d.slug}`);
  const file = d && [base + '.html', base + '.alt1.html', base + '.alt2.html', base + '.alt3.html'].find(f => existsSync(f) && !CHALLENGE.test(readFileSync(f, 'utf8').slice(0, 6000)));
  rec.method = 'fetch-cwg.mjs cache (Internet Archive id_ copy), read with scripts off and no network';
  if (!file) return Object.assign(rec, { error: 'no cached archive copy' });
  const html = readFileSync(file, 'utf8'), orig = x.url.replace(/^https:\/\/web\.archive\.org\/web\/\d+\//, '');
  const st = await staticExtract(orig, html);
  if (st.error) return Object.assign(rec, { error: 'static parse: ' + st.error });
  Object.assign(rec, { status: 200, final_url: x.url, base_url: orig, title: (st.title || '').slice(0, 200), lang: st.lang, html_sha256: sha256(html), html_bytes: html.length, server_html_from: 'archive copy',
    jsonld: st.jsonld.map(t => ({ text: t, origin: 'server' })), microdata: st.microdata.map(m => ({ item: m, origin: 'server' })), rdfa_ntriples: st.rdfa_ntriples, rdfa_triples: st.rdfa_triples, rdfa_script_only_triples: 0 });
  return rec;
}

// ---------------------------------------------------------------- 4. run the queue
const TRANSIENT = /timeout|connection|429|5xx|browser:|unreachable/;
const SFDIR = join(OUT_RAW, '_storefinder');
const now = () => new Date().toISOString();
// a page that never finishes (a streaming response body, a stuck evaluate) must not stall the queue
const withWatchdog = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('watchdog: page did not finish in ' + ms / 1000 + ' s (timeout)')), ms))]);
async function mainQueue() {
  let todo = all.filter(x => !opt('host') || x.host === opt('host')).filter(x => {
    if (args.has('--refresh')) return true;
    const P = pathsFor(x.url); if (!existsSync(P.json)) return true;
    const r = JSON.parse(readFileSync(P.json, 'utf8'));
    return args.has('--retry-failed') && r.error && TRANSIENT.test(r.error);
  }).sort((a, b) => a.priority - b.priority || a.host.localeCompare(b.host) || a.url.localeCompare(b.url));
  if (opt('limit')) todo = todo.slice(0, +opt('limit'));
  console.log(`${todo.length} URLs to render (${all.length} in scope)`);
  let done = 0; const busy = new Set();
  const take = () => {                                     // highest priority whose host is free
    const now = Date.now();
    let i = todo.findIndex(x => !busy.has(x.host) && (hostNext.get(x.host) || 0) <= now);
    if (i < 0) i = todo.findIndex(x => !busy.has(x.host));
    return i < 0 ? null : todo.splice(i, 1)[0];
  };
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (todo.length) {
      const x = take(); if (!x) { await sleep(200); continue; }
      busy.add(x.host);
      try {
        if (!ARCHIVED(x.url)) await hostSlot(x.host);
        let rec;
        try { rec = await withWatchdog(renderOne(x), 120000); } catch (e) { rec = { url: x.url, for: x.for, sources: x.sources, priority: x.priority, fetched: now(), error: errClass(String(e.message || e)), detail: String(e.message || e).slice(0, 160) }; }
        const P = pathsFor(x.url); mkdirSync(P.dir, { recursive: true }); writeFileSync(P.json, JSON.stringify(rec));
        if (++done % 10 === 0 || rec.error) console.log(`${done} ${((Date.now() - T0) / 1000).toFixed(0)}s p${x.priority} ${rec.error ? 'ERR ' + rec.error : 'ok ' + (rec.jsonld?.length || 0) + '/' + (rec.microdata?.length || 0) + '/' + (rec.rdfa_triples || 0)} ${x.url.slice(0, 90)}`);
      } finally { if (!ARCHIVED(x.url)) hostDone(x.host); busy.delete(x.host); }
    }
  }));
}

// ---------------------------------------------------------------- 4b. store finders: one UK postcode search per brand and postcode
// Owner, 2026-10-03: "we are permitted per industry convention to submit storefinder forms with UK postcodes".
// Only a store-finder search box, only the branch's postcode as input; no login, no other form; robots.txt for every
// navigation; the per-host gap between page loads. Brands: branches.json / storelocator.json branches with no store page
// that gave structured data. Brand site: Wikidata P856 (wikidata-brands.json, CC0), else the branch's website origin.
const safeDecode = s => { try { return decodeURIComponent(s); } catch { return s; } };
const pcNorm = s => (s || '').toUpperCase().replace(/\s+/g, '').replace(/^(.+)(\d[A-Z]{2})$/, '$1 $2');
function storefinderJobs() {
  const WDB = readJSON('registry/sources/brands/wikidata-brands.json').brands;
  const hasPage = key => all.some(x => x.for.includes(key) && x.sources.some(s => STORE_FIELD.test(s)) && (() => { const p = pathsFor(x.url).json; if (!existsSync(p)) return false; const r = JSON.parse(readFileSync(p, 'utf8')); return !r.error && (r.jsonld?.length || r.microdata?.length); })());
  const brands = new Map();
  const addB = (qid, name, key, postcode, place, website) => {
    if (!qid || hasPage(key)) return;
    const b = brands.get(qid) || brands.set(qid, { qid, name, sites: new Set(), byPc: new Map() }).get(qid);
    for (const w of [website, ...(WDB[qid]?.websites || [])].filter(Boolean)) { try { const u = new URL(/^https?:/.test(w) ? w : 'https://' + w); if (!/canarywharf\.com|facebook|instagram|wikipedia/.test(u.host)) b.sites.add(u.origin + '/'); } catch {} }
    const pc = pcNorm(postcode) || 'E14 4QT';
    const e = b.byPc.get(pc) || b.byPc.set(pc, { postcode: pc, fallback: !postcode, keys: new Set(), places: new Set() }).get(pc);
    e.keys.add(key); for (const p of place) if (p) e.places.add(p);
  };
  for (const x of BR) addB(x.brand_wikidata, x.brand, `branch:${x.brand_wikidata || x.brand}@${branchRef(x)}`, x.postcode, [x.mall, x.address, x.address_cwg], x.website);
  for (const x of SL) if (!x.ok) addB(x.brand_wikidata, x.brand, `branch:${x.brand_wikidata}@${x.branch_ref}`, x.postcode, [x.mall, x.branch_name], null);
  // the UK site first: a .uk host or a /uk, /en-gb path, then .com, then other country sites (Wikidata lists many)
  const siteRank = u => { const x = new URL(u); return /\.uk$/.test(x.hostname) || /^\/(uk|gb|en-gb|en_gb)(\/|$)/i.test(x.pathname) ? 0 : /\.(com|co|org|net|london|io)$/.test(x.hostname) ? 1 : 2; };
  return [...brands.values()].filter(b => b.sites.size).flatMap(b => [...b.byPc.values()].map(p => ({ qid: b.qid, brand: b.name, site: [...b.sites].sort((x, y) => siteRank(x) - siteRank(y))[0], postcode: p.postcode, postcode_fallback: p.fallback, brand_postcodes: b.byPc.size, keys: [...p.keys].sort(), places: [...p.places] })));
}
const FINDER_LINK = /store[-_ ]?(finder|locator)|shop[-_ ]?finder|branch[-_ ]?(finder|locator)|find[-_ ]?(a|an|your|my|us|the|our|nearest|local)?[-_ ]?(store|shop|restaurant|branch|location|cinema|hotel|gym|club|studio|salon|pharmacy|practice|bank|outlet|kitchen|cafe|coffee)s?|our[-_ ](stores|shops|restaurants|locations|branches|cafes|clubs|studios)|(^|\/)(stores|shops|restaurants|locations|branches|cafes|clubs|studios|venues|find-us)(\/|$|\?)/i;
const GUESS = ['/store-finder', '/store-locator', '/stores', '/locations', '/restaurants'];
async function linksOn(page) {
  return page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => {
    let card = a, t = ''; for (let i = 0; i < 4 && card.parentElement; i++) { card = card.parentElement; if ((card.innerText || '').length > 500) break; t = card.innerText || ''; }
    return { href: a.href, text: (a.innerText || a.getAttribute('aria-label') || a.title || '').replace(/\s+/g, ' ').trim().slice(0, 120), card: t.replace(/\s+/g, ' ').slice(0, 500) };
  })).catch(() => []);
}
const sameSite = (a, b) => { try { const x = new URL(a).hostname.split('.').slice(-2).join('.'), y = new URL(b).hostname.split('.').slice(-2).join('.'); return x === y; } catch { return false; } };
const PLACE_WORDS = /canary wharf|isle of dogs|south quay|crossrail place|jubilee place|cabot place|canada place|canada square|wood wharf|westferry|marsh wall|bank street|churchill place|limeharbour|millharbour|poplar|crossharbour|mudchute|heron quays|harbour exchange/i;
const placeParts = job => job.places.flatMap(p => String(p).toLowerCase().split(',')).map(w => w.trim().replace(/^(unit|units|kiosk|shop)\s+\S+\s*/, ''))
  .filter(w => w.length > 6 && !/^(canary wharf|london|e1\d|united kingdom|isle of dogs)$|^(mall |lower |upper |promenade |ground |plaza |retail )?(mall )?level\b|^(lower|upper) (ground|mall)/.test(w))
  .filter(w => { const b = String(job.brand || '').toLowerCase(); return !b || (!w.includes(b) && !b.includes(w)); });   // a branch name such as "Pret A Manger" is not a place
// the link's own text and URL count fully; the text around it (its card) only when the card is small (one store)
function scoreResult(l, job, finderUrl) {
  if (!/^https?:/.test(l.href) || l.href.split('#')[0] === finderUrl.split('#')[0] || !sameSite(l.href, job.site) || /google\.[a-z.]+\/maps|maps\.apple|tel:|mailto:/.test(l.href)) return 0;
  const own = (l.text + ' ' + safeDecode(l.href).replace(/[-_/]+/g, ' ')).toLowerCase(), card = l.card.length <= 300 ? l.card.toLowerCase() : '';
  const pc = job.postcode.toLowerCase(), pcs = [pc, pc.replace(' ', '')], one = job.brand_postcodes <= 1, parts = placeParts(job);
  const has = (h, xs) => xs.some(x => h.includes(x));
  let s = 0;
  if (has(own, pcs)) s += 5; else if (has(card, pcs)) s += 4;
  if (/canary[ -]?wharf/.test(own)) s += one ? 3 : 1; else if (/canary[ -]?wharf/.test(card)) s += one ? 2 : 0;
  if (has(own, parts)) s += 3; else if (has(card, parts)) s += 2;
  if (s && /(store|shop|location|restaurant|branch|stores|locations|venue|cafe|l)\//i.test(new URL(l.href).pathname + '/')) s += 1;
  return s;
}
// does the rendered branch page name the branch? postcode, a street or mall phrase, or Canary Wharf in title, URL or structured data
function namesBranch(rec, job) {
  const hay = [rec.title, rec.final_url && safeDecode(rec.final_url).replace(/[-_/]+/g, ' '), ...(rec.jsonld || []).map(b => b.text), JSON.stringify((rec.microdata || []).map(m => m.item))].join(' ').toLowerCase();
  if (hay.includes(job.postcode.toLowerCase()) || hay.includes(job.postcode.toLowerCase().replace(' ', ''))) return 'postcode';
  if (placeParts(job).some(w => hay.includes(w))) return 'street or mall';
  if (/canary[ -]?wharf/.test(hay)) return 'Canary Wharf';
  return null;
}
async function consent(page) {
  for (const sel of CONSENT) { const b = await page.$(sel).catch(() => null); if (b && await b.isVisible().catch(() => false)) { await b.click({ timeout: 3000 }).catch(() => {}); await sleep(800); return sel; } }
  const h = await page.evaluateHandle(() => [...document.querySelectorAll('button, [role=button], a[href="#"]')].find(b => b.offsetParent && /^\s*(accept( all)?( cookies)?|allow( all)?( cookies)?|i agree|agree|accept & close|ok,? got it)\s*$/i.test(b.innerText || ''))).catch(() => null);
  const el = h?.asElement(); if (el) { await el.click({ timeout: 3000 }).catch(() => {}); await sleep(800); return 'button text: accept'; }
  return null;
}
const findInput = (page) => page.evaluateHandle(() => {
  const bad = /e-?mail|newsletter|password|promo|voucher|gift|coupon|name|phone|card|login|sign/i;
  const ins = [...document.querySelectorAll('input')].filter(i => (i.type === 'text' || i.type === 'search' || !i.getAttribute('type')) && i.offsetParent !== null && !i.disabled && !i.readOnly);
  const lab = i => [i.placeholder, i.getAttribute('aria-label'), i.name, i.id, i.labels?.[0]?.innerText, i.closest('form')?.getAttribute('action'), i.closest('form, [role=search], [class*=finder], [class*=locator]')?.className].join(' ');
  const sc = i => { const t = lab(i); if (bad.test(t) && !/post ?code|location|town/i.test(t)) return -1; return (/post ?code|postal|town|city|location|address|near/i.test(t) ? 3 : 0) + (/post ?code|postal|town|city|location|address|zip|near|store|shop|search|where/i.test(t) ? 1 : 0); };
  return ins.map(i => [sc(i), i]).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0])[0]?.[1] || null;
}).then(h => h.asElement()).catch(() => null);
async function storefinderOne(job) {
  const out = { ...job, fetched: now(), steps: [] };
  const ctx = await browser.newContext({ userAgent: UA, locale: 'en-GB', viewport: { width: 1366, height: 900 }, serviceWorkers: 'block', acceptDownloads: false });
  const page = await ctx.newPage(); let blocked = null;
  await ctx.route('**/*', async route => {
    const req = route.request(), t = req.resourceType();
    if (t === 'image' || t === 'media' || t === 'font') return route.abort('blockedbyclient');
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) { const c = await robotsCheck(req.url()); if (!c.ok) { blocked = req.url(); return route.abort('blockedbyclient'); } }
    return route.continue();
  });
  const go = async (u) => { const h = new URL(u).host; await hostSlot(h); try { const r = await page.goto(u, { waitUntil: 'load', timeout: CAP_MS }); await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); out.steps.push({ goto: u, status: r?.status() ?? null }); return r; } catch (e) { out.steps.push({ goto: u, error: blocked === u ? 'robots disallowed' : errClass(String(e.message)) }); return null; } finally { hostDone(h); } };
  const bestLink = async (finderUrl) => (await linksOn(page)).map(l => ({ ...l, s: scoreResult(l, job, finderUrl) })).filter(l => l.s >= 3).sort((a, b) => b.s - a.s)[0];
  try {
    // 1. finder candidates (cached per brand): store-finder links on the home page, else a few common paths
    const cacheF = join(SFDIR, job.qid + '.finder.json');
    let finder = existsSync(cacheF) ? JSON.parse(readFileSync(cacheF, 'utf8')) : null;
    if (!finder || !finder.cands || finder.site !== job.site) {
      finder = { cands: [] };
      const r = await go(job.site);
      if (r && r.status() < 400) {
        await consent(page);
        const seen = new Set();
        const cands = (await linksOn(page)).filter(l => sameSite(l.href, job.site) && (FINDER_LINK.test(l.text) || FINDER_LINK.test(new URL(l.href).pathname)))
          .filter(l => { const k = l.href.split('#')[0]; if (seen.has(k) || k === page.url().split('#')[0]) return false; seen.add(k); return true; });
        cands.sort((a, b) => (/finder|locator|find/i.test(b.text + b.href) - /finder|locator|find/i.test(a.text + a.href)));
        finder.cands = cands.slice(0, 3).map(c => ({ url: c.href.split('#')[0], how: 'home page link: ' + c.text.slice(0, 60) }));
      }
      if (!finder.cands.length) for (const g of GUESS) { const u = new URL(g, job.site).href; const r2 = await go(u); if (r2 && r2.status() < 400 && sameSite(page.url(), job.site)) { finder.cands.push({ url: page.url(), how: 'common path ' + g }); break; } }
      mkdirSync(SFDIR, { recursive: true }); writeFileSync(cacheF, JSON.stringify({ ...finder, site: job.site, fetched: now() }));
    }
    if (!finder.cands.length) return Object.assign(out, { outcome: 'no store finder found' });
    // 2. each candidate: a link to the branch already listed there needs no form
    let best = null, withInput = null;
    for (const c of finder.cands) {
      const fr = await go(c.url);
      if (!fr || fr.status() >= 400) continue;
      const cs = await consent(page); if (cs) out.consent_clicked = cs;
      best = await bestLink(c.url);
      if (best) { out.finder_url = c.url; out.finder_how = c.how; out.via = { method: 'storefinder-list', finder_url: c.url, postcode: null }; break; }
      if (!withInput && await findInput(page)) withInput = c;
    }
    if (!best) {
      if (!withInput) return Object.assign(out, { outcome: out.steps.some(s => s.status && s.status < 400) ? 'no postcode search box on the store finder' : 'store finder did not load', finder_url: finder.cands[0].url });
      // 3. the search box: type the postcode key by key, choose the first suggestion if a list appears, else press Enter
      out.finder_url = withInput.url; out.finder_how = withInput.how;
      if (page.url().split('#')[0] !== withInput.url) { await go(withInput.url); await consent(page); }
      const el = await findInput(page);
      if (!el) return Object.assign(out, { outcome: 'no postcode search box on the store finder' });
      out.input = await el.evaluate(i => ({ placeholder: i.placeholder || null, name: i.name || null, id: i.id || null }));
      const host = new URL(withInput.url).host;
      await hostSlot(host);
      try {
        await el.click({ timeout: 4000 }).catch(() => {});
        if (page.url().split('#')[0] !== withInput.url) { await page.waitForLoadState('load').catch(() => {}); }   // some boxes open a search page
        const el2 = (await findInput(page)) || el;
        await el2.fill('').catch(() => {});
        await el2.type(job.postcode, { delay: 90 }).catch(() => {});
        const OPT = '[role="option"]:visible, .pac-item:visible, [role="listbox"] li:visible, [class*="suggestion"] li:visible, [class*="autocomplete"] li:visible';
        await page.waitForSelector(OPT, { timeout: 3500 }).catch(() => {});
        const opt1 = await page.$(OPT).catch(() => null);
        if (opt1) { out.suggestion = (await opt1.innerText().catch(() => '')).slice(0, 80); await opt1.click({ timeout: 3000 }).catch(() => {}); await sleep(500); }
        if (!opt1) await el2.press('Enter').catch(() => {});
        try { await page.waitForLoadState('load', { timeout: 10000 }); await page.waitForLoadState('networkidle', { timeout: 12000 }); } catch {}
        await sleep(2500);
      } finally { hostDone(host); }
      out.search_result_url = page.url();
      out.via = { method: 'storefinder-search', finder_url: withInput.url, postcode: job.postcode, postcode_fallback: job.postcode_fallback };
      if (blocked) return Object.assign(out, { outcome: 'robots disallowed the results page', robots_blocked: blocked });
      best = await bestLink(withInput.url);
      if (!best) {
        const txt = (await page.evaluate(() => document.body?.innerText || '').catch(() => '')).toLowerCase();
        const named = txt.includes(job.postcode.toLowerCase()) || /canary wharf/.test(txt);
        if (named && page.url() !== withInput.url) best = { href: page.url(), text: '(results page)', s: 1 };
        else return Object.assign(out, { outcome: named ? 'results name the place but give no branch link' : 'no branch in the results' });
      }
    }
    out.result_url = best.href; out.result_link_text = best.text; out.result_score = best.s;
    await ctx.close().catch(() => {});
    const rh = new URL(best.href).host;
    await hostSlot(rh);
    let rec; try { rec = await renderOne({ url: best.href, for: job.keys, sources: ['storefinder:' + out.via.method], priority: 0, host: rh }); } finally { hostDone(rh); }
    rec.via = out.via;
    out.names_branch = rec.error ? null : namesBranch(rec, job);
    out.outcome = rec.error ? 'branch page failed: ' + rec.error : out.names_branch ? 'branch page rendered, names the branch (' + out.names_branch + ')' : 'page rendered, does not name the branch';
    return { out, rec };
  } finally { await ctx.close().catch(() => {}); }
}
async function storefinderPhase() {
  const jobs = storefinderJobs().filter(j => !opt('brand') || j.qid === opt('brand'));
  const todo = jobs.filter(j => { const f = join(SFDIR, `${j.qid}__${j.postcode.replace(' ', '')}.json`); return args.has('--refresh') || !existsSync(f) || JSON.parse(readFileSync(f, 'utf8')).site !== j.site; });
  console.log(`store finder: ${jobs.length} brand+postcode searches (${new Set(jobs.map(j => j.qid)).size} brands), ${todo.length} to do`);
  mkdirSync(SFDIR, { recursive: true });
  // jobs of one brand run in sequence (they share a finder and a host); brands run PARALLEL at once
  const byBrand = new Map(); for (const j of todo) (byBrand.get(j.qid) || byBrand.set(j.qid, []).get(j.qid)).push(j);
  const queue = [...byBrand.values()]; let n = 0;
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    for (let q; (q = queue.shift());) for (const j of q) {
      let res;
      try { res = await withWatchdog(storefinderOne(j), 240000); } catch (e) { res = { ...j, fetched: now(), outcome: 'error', error: errClass(String(e.message || e)), detail: String(e.message || e).slice(0, 160) }; }
      const out = res.out || res, base = join(SFDIR, `${j.qid}__${j.postcode.replace(' ', '')}`);
      writeFileSync(base + '.json', JSON.stringify(out));
      if (res.rec) writeFileSync(base + '.page.json', JSON.stringify(res.rec)); else if (existsSync(base + '.page.json')) rmSync(base + '.page.json');
      console.log(`sf ${++n}/${todo.length} ${j.brand} ${j.postcode}: ${out.outcome}${out.result_url ? ' → ' + out.result_url.slice(0, 80) : ''}`);
    }
  }));
}

// ---------------------------------------------------------------- run
if (args.has('--list-missing')) { for (const x of all) if (!existsSync(pathsFor(x.url).json)) console.log(x.priority, x.url); process.exit(0); }
if (!args.has('--build-only')) {
  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
  staticCtx = await browser.newContext({ javaScriptEnabled: false, userAgent: UA });
  if (!args.has('--storefinder-only')) await mainQueue();
  if (args.has('--storefinder') || args.has('--storefinder-only')) await storefinderPhase();
  await browser.close();
}
// ---------------------------------------------------------------- 5. the committed copy: third_party/cwplans-structured-data/
const recs = all.map(x => { const p = pathsFor(x.url).json; return existsSync(p) ? { ...JSON.parse(readFileSync(p, 'utf8')), for: x.for, sources: x.sources, priority: x.priority } : null; }).filter(Boolean);
for (const r of recs) {
  if (r.error && /^browser: /.test(r.error)) r.error = errClass(r.detail || r.error);
  if (r.error === 'robots.txt unreachable (treated as disallow)') { const f = join(OUT_RAW, new URL(r.url).host, 'robots.json'); if (existsSync(f)) { r.error = robotsWhy(JSON.parse(readFileSync(f, 'utf8'))); r.detail = 'on robots.txt'; } }
}
// store-finder results: one record per brand and postcode; the branch page joins the pages (priority 0)
const sfOut = [];
if (existsSync(SFDIR)) for (const f of readdirSync(SFDIR).filter(f => /__.*\.json$/.test(f) && !f.endsWith('.page.json'))) {
  const o = JSON.parse(readFileSync(join(SFDIR, f), 'utf8')); sfOut.push(o);
  const pf = join(SFDIR, f.replace(/\.json$/, '.page.json'));
  if (existsSync(pf)) { const r = JSON.parse(readFileSync(pf, 'utf8')); recs.push({ ...r, url: r.url, priority: 0, sources: ['storefinder:' + (o.via?.method || 'search')], via: { ...o.via, brand: o.qid, result_link_text: o.result_link_text } }); }
}
const meta = { urls_in_scope: all.length, attempted: recs.length, rendered_ok: 0, archived_copies_read: 0, failures_by_class: {}, with_jsonld: 0, with_microdata: 0, with_rdfa: 0, with_rdfa_schema_org: 0,
  jsonld_blocks: 0, microdata_items: 0, rdfa_triples: 0, jsonld_only_after_scripts_pages: 0, microdata_only_after_scripts_pages: 0, rdfa_only_after_scripts_pages: 0, jsonld_blocks_after_scripts: 0, microdata_items_after_scripts: 0,
  blocks_dropped_over_200kB: 0, consent_clicked: 0, by_priority: {}, by_source_field: {}, hosts: new Set() };
const byHost = new Map(), index = [];
for (const r of recs) {
  const pr = meta.by_priority[r.priority] ||= { urls: 0, ok: 0, with_structured_data: 0 }; pr.urls++;
  const ix = { url: r.url, priority: r.priority, final_url: r.final_url || null, status: r.status ?? null, error: r.error || null };
  index.push(ix);
  if (r.error) { meta.failures_by_class[r.error] = (meta.failures_by_class[r.error] || 0) + 1; continue; }
  meta.rendered_ok++; pr.ok++; if (r.method !== 'chromium') meta.archived_copies_read++;
  if (r.consent_clicked) meta.consent_clicked++;
  const jl = [], md = [];
  for (const b of r.jsonld || []) { if (b.text.length > MAX_BLOCK) { meta.blocks_dropped_over_200kB++; continue; } jl.push(b); }
  for (const m of r.microdata || []) { if (JSON.stringify(m.item).length > MAX_BLOCK) { meta.blocks_dropped_over_200kB++; continue; } md.push(m); }
  let rdfa = r.rdfa_ntriples || ''; if (rdfa.length > MAX_BLOCK) { meta.blocks_dropped_over_200kB++; rdfa = ''; }
  const rdfaSchema = /<https?:\/\/schema\.org\//.test(rdfa);
  if (jl.length) meta.with_jsonld++; if (md.length) meta.with_microdata++; if (rdfa) meta.with_rdfa++; if (rdfaSchema) meta.with_rdfa_schema_org++;
  meta.jsonld_blocks += jl.length; meta.microdata_items += md.length; meta.rdfa_triples += rdfa ? rdfa.split('\n').length : 0;
  const jAfter = jl.filter(b => b.origin === 'script').length, mAfter = md.filter(b => b.origin === 'script').length;
  meta.jsonld_blocks_after_scripts += jAfter; meta.microdata_items_after_scripts += mAfter;
  if (jl.length && jAfter === jl.length) meta.jsonld_only_after_scripts_pages++;
  if (md.length && mAfter === md.length) meta.microdata_only_after_scripts_pages++;
  if (rdfa && r.rdfa_script_only_triples && r.rdfa_script_only_triples === r.rdfa_triples) meta.rdfa_only_after_scripts_pages++;
  if (jl.length || md.length || rdfaSchema) pr.with_structured_data++;
  for (const s of r.sources) { const f = meta.by_source_field[s] ||= { urls: 0, with_structured_data: 0 }; f.urls++; if (jl.length || md.length || rdfaSchema) f.with_structured_data++; }
  ix.jsonld = jl.length; ix.microdata = md.length; ix.rdfa_triples = rdfa ? rdfa.split('\n').length : 0;
  const host = new URL(r.url).host; meta.hosts.add(host);
  const row = { url: r.url, final_url: r.final_url, base_url: r.base_url || undefined, fetched: r.fetched, status: r.status, method: r.method, title: r.title || undefined, lang: r.lang || undefined, html_sha256: r.html_sha256,
    server_html_from: r.server_html_from || undefined, entity_keys: r.for, sources: r.sources, jsonld_raw: jl.map(b => b.text), jsonld_origin: jl.map(b => b.origin), microdata: md.map(m => m.item), microdata_origin: md.map(m => m.origin),
    rdfa_ntriples: rdfa, rdfa_script_only_triples: r.rdfa_script_only_triples ?? undefined, consent_clicked: r.consent_clicked || undefined, via: r.via || undefined };
  (byHost.get(host) || byHost.set(host, []).get(host)).push(row);
}
meta.hosts = meta.hosts.size;
if (existsSync(join(TP, 'pages'))) rmSync(join(TP, 'pages'), { recursive: true });
mkdirSync(join(TP, 'pages'), { recursive: true });
for (const [host, rows] of byHost) writeFileSync(join(TP, 'pages', host.replace(/[^\w.-]/g, '_') + '.jsonl'), rows.sort((a, b) => a.url.localeCompare(b.url)).map(r => JSON.stringify(r)).join('\n') + '\n');
const dates = recs.map(r => r.fetched).filter(Boolean).sort();
writeFileSync(join(TP, 'index.json'), JSON.stringify({
  generated: new Date().toISOString(), tool: 'cwplans/tools/render-structured-data.mjs', rendered_between: [dates[0], dates[dates.length - 1]], user_agent: UA,
  url_references_by_source: refsBySource, skipped_references: skipped, counts: meta,
  storefinder: sfOut.length ? { searches: sfOut.length, brands: new Set(sfOut.map(o => o.qid)).size, by_outcome: sfOut.reduce((a, o) => (a[o.outcome] = (a[o.outcome] || 0) + 1, a), {}),
    by_method: sfOut.filter(o => o.via).reduce((a, o) => (a[o.via.method] = (a[o.via.method] || 0) + 1, a), {}),
    runs: sfOut.map(o => ({ brand: o.brand, qid: o.qid, postcode: o.postcode, postcode_fallback: o.postcode_fallback || undefined, site: o.site, finder_url: o.finder_url, finder_how: o.finder_how, via: o.via?.method, input: o.input, outcome: o.outcome, result_url: o.result_url, keys: o.keys })).sort((a, b) => (a.brand || '').localeCompare(b.brand || '') || a.postcode.localeCompare(b.postcode)) } : undefined,
  pages: index.sort((a, b) => a.url.localeCompare(b.url)),
}));
console.log(JSON.stringify({ ...meta, seconds: Math.round((Date.now() - T0) / 1000) }, null, 1));
