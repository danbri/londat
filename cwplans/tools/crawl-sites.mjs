#!/usr/bin/env node
// Crawl the web pages the registry already links to, and extract structured facts from each.
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/crawl-sites.mjs            # fetch what is not cached, then extract
//   ... --list           count the URLs by source and stop (no network)
//   ... --no-fetch       extract from the cache only
//   ... --refresh        fetch every URL again
//   ... --host=h         crawl and print one host only (no output files)
//   ... --retry-failed   fetch again the URLs whose last attempt failed with a transient error (timeout, 429, 5xx, reset)
// URL sources (read only): registry/buildings.json occupants (website, store_url, cwg_archived),
// registry/sources/brands/{branches,storelocator,cwg-directory}.json. FSA ratings pages, OSM, Wikidata, Wikipedia,
// Companies House and Land Registry links are skipped (that data comes from their APIs or is share-alike).
// canarywharf.com blocks scripts (Imperva), so its pages are read as Internet Archive copies; copies that
// registry/sources/brands/tools/fetch-cwg.mjs already saved in data/raw/registry/cwg/pages are reused.
// Politeness: robots.txt (RFC 9309) per host, one request at a time per host, >= 1.5 s between requests to a host,
// at most 4 hosts at once, backoff on 429 and 5xx, 20 s timeout.
// Raw pages: data/raw/crawl/<host>/<hash>.html.gz + <hash>.json (not committed).
// Out: registry/sources/web/site-facts.json, discovered-feeds.json. README: registry/sources/web/README.md.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { gzipSync, gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const CW = join(dirname(fileURLToPath(import.meta.url)), '..');
const CRAWL = join(CW, 'data/raw/crawl');
const OUTDIR = join(CW, 'registry/sources/web');
const UA = 'glitchcan-cwplans/0.1 (https://github.com/danbri/glitchcan-minigam)';
const UA_TOKEN = 'glitchcan-cwplans';
const GAP_MS = 1500, TIMEOUT_MS = 20000, HOSTS_PARALLEL = 4, MAX_REDIRECTS = 8, MAX_TRIES = 4;
const args = new Set(process.argv.slice(2));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJSON = p => JSON.parse(readFileSync(join(CW, p), 'utf8'));
const sha = s => createHash('sha1').update(s).digest('hex').slice(0, 16);
const T0 = Date.now();

// ---------------------------------------------------------------- 1. URLs and the entries they serve
const WB = 'https://web.archive.org';
const B = readJSON('registry/buildings.json').buildings;
const BR = readJSON('registry/sources/brands/branches.json').branches;
const SL = readJSON('registry/sources/brands/storelocator.json').checked;
const CWG = readJSON('registry/sources/brands/cwg-directory.json').directory;

const urls = new Map();            // url -> { refs: Set(source field), for: Set(key), places: [{postcodes, phrases}] }
const skipped = {};                // reason -> count of references
const refsBySource = {};
const cwgByUrl = new Map(CWG.filter(d => d.archived).map(d => [d.cwg_url, d]));
const skip = (reason) => { skipped[reason] = (skipped[reason] || 0) + 1; };
function add(raw, field, key, place) {
  if (!raw || typeof raw !== 'string') return;
  refsBySource[field] = (refsBySource[field] || 0) + 1;
  let u = raw.trim().replace(/ \(closest capture\)$/, '');
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u.replace(/^\/+/, '');
  let p; try { p = new URL(u); } catch { return skip('not a URL'); }
  const h = p.hostname.replace(/^www\./, '');
  if (/(^|\.)food\.gov\.uk$/.test(h)) return skip('FSA ratings page (data from the FSA API)');
  if (/(^|\.)canarywharf\.com$/.test(h)) {              // live site answers scripts with a bot challenge
    const d = cwgByUrl.get(p.href) || cwgByUrl.get(p.href + '/');
    if (!d) return skip('canarywharf.com page with no archived copy (live site blocks scripts)');
    u = d.archived; field = field + '→archived';
  }
  const e = urls.get(u) || urls.set(u, { refs: new Set(), for: new Set(), places: [] }).get(u);
  e.refs.add(field); e.for.add(key);
  if (place) e.places.push(place);
}
const place = (...parts) => {
  const flat = parts.flat(Infinity).filter(x => typeof x === 'string' && x.trim());
  const postcodes = [...new Set(flat.flatMap(s => s.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi) || []).map(s => s.toUpperCase().replace(/\s+/, ' ').replace(/^(\S+?)(\d[A-Z]{2})$/, '$1 $2')))];
  return { postcodes, phrases: phrasesOf(flat) };
};
const GENERIC = /^(canary wharf|london|isle of dogs|docklands|united kingdom|uk|england|greater london|tower hamlets|poplar|e14|e16|millwall|cubitt town|limehouse|blackwall)$/;
function phrasesOf(strings) {
  const out = new Set();
  for (const s of strings) for (let part of s.split(/[,|\n]/)) {
    part = part.toLowerCase().replace(/[’']/g, "'").replace(/\b[a-z]{1,2}\d[a-z\d]?\s?\d[a-z]{2}\b/g, '')
      .replace(/^\s*(unit|units|kiosk|shop|suite|flat|floor|level|mall level)\s*[-\w./]*\s*/, '')
      .replace(/^[\s\d\-–/&,.a-z]{0,6}?(?=\d)/, '').replace(/^[\d\-–/&a-z]{0,5}\d[a-z]?\s+/, '').replace(/\s+/g, ' ').trim();
    if (part.length < 8 || part.split(' ').length < 2 || GENERIC.test(part) || /^(mall )?level\b|^(lower|upper) ground|^ground floor/.test(part)) continue;
    out.add(part);
  }
  return [...out];
}
for (const b of B) {
  for (const o of b.occupants || []) {
    const key = `${b.id}|${o.name}`;
    const pl = place(o.postcode, o.address, o.mall, b.postcodes, b.address, b.name);
    add(o.website, 'buildings.occupants.website', key, pl);
    add(o.store_url, 'buildings.occupants.store_url', key, pl);
    add(o.cwg_archived || o.cwg_url, 'buildings.occupants.cwg_archived', key, pl);
    if (o.url) { refsBySource['buildings.occupants.url'] = (refsBySource['buildings.occupants.url'] || 0) + 1; skip('FSA ratings page (data from the FSA API)'); }
  }
  for (const [k, v] of Object.entries(b.links || {})) for (const _ of [].concat(v)) {
    refsBySource['buildings.links.' + k] = (refsBySource['buildings.links.' + k] || 0) + 1;
    skip({ osm: 'OSM element page (data from the OSM extract)', wikidata: 'Wikidata page (data from QLever)', wikipedia: 'Wikipedia page (CC BY-SA, share-alike; not copied)',
      companies_house_by_postcode: 'Companies House search page (data from the bulk file)', land_registry_price_paid_by_postcode: 'Land Registry search page (data from the bulk file)' }[k] || 'building link of another kind');
  }
}
const branchRef = x => x.osm_id || (x.fhrs_id && 'fhrs/' + x.fhrs_id) || (x.cwg_url && 'cwg/' + x.cwg_url.split('/').filter(Boolean).pop()) || x.wikidata_item || x.name;
for (const x of BR) {
  const key = `branch:${x.brand_wikidata || x.brand}@${branchRef(x)}`;
  const pl = place(x.postcode, x.address, x.address_cwg, x.mall);
  add(x.website, 'branches.website', key, pl);
  add(x.cwg_website, 'branches.cwg_website', key, pl);
  add(x.store_url, 'branches.store_url', key, pl);
  add(x.cwg_archived || x.cwg_url, 'branches.cwg_archived', key, pl);
}
for (const x of SL) add(x.store_url, 'storelocator.store_url', `branch:${x.brand_wikidata}@${x.branch_ref}`, place(x.postcode, x.mall, x.branch_name));
for (const d of CWG) {
  const key = `cwg:${d.slug}`;
  const pl = place(d.postcode, d.address_lines, d.mall);
  add(d.website, 'cwg-directory.website', key, pl);
  if (d.archived) add(d.archived, 'cwg-directory.archived', key, pl);
  else { refsBySource['cwg-directory.archived'] = (refsBySource['cwg-directory.archived'] || 0) + 1; skip('CWG entry with no archived copy'); }
}
if (args.has('--list')) {
  const hosts = new Set([...urls.keys()].map(u => new URL(u).host));
  console.log(JSON.stringify({ refsBySource, skipped, unique_urls: urls.size, hosts: hosts.size }, null, 1));
  process.exit(0);
}

// ---------------------------------------------------------------- 2. polite fetching
const hostLast = new Map(), hostLock = new Map();
async function hostTurn(host, fn) {                     // one request at a time per host, GAP_MS apart
  const prev = hostLock.get(host) || Promise.resolve();
  let release; const p = new Promise(r => (release = r));
  hostLock.set(host, prev.then(() => p));
  await prev;
  try {
    const wait = (hostLast.get(host) || 0) + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    return await fn();
  } finally { hostLast.set(host, Date.now()); release(); }
}
const errClass = e => {
  const c = e?.cause?.code || e?.code || '', m = String(e?.cause?.message || e?.message || e);
  if (e?.name === 'TimeoutError' || /timeout/i.test(c + m)) return 'timeout';
  if (/ENOTFOUND|EAI_AGAIN/.test(c + m)) return 'dns';
  if (/CERT|SSL|TLS|self.signed|UNABLE_TO_VERIFY/i.test(c + m)) return 'tls';
  if (/ECONNRESET|ECONNREFUSED|UND_ERR_SOCKET|EPIPE|closed|reset|cancel/i.test(c + m)) return 'connection';
  return 'network: ' + (c || m).slice(0, 60);
};
async function request(url, { accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' } = {}) {
  const host = new URL(url).host;
  let last;
  for (let i = 0; i < MAX_TRIES; i++) {
    last = await hostTurn(host, async () => {
      try {
        const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': UA, accept, 'accept-language': 'en-GB,en;q=0.8' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        const body = r.status >= 300 && r.status < 400 ? Buffer.alloc(0) : Buffer.from(await r.arrayBuffer());
        return { status: r.status, headers: Object.fromEntries(r.headers), body };
      } catch (e) { return { error: errClass(e), detail: String(e?.cause?.code || e?.message || e).slice(0, 120) }; }
    });
    const transient = last.error ? ['timeout', 'connection'].includes(last.error) : (last.status === 429 || last.status >= 500);
    if (!transient || i === MAX_TRIES - 1) break;
    const ra = Number(last.headers?.['retry-after']);
    await sleep(Math.min(60000, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 4000 * 3 ** i));
  }
  return last;
}
// robots.txt, RFC 9309: our token's group, else *; longest match wins, Allow wins a tie; 4xx = allow all; 5xx or unreachable = disallow all
const robots = new Map();
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
  for (const r of rules) {
    if (r.path === '') continue;                         // "Disallow:" with no path allows everything
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}
async function robotsFor(origin) {
  if (robots.has(origin)) return robots.get(origin);
  const file = join(CRAWL, new URL(origin).host, 'robots.json');
  if (!args.has('--refresh') && existsSync(file)) { const r = JSON.parse(readFileSync(file, 'utf8')); if (r.state !== 'unreachable' || !args.has('--retry-failed')) { robots.set(origin, r); return r; } }
  const p = (async () => {
    let r = await request(origin + '/robots.txt', { accept: 'text/plain,*/*;q=0.5' }), hops = 0;
    while (r.status >= 300 && r.status < 400 && r.headers.location && hops++ < 5) {
      const next = new URL(r.headers.location, origin + '/robots.txt').href; r = await request(next, { accept: 'text/plain,*/*;q=0.5' });
    }
    let out;
    if (r.error || r.status >= 500) out = { state: 'unreachable', status: r.status || null, error: r.error || null, rules: null };
    else if (r.status >= 400) out = { state: 'none', status: r.status, rules: [] };
    else { const txt = r.body.toString('utf8'); out = /<html|<!doctype/i.test(txt.slice(0, 500)) ? { state: 'none', status: r.status, note: 'HTML instead of robots.txt', rules: [] } : { state: 'ok', status: r.status, rules: parseRobots(txt) }; }
    out.fetched = new Date().toISOString();
    mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(out));
    return out;
  })();
  robots.set(origin, p);
  const v = await p; robots.set(origin, v); return v;
}
const CHALLENGE = /Just a moment\.\.\.|cf-browser-verification|Attention Required! \| Cloudflare|_Incapsula_Resource|Incapsula incident|Request unsuccessful\. Incapsula|captcha-delivery\.com|px-captcha|perimeterx|Pardon Our Interruption|Access Denied<\/title>|errors\.edgesuite\.net|Checking your browser/i;
const archiveRaw = u => u.replace(/^(https:\/\/web\.archive\.org\/web\/\d+)(\/)/, '$1id_$2');
const pathsFor = u => { const host = new URL(u).host; const h = sha(u); return { dir: join(CRAWL, host), body: join(CRAWL, host, h + '.html.gz'), meta: join(CRAWL, host, h + '.json') }; };

async function crawl(url) {
  const P = pathsFor(url);
  if (!args.has('--refresh') && existsSync(P.meta)) {
    const m = JSON.parse(readFileSync(P.meta, 'utf8'));
    const transient = m.error_class && /timeout|connection|429|5xx|robots unreachable|network/.test(m.error_class);
    if (!(transient && args.has('--retry-failed'))) return m;
  }
  mkdirSync(P.dir, { recursive: true });
  const meta = { url, requested: null, final_url: null, status: null, fetched: new Date().toISOString(), method: 'live', redirects: [] };
  // reuse fetch-cwg.mjs's copies of the archived CWG pages (same id_ URLs, fetched 2026-10-03)
  const cw = /^https:\/\/web\.archive\.org\/web\/(\d+)\/(https:\/\/canarywharf\.com\/.+)$/.exec(url);
  if (cw) {
    const d = CWG.find(x => x.archived === url);
    const base = d && join(CW, 'data/raw/registry/cwg/pages', `${d.kind}__${d.slug}`);
    const file = d && [base + '.html', base + '.alt1.html', base + '.alt2.html', base + '.alt3.html'].find(f => existsSync(f) && !CHALLENGE.test(readFileSync(f, 'utf8').slice(0, 6000)));
    if (file && !args.has('--refresh')) {
      const html = readFileSync(file);
      Object.assign(meta, { requested: archiveRaw(url), final_url: archiveRaw(url), status: 200, content_type: 'text/html', fetched: statSync(file).mtime.toISOString(),
        method: 'fetch-cwg.mjs cache (Internet Archive id_ copy; HTTP 200, redirects not recorded)', bytes: html.length, robots: 'not checked by fetch-cwg.mjs' });
      writeFileSync(P.body, gzipSync(html)); writeFileSync(P.meta, JSON.stringify(meta, null, 1)); return meta;
    }
  }
  let cur = cw ? archiveRaw(url) : url; meta.requested = cur;
  for (let hop = 0; ; hop++) {
    const cu = new URL(cur);
    const rb = await robotsFor(cu.origin);
    // robots.txt unreachable: a network error there is the site's own fault (dns, tls, timeout...); a 5xx robots.txt means "disallow all"
    if (rb.state === 'unreachable') { Object.assign(meta, { error_class: rb.error || 'robots.txt 5xx (treated as disallow)', detail: `on robots.txt (${rb.status || rb.error})` }); break; }
    if (!robotsAllows(rb.rules, cu.pathname + cu.search)) { Object.assign(meta, { error_class: 'robots disallowed', robots_host: cu.host }); break; }
    const r = await request(cur);
    if (r.error) { Object.assign(meta, { error_class: r.error, detail: r.detail }); break; }
    meta.status = r.status;
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      if (hop >= MAX_REDIRECTS) { meta.error_class = 'too many redirects'; break; }
      const next = new URL(r.headers.location, cur).href; meta.redirects.push({ status: r.status, to: next }); cur = next; continue;
    }
    meta.final_url = cur; meta.content_type = r.headers['content-type'] || null; meta.content_language = r.headers['content-language'] || null; meta.bytes = r.body.length;
    const head = r.body.subarray(0, 20000).toString('latin1');
    if (r.status === 429) meta.error_class = '429';
    else if (r.status >= 500) meta.error_class = CHALLENGE.test(head) ? 'bot challenge' : '5xx';
    else if (r.status >= 400) meta.error_class = CHALLENGE.test(head) || r.headers['cf-mitigated'] ? 'bot challenge' : r.status === 403 || r.status === 401 ? '401/403 refused' : r.status === 404 || r.status === 410 ? '404/410 not found' : '4xx other';
    else if (CHALLENGE.test(head) && r.body.length < 60000) meta.error_class = 'bot challenge';
    else if (!/html|xml/i.test(meta.content_type || 'text/html')) meta.error_class = 'not HTML';
    if (r.body.length) writeFileSync(P.body, gzipSync(r.body));
    break;
  }
  writeFileSync(P.meta, JSON.stringify(meta, null, 1));
  return meta;
}

// ---------------------------------------------------------------- 3. a small HTML tree builder (tags, attributes, text)
const VOID = new Set('area base br col embed hr img input keygen link meta param source track wbr'.split(' '));
const RAWTEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'template']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', pound: '£', euro: '€', eacute: 'é', egrave: 'è', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•', amp_: '&' };
const decode = s => s.replace(/&(#x[\da-f]+|#\d+|[a-z]+\d*);?/gi, (m, e) => e[0] === '#' ? (() => { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1); try { return String.fromCodePoint(n); } catch { return m; } })() : (ENT[e.toLowerCase()] ?? m));
function parseHTML(html) {
  const root = { name: '#root', attrs: {}, children: [] }, stack = [root];
  const top = () => stack[stack.length - 1];
  const text = s => { if (s) top().children.push(s); };
  const openRe = /<([a-zA-Z][^\s/>]*)/y, attrRe = /\s*([^\s/>=][^\s/>=]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y, closeRe = /<\/([a-zA-Z][^\s/>]*)[^>]*>/y;
  let i = 0; const n = html.length;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { text(html.slice(i)); break; }
    if (lt > i) text(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) { const e = html.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') { const e = html.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; }
    closeRe.lastIndex = lt; let m = closeRe.exec(html);
    if (m) {
      const name = m[1].toLowerCase(); i = closeRe.lastIndex;
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].name === name) { stack.length = k; break; }
      continue;
    }
    openRe.lastIndex = lt; m = openRe.exec(html);
    if (!m) { text('<'); i = lt + 1; continue; }
    const el = { name: m[1].toLowerCase(), attrs: {}, children: [] }; i = openRe.lastIndex;
    let self = false;
    for (;;) {
      while (i < n && /\s/.test(html[i])) i++;
      if (i >= n) break;
      if (html[i] === '>') { i++; break; }
      if (html[i] === '/') { if (html[i + 1] === '>') { self = true; i += 2; break; } i++; continue; }
      attrRe.lastIndex = i; const a = attrRe.exec(html);
      if (!a || attrRe.lastIndex === i) { i++; continue; }
      const k = a[1].toLowerCase(); if (!(k in el.attrs)) el.attrs[k] = decode(a[2] ?? a[3] ?? a[4] ?? '');
      i = attrRe.lastIndex;
    }
    top().children.push(el);
    if (RAWTEXT.has(el.name)) {
      const re = new RegExp(`</${el.name}\\s*>`, 'ig'); re.lastIndex = i; const e = re.exec(html);
      el.children.push(html.slice(i, e ? e.index : n)); el.raw = true; i = e ? re.lastIndex : n; continue;
    }
    if (!self && !VOID.has(el.name)) stack.push(el);
  }
  return root;
}
function* walk(node) { for (const c of node.children || []) if (typeof c !== 'string') { yield c; yield* walk(c); } }
const textOf = (node, skipRaw = true) => typeof node === 'string' ? decode(node) : (skipRaw && node.raw && node.name !== 'title' && node.name !== 'textarea') ? ' ' : node.children.map(c => textOf(c, skipRaw)).join(node.name && /^(p|div|br|li|tr|td|h\d|section|article|address|span)$/.test(node.name) ? ' ' : '');
const clean = s => (s || '').replace(/\s+/g, ' ').trim();
const cut = (s, n) => { s = clean(s); return s.length > n ? s.slice(0, n - 1).replace(/\s\S*$/, '') + '…' : s; };

// ---------------------------------------------------------------- 4. extraction
const local = t => String(t).replace(/^.*[/#:]/, '');
const types = n => [].concat(n?.['@type'] || []).map(local);
const BUSINESS = /^(LocalBusiness|Restaurant|FoodEstablishment|CafeOrCoffeeShop|BarOrPub|FastFoodRestaurant|Bakery|Brewery|Winery|Distillery|IceCreamShop|\w*Store|\w*Shop|Hotel|LodgingBusiness|Hostel|Resort|BedAndBreakfast|BankOrCreditUnion|FinancialService|Pharmacy|Dentist|Physician|MedicalClinic|MedicalBusiness|Optician|HealthAndBeautyBusiness|BeautySalon|HairSalon|NailSalon|DaySpa|HealthClub|ExerciseGym|SportsActivityLocation|SportsClub|ChildCare|Preschool|EntertainmentBusiness|NightClub|MovieTheater|ComedyClub|ArtGallery|Museum|TouristAttraction|AutomotiveBusiness|AutoRental|ProfessionalService|LegalService|Attorney|RealEstateAgent|EmploymentAgency|TravelAgency|DryCleaningOrLaundry|PostOffice|GovernmentOffice|ShoppingCenter|Place|CivicStructure|EducationalOrganization|School|CollegeOrUniversity|Library)$/;
const ORG = /^(Organization|Corporation|NGO|GovernmentOrganization|NewsMediaOrganization|SportsOrganization|PerformingGroup|MusicGroup|OnlineBusiness|OnlineStore)$/;
const EVENT = /Event$|^EventSeries$/;
const one = v => Array.isArray(v) ? v[0] : v;
const str = v => { v = one(v); if (v == null) return null; if (typeof v === 'object') return v['@id'] || v.url || v.name || v['@value'] || null; return clean(decode(String(v))) || null; };
function addr(a) {
  a = one(a); if (!a) return null; if (typeof a === 'string') return { text: cut(a, 200) };
  const c = one(a.addressCountry);
  const parts = ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode'].map(k => str(a[k])).concat(typeof c === 'object' ? str(c) : c).filter(Boolean);
  const pc = str(a.postalCode);
  return parts.length ? (pc ? { text: cut(parts.join(', '), 200), postal_code: pc } : { text: cut(parts.join(', '), 200) }) : null;
}
function geo(g) { g = one(g); if (!g || typeof g !== 'object') return null; const lat = parseFloat(str(g.latitude)), lon = parseFloat(str(g.longitude)); return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null; }
function hoursSpec(h) {
  const out = [];
  for (const s of [].concat(h || []).slice(0, 30)) {
    if (!s || typeof s !== 'object') continue;
    const days = [].concat(s.dayOfWeek || []).map(d => local(str(d) || '')).filter(Boolean);
    out.push(Object.fromEntries(Object.entries({ days, opens: str(s.opens), closes: str(s.closes), valid_from: str(s.validFrom), valid_through: str(s.validThrough) }).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length))));
  }
  return out.length ? out : null;
}
const list = (v, n = 10) => { const a = [].concat(v || []).map(str).filter(Boolean); return a.length ? [...new Set(a)].slice(0, n) : null; };
function entity(n, source) {
  const t = types(n), menu = str(n.hasMenu) || str(n.menu);
  const o = { source, type: t, name: str(n.name) && cut(str(n.name), 120), url: str(n.url), telephone: str(n.telephone), address: addr(n.address), geo: geo(n.geo),
    opening_hours: hoursSpec(n.openingHoursSpecification), opening_hours_text: list(n.openingHours, 14), price_range: str(n.priceRange), serves_cuisine: list(n.servesCuisine),
    menu, accepts_reservations: str(n.acceptsReservations), same_as: list(n.sameAs) };
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
}
function event(n, source) {
  const loc = one(n.location);
  const o = { source, type: types(n), name: str(n.name) && cut(str(n.name), 160), start: str(n.startDate), end: str(n.endDate), url: str(n.url),
    location: loc ? (typeof loc === 'string' ? cut(loc, 160) : cut([str(loc.name), addr(loc.address)?.text].filter(Boolean).join(', '), 200)) : null, status: n.eventStatus ? local(str(n.eventStatus)) : null };
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));
}
function collect(node, source, acc, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return;
  if (Array.isArray(node)) { for (const x of node) collect(x, source, acc, depth + 1); return; }
  const t = types(node);
  if (t.some(x => EVENT.test(x))) acc.events.push(event(node, source));
  else if (t.some(x => BUSINESS.test(x) || ORG.test(x)) && (node.name || node.address || node.telephone)) acc.entities.push({ kind: t.some(x => BUSINESS.test(x)) ? 'business' : 'organization', ...entity(node, source) });
  for (const t2 of t) acc.types.add(t2);
  for (const [k, v] of Object.entries(node)) if (k !== '@context' && v && typeof v === 'object') collect(v, source, acc, depth + 1);
}
function microItem(el) {
  const item = { '@type': (el.attrs.itemtype || '').split(/\s+/).filter(Boolean) };
  const visit = node => {
    for (const c of node.children) {
      if (typeof c === 'string') continue;
      if ('itemprop' in c.attrs) {
        const v = 'itemscope' in c.attrs ? microItem(c) : c.name === 'meta' ? c.attrs.content : /^(a|link|area)$/.test(c.name) ? c.attrs.href
          : /^(img|audio|video|source|iframe|embed|track)$/.test(c.name) ? c.attrs.src : c.name === 'object' ? c.attrs.data
          : /^(data|meter)$/.test(c.name) ? c.attrs.value : c.name === 'time' ? (c.attrs.datetime || clean(textOf(c))) : clean(textOf(c));
        for (const p of c.attrs.itemprop.split(/\s+/).filter(Boolean).map(local)) item[p] = item[p] === undefined ? v : [].concat(item[p], v);
      }
      if (!('itemscope' in c.attrs)) visit(c);
    }
  };
  visit(el); return item;
}
const BOOK_HOST = /(opentable|resy\.com|sevenrooms|designmynight|quandoo|tablein|bookatable|resdiary|thefork|fresha|treatwell|mindbody|booksy|zenoti|tock\.com|exploretock|dojo\.app|collins\.app|tablebooker)/i;
const EVENT_HOST = /(eventbrite|dice\.fm|ticketmaster|skiddle|seetickets|fatsoma|ra\.co|universe\.com|billetto)/i;
function extract(html, baseUrl, meta, places) {
  const doc = parseHTML(html);
  const all = [...walk(doc)];
  const htmlEl = all.find(e => e.name === 'html');
  let base = baseUrl; const be = all.find(e => e.name === 'base' && e.attrs.href); if (be) { try { base = new URL(be.attrs.href, baseUrl).href; } catch {} }
  const abs = h => { try { const u = new URL(h.trim(), base); return /^https?:$/.test(u.protocol) || u.protocol === 'webcal:' ? u.href : null; } catch { return null; } };
  const acc = { entities: [], events: [], types: new Set() };
  let ldBlocks = 0, ldErrors = 0;
  for (const s of all.filter(e => e.name === 'script' && /ld\+json/i.test(e.attrs.type || ''))) {
    ldBlocks++;
    let txt = (s.children[0] || '').trim().replace(/^<!--|-->$/g, '').replace(/^\s*\/\/\s*<!\[CDATA\[|\/\/\s*\]\]>\s*$/g, '').trim();
    let j; try { j = JSON.parse(txt); } catch { try { j = JSON.parse(txt.replace(/[\u0000-\u001f]+/g, ' ')); } catch { ldErrors++; continue; } }
    collect(j, 'json-ld', acc);
  }
  const micro = all.filter(e => 'itemscope' in e.attrs && !('itemprop' in e.attrs)).map(microItem);
  for (const m of micro) collect(m, 'microdata', acc);
  const metaTag = (k) => { const e = all.find(e => e.name === 'meta' && ((e.attrs.property || e.attrs.name || '').toLowerCase() === k)); return e ? clean(e.attrs.content) : null; };
  const og = Object.fromEntries(Object.entries({ title: metaTag('og:title') && cut(metaTag('og:title'), 200), type: metaTag('og:type'), description: metaTag('og:description') && cut(metaTag('og:description'), 200) }).filter(([, v]) => v));
  const title = all.find(e => e.name === 'title');
  // feeds: <link rel=alternate> RSS, Atom, JSON Feed, iCalendar; anchors to .ics / webcal: / .rss / .atom
  const feeds = [], seenF = new Set();
  const addFeed = (href, format, how, t) => { const u = abs(href); if (!u || seenF.has(u) || /\/comments\/feed\/?$|[?&]feed=comments/.test(u) || /comments feed/i.test(t || '')) return; seenF.add(u); feeds.push(Object.fromEntries(Object.entries({ url: u, format, how, title: t && cut(t, 120) }).filter(([, v]) => v))); };
  for (const l of all.filter(e => e.name === 'link' && /\balternate\b/i.test(e.attrs.rel || '') && e.attrs.href)) {
    const ty = (l.attrs.type || '').toLowerCase();
    const f = /rss/.test(ty) ? 'rss' : /atom/.test(ty) ? 'atom' : /calendar/.test(ty) ? 'ical' : /feed\+json/.test(ty) ? 'json-feed' : null;
    if (f) addFeed(l.attrs.href, f, 'link rel=alternate', l.attrs.title);
  }
  const links = { booking: [], menu: [], events: [] }, tel = new Set();
  for (const a of all.filter(e => e.name === 'a' && e.attrs.href)) {
    const href = a.attrs.href.trim();
    if (/^tel:/i.test(href)) { const t = decodeURIComponent(href.slice(4)).replace(/[^\d+]/g, ''); if (t.length >= 8) tel.add(t); continue; }
    if (/\.ics(\?|$)|^webcal:/i.test(href)) { addFeed(href.replace(/^webcal:/i, 'https:'), 'ical', 'link', clean(textOf(a))); continue; }
    if (/\.(rss|atom)(\?|$)|\/(feed|rss)\/?(\?|$)/i.test(href) && !/facebook|twitter|instagram/.test(href)) { addFeed(href, /atom/i.test(href) ? 'atom' : 'rss', 'link', clean(textOf(a))); continue; }
    const u = abs(href); if (!u) continue;
    const t = clean(textOf(a)).slice(0, 80); let path = ''; try { const p = new URL(u); path = (p.hostname + p.pathname).toLowerCase(); } catch {}
    const push = (k) => { if (links[k].length < 8 && !links[k].some(x => x.url === u)) links[k].push(t ? { url: u, text: t } : { url: u }); };
    if (BOOK_HOST.test(u) || /\/(book|booking|bookings|reserve|reservations?|book-a-table|table-booking)(\/|$|-)/.test(path) || /^(book|reserve)\b.{0,25}$|^(make a )?(booking|reservation)s?$/i.test(t)) push('booking');
    else if (/\/(menus?|our-menus?|food-menu|drinks-menu)(\/|$|-|\.)/.test(path) || /menu[^/]*\.pdf$/.test(path) || /^(view |see |our |the )?(food |drinks? |lunch |dinner |breakfast |brunch |set |a la carte )?menus?$/i.test(t)) push('menu');
    else if (EVENT_HOST.test(u) || /\/(events?|whats-on|what-s-on|whatson|gigs|calendar|upcoming-events)(\/|$)/.test(path) || /^(events?|what'?s on|upcoming events)$/i.test(t)) push('events');
  }
  // does the page name the Canary Wharf place of the entry? postcode or address phrase in the visible text or the structured data
  const body = all.find(e => e.name === 'body') || doc;
  const visible = clean(textOf(body)).toLowerCase().replace(/[’']/g, "'");
  const data = (JSON.stringify(acc.entities) + ' ' + JSON.stringify(micro) + ' ' + (og.title || '') + ' ' + (og.description || '') + ' ' + (title ? textOf(title.children[0] || '') : '')).toLowerCase().replace(/[’']/g, "'");
  const scripts = all.filter(e => e.name === 'script' && !/ld\+json/i.test(e.attrs.type || '')).map(e => e.children[0] || '').join(' ').toLowerCase();
  const pcs = [...new Set(places.flatMap(p => p.postcodes))], phr = [...new Set(places.flatMap(p => p.phrases))];
  const pcRe = pc => new RegExp('\\b' + pc.toLowerCase().replace(' ', '\\s?') + '\\b');
  const found = (hay) => ({ postcodes: pcs.filter(pc => pcRe(pc).test(hay)), phrases: phr.filter(p => hay.includes(p)) });
  const inText = found(visible + ' ' + data), inScripts = found(scripts);
  const where = inText.postcodes.length || inText.phrases.length ? 'page text or structured data' : inScripts.postcodes.length || inScripts.phrases.length ? 'scripts only' : null;
  const hit = where === 'scripts only' ? inScripts : inText;
  let pageKind = 'deep'; try { const fu = new URL(meta.final_url || baseUrl); if (/^\/(([a-z]{2}([-_][a-z]{2})?|home|index\.html?)\/?)?$/i.test(fu.pathname) && !fu.search) pageKind = 'home'; } catch {}
  return {
    facts: Object.fromEntries(Object.entries({
      lang: htmlEl?.attrs.lang || htmlEl?.attrs['xml:lang'] || all.find(e => e.name === 'meta' && /content-language/i.test(e.attrs['http-equiv'] || ''))?.attrs.content || meta.content_language || null,
      title: title ? cut(decode(title.children[0] || ''), 200) : null,
      og: Object.keys(og).length ? og : null,
      page_kind: pageKind,
      jsonld: { blocks: ldBlocks, parse_errors: ldErrors }, microdata_items: micro.length,
      schema_types: [...acc.types].slice(0, 30),
      entities: dedupe(acc.entities).slice(0, 20),
      telephone_links: tel.size ? [...tel].slice(0, 5) : null,
      links: Object.values(links).some(x => x.length) ? Object.fromEntries(Object.entries(links).filter(([, v]) => v.length)) : null,
      names_location: { postcodes: hit.postcodes, phrases: hit.phrases.slice(0, 5), where, mentions_canary_wharf: /canary\s+wharf/.test(visible + ' ' + data) },
      // a postcode anywhere, or an address phrase on a deep page, names the branch; a home page that only lists the place among others does not
      names_branch: where === 'page text or structured data' ? (hit.postcodes.length || pageKind === 'deep' ? true : 'home page lists the place') : where === 'scripts only' ? 'scripts only' : false,
    }).filter(([, v]) => v != null)),
    feeds, events: dedupe(acc.events).slice(0, 50), eventsTotal: acc.events.length,
  };
}
function dedupe(a) { const s = new Set(); return a.filter(x => { const k = JSON.stringify(x); return s.has(k) ? false : (s.add(k), true); }); }
function decodeBody(buf, ct) {
  let cs = (/charset=([\w-]+)/i.exec(ct || '') || [])[1] || (/<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4000).toString('latin1')) || [])[1] || 'utf-8';
  try { return new TextDecoder(cs.toLowerCase()).decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

// ---------------------------------------------------------------- 5. run
const onlyHost = (process.argv.find(a => a.startsWith('--host=')) || '').slice(7);   // test on one host; outputs are not written
const all = [...urls.keys()].filter(u => !onlyHost || new URL(u).host === onlyHost);
const byHost = new Map(); for (const u of all) { const h = new URL(u).host; (byHost.get(h) || byHost.set(h, []).get(h)).push(u); }
const queue = [...byHost.entries()].sort((a, b) => b[1].length - a[1].length);
const metas = new Map(); let done = 0;
if (!args.has('--no-fetch')) {
  await Promise.all(Array.from({ length: HOSTS_PARALLEL }, async () => {
    for (let q; (q = queue.shift());) for (const u of q[1]) {
      const m = await crawl(u); metas.set(u, m);
      if (++done % 25 === 0) console.log(`${done}/${all.length} urls, ${((Date.now() - T0) / 1000).toFixed(0)} s`);
    }
  }));
} else for (const u of all) { const p = pathsFor(u).meta; if (existsSync(p)) metas.set(u, JSON.parse(readFileSync(p, 'utf8'))); }

const pages = [], discovered = new Map(), failures = {}, robotsBlocked = [];
const counts = { urls: all.length, hosts: byHost.size, attempted: 0, from_fetch_cwg_cache: 0, ok_html: 0, with_jsonld: 0, with_microdata: 0, with_entity: 0, with_opening_hours: 0, with_telephone: 0, with_events: 0, events: 0, with_feeds: 0, with_booking_link: 0, with_menu_link: 0, with_events_link: 0, names_branch: 0, names_branch_scripts_only: 0, home_page_lists_place: 0, mentions_canary_wharf_only: 0, home_pages: 0, archived_cwg_pages: 0 };
for (const u of all) {
  const m = metas.get(u); const e = urls.get(u);
  if (!m) continue;
  counts.attempted++;
  if (/fetch-cwg/.test(m.method)) counts.from_fetch_cwg_cache++;
  const rec = { url: u, final_url: m.final_url, status: m.status, fetched: m.fetched, for: [...e.for].sort(), sources: [...e.refs].sort() };
  if (/web\.archive\.org\/web\/\d+\//.test(u)) { const [, ts, orig] = /\/web\/(\d+)\/(.+)$/.exec(u); rec.archived = { timestamp: ts, original: orig }; counts.archived_cwg_pages++; }
  if (m.method !== 'live') rec.method = m.method;
  if (m.redirects?.length) rec.redirects = m.redirects.length;
  if (m.error_class === 'robots unreachable') { const why = (/robots\.txt (\S+)/.exec(m.detail || '') || [])[1]; m.error_class = /^\d+$/.test(why) ? 'robots.txt 5xx (treated as disallow)' : why === 'network:' ? 'connection' : why || 'connection'; m.detail = `on robots.txt (${(m.detail || '').replace('robots.txt ', '')})`; }
  if (m.error_class) {
    rec.error = m.error_class; failures[m.error_class] = (failures[m.error_class] || 0) + 1;
    if (m.error_class === 'robots disallowed') robotsBlocked.push({ url: u, host: m.robots_host });
    if (m.detail) rec.detail = m.detail;
  }
  const P = pathsFor(u);
  if (!m.error_class && existsSync(P.body) && m.status && m.status < 400) {
    const html = decodeBody(gunzipSync(readFileSync(P.body)), m.content_type);
    const base = rec.archived ? rec.archived.original : (m.final_url || u);
    const x = extract(html, base, m, e.places);
    rec.facts = x.facts; rec.feeds = x.feeds; rec.events = x.events;
    if (x.eventsTotal > x.events.length) rec.events_total = x.eventsTotal;
    counts.ok_html++;
    const f = x.facts;
    if (f.jsonld.blocks) counts.with_jsonld++;
    if (f.microdata_items) counts.with_microdata++;
    if (f.entities?.length) counts.with_entity++;
    if (f.entities?.some(z => z.opening_hours || z.opening_hours_text)) counts.with_opening_hours++;
    if (f.entities?.some(z => z.telephone)) counts.with_telephone++;
    if (x.events.length) { counts.with_events++; counts.events += x.eventsTotal; }
    if (x.feeds.length) counts.with_feeds++;
    if (f.links?.booking) counts.with_booking_link++;
    if (f.links?.menu) counts.with_menu_link++;
    if (f.links?.events) counts.with_events_link++;
    if (f.names_branch === true) counts.names_branch++; else if (f.names_branch === 'scripts only') counts.names_branch_scripts_only++; else if (f.names_branch === 'home page lists the place') counts.home_page_lists_place++; else if (f.names_location.mentions_canary_wharf) counts.mentions_canary_wharf_only++;
    if (f.page_kind === 'home') counts.home_pages++;
    for (const fd of x.feeds) {
      const d = discovered.get(fd.url) || discovered.set(fd.url, { url: fd.url, format: fd.format, how: fd.how, title: fd.title, found_on: [], for: new Set() }).get(fd.url);
      if (d.found_on.length < 10) d.found_on.push(u); for (const k of e.for) d.for.add(k);
    }
  }
  pages.push(rec);
}
// feeds already catalogued in feeds/events.json or feeds/feeds.json are not "discovered"
const known = new Set(); const grab = (o) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (typeof v === 'string' && /^https?:\/\//.test(v)) known.add(v.replace(/\/$/, '')); else grab(v); } };
for (const f of ['feeds/events.json', 'feeds/feeds.json']) if (existsSync(join(CW, f))) grab(readJSON(f));
const disc = [...discovered.values()].map(d => ({ ...d, for: [...d.for].sort().slice(0, 20), for_count: d.for.size, known: known.has(d.url.replace(/\/$/, '')) }));
const newFeeds = disc.filter(d => !d.known);
const fmtCount = a => a.reduce((o, d) => (o[d.format] = (o[d.format] || 0) + 1, o), {});
const today = new Date().toISOString().slice(0, 10);
if (onlyHost) { console.log(JSON.stringify(pages, null, 1).slice(0, 6000)); process.exit(0); }
mkdirSync(OUTDIR, { recursive: true });
const method = `Each URL fetched once with Node fetch (redirects followed by hand, robots.txt checked on every host, RFC 9309), User-Agent "${UA}", one request at a time per host and at least ${GAP_MS / 1000} s apart, at most ${HOSTS_PARALLEL} hosts at once, ${TIMEOUT_MS / 1000} s timeout, up to ${MAX_TRIES} tries with backoff on 429, 5xx, timeouts and resets. canarywharf.com is read only as Internet Archive id_ copies (the live site answers scripts with an Imperva challenge); copies fetch-cwg.mjs saved on 2026-10-03 are reused. Extracted: schema.org JSON-LD and microdata (businesses, organisations, events), OpenGraph title/type/description (description cut to 200 characters), the page title, html lang, <link rel=alternate> feeds and .ics/webcal links, tel: links, and links to booking, menu and events pages. names_branch: the entry's postcode or an address phrase (street, mall) is in the page text or structured data; a chain home page without them is no evidence for the branch. No page text is kept beyond these short fields.`;
writeFileSync(join(OUTDIR, 'site-facts.json'), JSON.stringify({
  meta: {
    generated: new Date().toISOString(), fetched: today, tool: 'tools/crawl-sites.mjs', method, user_agent: UA,
    crawl_policy: 'Website crawls allowed for scoping (owner, 2026-10-03); short fields only; re-check before anything leaves the prototyping phase.',
    url_references_by_source: refsBySource, skipped_references: skipped,
    counts: { ...counts, robots_disallowed: robotsBlocked.length, failed: Object.values(failures).reduce((a, b) => a + b, 0), discovered_feeds: disc.length, discovered_feeds_new: newFeeds.length, seconds: Math.round((Date.now() - T0) / 1000) },
    robots_disallowed: robotsBlocked, failures_by_class: failures,
  },
  pages,
}, null, 1));
writeFileSync(join(OUTDIR, 'discovered-feeds.json'), JSON.stringify({
  meta: { generated: new Date().toISOString(), tool: 'tools/crawl-sites.mjs', from: 'registry/sources/web/site-facts.json',
    note: 'Feed URLs (RSS, Atom, JSON Feed, iCalendar) found in the crawled pages and not already in feeds/events.json or feeds/feeds.json. Not fetched or verified: check each (feeds/check-events.mjs) before adding it to feeds/events.json. WordPress comment feeds are left out. Feeds on archived canarywharf.com pages are the site\'s own WordPress feeds.',
    counts: { found: disc.length, already_known: disc.length - newFeeds.length, new: newFeeds.length, new_by_format: fmtCount(newFeeds) } },
  feeds: newFeeds.map(({ known, ...d }) => d).sort((a, b) => b.for_count - a.for_count || a.url.localeCompare(b.url)),
}, null, 1));
console.log(JSON.stringify({ counts: { ...counts, robots_disallowed: robotsBlocked.length }, failures, feeds: { found: disc.length, new: newFeeds.length }, seconds: Math.round((Date.now() - T0) / 1000) }, null, 1));
