#!/usr/bin/env node
// Find London RSS / Atom / JSON Feed / iCalendar feeds at scale, verify each one politely, score it for the
// Docklands zone, and write the catalogue: feeds/discovery/candidates.json, feeds/discovery/london-feeds.opml,
// and the verified zone feeds merged into feeds/events.json.
//
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/discover-feeds.mjs              # every stage
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/discover-feeds.mjs seed         # directories, lists, hand lists
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/discover-feeds.mjs cc           # Common Crawl index + WARC sample
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/discover-feeds.mjs autodiscover # home pages -> <link rel=alternate>
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/discover-feeds.mjs verify       # fetch, parse, count, CORS
//   node cwplans/tools/discover-feeds.mjs build                             # write outputs, no network
//   options: --refresh (ignore cached stage results), --no-merge (build without touching events.json)
//
// The cc stage needs hyparquet and hyparquet-compressors (pure JS, MIT), not a project dependency:
//   npm i --prefix /tmp/cclibs hyparquet hyparquet-compressors   then   CC_LIBS=/tmp/cclibs node ... cc
// Stage results are cached in data/raw/feed-discovery/ (gitignored); delete a file there to redo that stage.
// Method, rules, and what was excluded and why: skill cwplans-feed-discovery
// (cwplans/skills/cwplans-feed-discovery/SKILL.md) and feeds/discovery/README.md.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { qlever } from './lib.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const CW = join(TOOLS, '..');
const RAW = join(CW, 'data', 'raw', 'feed-discovery');
const OUT = join(CW, 'feeds', 'discovery');
const UA = 'glitchcan-cwplans/0.1 (https://github.com/danbri/londat)';
const UA_TOKEN = 'glitchcan-cwplans';
const ORIGIN = 'https://danbri.github.io';
const TODAY = new Date().toISOString().slice(0, 10);
const GAP_MS = 1000;            // between two requests to one host
const HOSTS_PARALLEL = 8;       // hosts worked at once
const TIMEOUT_MS = 30000;
const MAX_BYTES = 4e6;
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const stages = args.filter(a => !a.startsWith('--'));
mkdirSync(RAW, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = (f, d = null) => existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d;
const writeJson = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 1) + '\n'); };
const sha1 = s => createHash('sha1').update(s).digest('hex');

// ============================== zone and London terms (counts only; no item text is kept) ==============================
const ZONE_TERMS = ['canary wharf', 'isle of dogs', 'docklands', 'millwall', 'cubitt town', 'blackwall', 'poplar', 'limehouse',
  'wapping', 'shadwell', 'rotherhithe', 'surrey quays', 'canada water', 'deptford', 'greenwich', 'silvertown', 'royal docks',
  'royal victoria', 'royal albert', 'excel london', 'leamouth', 'trinity buoy', 'wood wharf', 'crossharbour', 'mudchute',
  'island gardens', 'south quay', 'heron quays', 'westferry', 'west india', 'east india', 'cody dock', 'bow creek'];
const ZONE_RE = new RegExp(`\\b(${ZONE_TERMS.map(t => t.replace(/ /g, '\\s+')).join('|')})\\b|\\b(E14|SE16|SE10|SE8|E16|E1W)(\\s?\\d[A-Z]{2})?\\b`, 'gi');
const BOROUGH_RE = /\b(tower hamlets|southwark|lewisham|newham|royal borough of greenwich)\b/i;
const LONDON_PC = /\b(E|EC|N|NW|SE|SW|W|WC)\d{1,2}[A-Z]?\s?\d[ABD-HJLNP-UW-Z]{2}\b/;
const LONDON_RE = /\blondon\b/i;
const zoneTermsIn = text => { const out = new Set(); for (const m of text.matchAll(ZONE_RE)) out.add((m[1] || m[2]).toLowerCase().replace(/\s+/g, ' ')); return [...out]; };

// ============================== politeness: robots.txt, one request at a time per host, >= 1 s apart ==============================
// robots.txt per RFC 9309, same rules as tools/crawl-sites.mjs: our token's group, else *; longest match wins, Allow wins a
// tie; 4xx = allow all; 5xx or unreachable = disallow all.
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
    if (r.path === '') continue;
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}
const hostQueue = new Map();
function politely(host, fn) {
  const run = async () => { try { return await fn(); } finally { await sleep(GAP_MS); } };
  const p = (hostQueue.get(host) || Promise.resolve()).then(run, run);
  hostQueue.set(host, p.catch(() => {}));
  return p;
}
async function rawGet(url, headers = {}, method = 'GET') {
  const r = await fetch(url, { method, headers: { 'User-Agent': UA, ...headers }, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  let text = '';
  if (method !== 'HEAD' && r.body) {
    const reader = r.body.getReader(); const chunks = []; let n = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); n += value.length; if (n > MAX_BYTES) { reader.cancel().catch(() => {}); break; } }
    text = Buffer.concat(chunks).toString('utf8');
  }
  return { status: r.status, headers: r.headers, text };
}
const ROBOTS_FILE = join(RAW, 'robots.json');
const robotsCache = new Map(Object.entries(readJson(ROBOTS_FILE, {})));
let robotsDirty = 0;
async function robotsFor(origin) {
  const c = robotsCache.get(origin);
  if (c && c.date === TODAY) return c;
  const host = new URL(origin).host;
  const v = await politely(host, async () => {
    try {
      let r = await rawGet(origin + '/robots.txt', { Accept: 'text/plain,*/*;q=0.5' }), hops = 0, at = origin + '/robots.txt';
      while (r.status >= 300 && r.status < 400 && r.headers.get('location') && hops++ < 4) { at = new URL(r.headers.get('location'), at).href; r = await rawGet(at, { Accept: 'text/plain,*/*;q=0.5' }); }
      if (r.status >= 500) return { date: TODAY, state: 'unreachable', status: r.status, rules: [] };
      if (r.status >= 400) return { date: TODAY, state: 'none', status: r.status, rules: [] };
      if (/<html|<!doctype/i.test(r.text.slice(0, 500))) return { date: TODAY, state: 'none', status: r.status, note: 'HTML instead of robots.txt', rules: [] };
      return { date: TODAY, state: 'ok', status: r.status, rules: parseRobots(r.text) };
    } catch (e) { return { date: TODAY, state: 'unreachable', error: String(e.cause?.code || e.message).slice(0, 80), rules: [] }; }
  });
  robotsCache.set(origin, v);
  if (++robotsDirty % 20 === 0) writeJson(ROBOTS_FILE, Object.fromEntries(robotsCache));
  return v;
}
function botChallenge(headers, text) {
  const head = text.slice(0, 6000);
  if (headers.get('sg-captcha') || /sgcaptcha/i.test(head)) return 'SiteGround captcha';
  if (headers.get('cf-mitigated') || /<title>Just a moment|challenge-platform|Attention Required/i.test(head)) return 'Cloudflare challenge';
  if (/_Incapsula_Resource/.test(head)) return 'Imperva Incapsula challenge';
  if (/Azure WAF/.test(head)) return 'Azure WAF challenge';
  return null;
}
// GET with redirects followed by hand (robots.txt checked on every hop's host), queued per host.
async function politeGet(url, { headers = {}, checkRobots = true } = {}) {
  let at = url;
  for (let hop = 0; hop < 6; hop++) {
    let u; try { u = new URL(at); } catch { return { error: 'bad url' }; }
    if (!/^https?:$/.test(u.protocol)) return { error: 'not http' };
    if (checkRobots) {
      const rb = await robotsFor(u.origin);
      if (rb.state === 'unreachable') return { error: `robots.txt unreachable (${rb.status || rb.error})`, final_url: at };
      if (!robotsAllows(rb.rules, u.pathname + u.search)) return { robots: 'disallowed', final_url: at };
    }
    let r;
    for (let k = 0; ; k++) { // up to 3 tries on 429 and 503, waiting Retry-After or 10, 30 s
      try { r = await politely(u.host, () => rawGet(at, { Accept: 'application/rss+xml, application/atom+xml, application/feed+json, text/calendar, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5', ...headers })); }
      catch (e) { return { error: String(e.cause?.code || e.cause?.message || e.message).slice(0, 120), final_url: at }; }
      if (!(r.status === 429 || r.status === 503) || k >= 2) break;
      const ra = Number(r.headers.get('retry-after'));
      await sleep(Math.min(120000, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 10000 * 3 ** k));
    }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { at = new URL(r.headers.get('location'), at).href; continue; }
    return { status: r.status, final_url: at, type: r.headers.get('content-type') || '', text: r.text, blocked: botChallenge(r.headers, r.text), acao: r.headers.get('access-control-allow-origin') };
  }
  return { error: 'too many redirects', final_url: at };
}
// pool: run fn over items, at most HOSTS_PARALLEL at once (the per-host queue still serialises each host)
async function pool(items, fn, n = HOSTS_PARALLEL) {
  let i = 0; const out = new Array(items.length);
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

// ============================== URL keys and small parsers ==============================
function normUrl(u, base) {
  try {
    const x = new URL(u.replace(/^feed:/, 'https:').replace(/^webcal:/, 'https:').replace(/&amp;/g, '&'), base);
    x.hash = ''; x.host = x.host.toLowerCase();
    for (const k of [...x.searchParams.keys()]) if (/^utm_/.test(k)) x.searchParams.delete(k);
    return x.href;
  } catch { return null; }
}
// key for duplicates: no scheme, no www., no trailing slash; Blogger's /atom.xml, /rss.xml and /feeds/posts/default are one feed
const keyOf = u => {
  try {
    const x = new URL(u); let path = x.pathname.replace(/\/+$/, ''), q = x.search;
    if (/\.blogspot\.com$/.test(x.host) && /^\/(atom\.xml|rss\.xml|feeds\/posts\/default)$/.test(path)) { path = '/feeds/posts/default'; q = ''; }
    return x.host.replace(/^www\./, '') + path + q;
  } catch { return u; }
};
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', raquo: '»', laquo: '«', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', hellip: '…' };
const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m))
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const attr = (tag, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag); return m ? (m[2] ?? m[3] ?? m[4]) : null; };
const isoDate = d => { const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };
const icsDate = v => { const m = /(\d{4})(\d{2})(\d{2})/.exec(v || ''); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };

// a feed's items: title, date and searchable text (title + summary + content + categories). Used for counts only.
export function parseFeed(text) {
  const head = text.slice(0, 3000);
  if (/BEGIN:VCALENDAR/.test(head)) {
    const un = text.replace(/\r?\n[ \t]/g, ''); const items = [];
    for (const b of un.split('BEGIN:VEVENT').slice(1)) {
      const f = k => { const m = b.match(new RegExp(`^${k}(?:;[^:\\n]*)?:(.*)$`, 'm')); return m ? m[1].trim().replace(/\\([,;n])/gi, (_, c) => c === 'n' || c === 'N' ? ' ' : c) : ''; };
      items.push({ title: f('SUMMARY'), date: icsDate(f('DTSTART')), text: [f('SUMMARY'), f('DESCRIPTION'), f('LOCATION')].join(' ') });
    }
    return { format: 'ics', title: (/^X-WR-CALNAME:(.*)$/m.exec(un) || [])[1]?.trim() || null, items };
  }
  if (/^\s*\{/.test(head) && /jsonfeed\.org/.test(head)) {
    const j = JSON.parse(text);
    return { format: 'jsonfeed', title: j.title || null, items: (j.items || []).map(i => ({ title: decode(i.title), date: isoDate(i.date_published || i.date_modified), text: decode([i.title, i.summary, i.content_text, i.content_html, (i.tags || []).join(' ')].join(' ')) })) };
  }
  const atom = /<feed[\s>]/.test(head) && !/<rss[\s>]|<rdf:RDF/.test(head);
  const rss = /<rss[\s>]|<rdf:RDF|<channel[\s>]/.test(head);
  if (!atom && !rss) return null;
  const tag = atom ? 'entry' : 'item';
  const get = (b, names) => { for (const n of names) { const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`).exec(b); if (m) return m[1]; } return ''; };
  const blocks = [...text.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`, 'g'))].map(m => m[0]);
  const before = text.slice(0, text.search(new RegExp(`<${tag}[\\s>]`)) >>> 0 || 4000);
  const items = blocks.map(b => {
    const cats = [...b.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>|<category\b[^>]*term="([^"]*)"/g)].map(m => m[1] || m[2]).join(' ');
    return {
      title: decode(get(b, ['title'])),
      date: isoDate(decode(get(b, atom ? ['published', 'updated'] : ['pubDate', 'dc:date', 'a10:updated', 'updated', 'published']))),
      text: decode([get(b, ['title']), get(b, ['description', 'summary']), get(b, ['content:encoded', 'content']).slice(0, 20000), cats].join(' ')).slice(0, 8000),
    };
  });
  return { format: atom ? 'atom' : 'rss', title: decode(get(before, ['title'])) || null, items };
}
// <link rel="alternate" type="application/rss+xml|atom+xml|feed+json"> and .ics / webcal links in an HTML page
export function feedLinks(html, base) {
  const out = []; const head = html.slice(0, 400000);
  const b = (/<base\b[^>]*href=["']([^"']+)["']/i.exec(head) || [])[1];
  const baseUrl = b ? normUrl(b, base) || base : base;
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const t = m[0]; const rel = (attr(t, 'rel') || '').toLowerCase(); const type = (attr(t, 'type') || '').toLowerCase();
    if (!/\balternate\b/.test(rel) || !/(rss|atom)\+xml|feed\+json|application\/json\+feed/.test(type)) continue;
    const href = attr(t, 'href'); if (!href) continue;
    const u = normUrl(href, baseUrl); if (!u || /\/comments\/feed\/?$|\/comments\/?\?feed|wp-json\/oembed/.test(u)) continue;
    out.push({ url: u, format: /atom/.test(type) ? 'atom' : /json/.test(type) ? 'jsonfeed' : 'rss', title: decode(attr(t, 'title') || '') || null, how: 'link rel=alternate' });
  }
  for (const m of head.matchAll(/href=["']((?:webcal:[^"']+)|(?:[^"']*?(?:\.ics(?:\?[^"']*)?|[?&]ical=1[^"']*)))["']/gi)) {
    const u = normUrl(m[1], baseUrl); if (u && out.filter(x => x.format === 'ics').length < 3) out.push({ url: u, format: 'ics', title: null, how: 'ics link' });
  }
  const seen = new Set(); return out.filter(x => !seen.has(x.url) && seen.add(x.url));
}

// ============================== seeds: the hand lists ==============================
// Each seed: { url, as: 'feed' | 'page', kind, title, zone (publisher in or beside the zone), found_by, source }.
// 'page' seeds go through autodiscovery; 'feed' seeds straight to verification.
const S = (found_by, source, kind, list, extra = {}) => list.map(x => typeof x === 'string' ? { url: x, found_by, source, kind, ...extra } : { found_by, source, kind, ...extra, ...x });

// (c) local news and hyperlocal publishers named in the owner's brief, plus zone publishers known to the project
const LOCAL_NEWS = [
  { url: 'https://wharflife.com/', title: 'Wharf Life', zone: true }, { url: 'https://www.wharf.co.uk/', title: 'The Wharf', zone: true },
  { url: 'https://www.eastlondonadvertiser.co.uk/', title: 'Docklands & East London Advertiser', zone: true },
  { url: 'https://www.mylondon.news/', title: 'MyLondon' }, { url: 'https://www.southwarknews.co.uk/', title: 'Southwark News', zone: true },
  { url: 'https://www.newsshopper.co.uk/', title: 'News Shopper' }, { url: 'https://greenwichwire.co.uk/', title: 'Greenwich Wire', zone: true },
  { url: 'https://londonist.com/', title: 'Londonist' }, { url: 'https://www.ianvisits.co.uk/', title: 'IanVisits' },
  { url: 'https://www.timeout.com/london', title: 'Time Out London' }, { url: 'https://isleofdogslife.wordpress.com/', title: 'Isle of Dogs Life', zone: true },
  { url: 'https://diamondgeezer.blogspot.com/', title: 'Diamond Geezer' }, { url: 'https://spitalfieldslife.com/', title: 'Spitalfields Life' },
  { url: 'https://newsonthewharf.co.uk/', title: 'News on the Wharf', zone: true }, { url: 'https://romanroadlondon.com/', title: 'Roman Road London' },
  { url: 'https://www.eastlondonlines.co.uk/', title: 'Eastlondonlines' }, { url: 'https://www.standard.co.uk/', title: 'Evening Standard' },
  { url: 'https://www.cityam.com/', title: 'City A.M.' }, { url: 'https://www.onlondon.co.uk/', title: 'OnLondon' },
  { url: 'https://www.londonlovesbusiness.com/', title: 'London Loves Business' },
  { url: 'https://feeds.bbci.co.uk/news/england/london/rss.xml', as: 'feed', title: 'BBC News London' },
  { url: 'https://www.itv.com/news/london', title: 'ITV News London' }, { url: 'https://deptforddame.blogspot.com/', title: 'The Deptford Dame', zone: true },
  { url: 'https://transpont.blogspot.com/', title: 'Transpontine', zone: true }, { url: 'https://charltonchampion.co.uk/', title: 'The Charlton Champion' },
  { url: 'https://www.greenwich.co.uk/', title: 'greenwich.co.uk', zone: true }, { url: 'https://www.london-se1.co.uk/', title: 'London SE1' },
  { url: 'https://www.brockleycentral.com/', title: 'Brockley Central' },
];
// (c) community, faith, school and venue sites in and beside the zone (community forum / events / news)
const COMMUNITY = [
  { url: 'https://www.isleofdogsforum.com/', title: 'Isle of Dogs Neighbourhood Planning Forum', kind: 'community forum', zone: true },
  { url: 'https://www.plymouthwharf.com/', title: 'Plymouth Wharf residents', kind: 'community forum', zone: true },
  { url: 'https://docklandshistorygroup.org.uk/', title: 'Docklands History Group', kind: 'community forum', zone: true },
  { url: 'https://www.poplarharca.co.uk/', title: 'Poplar HARCA', kind: 'community forum', zone: true },
  { url: 'https://www.parishiod.org.uk/', title: 'Parish of the Isle of Dogs (Christ Church, St John, St Luke)', kind: 'community forum', zone: true },
  { url: 'https://stlukesmillwall.org/', title: "St Luke's Millwall", kind: 'community forum', zone: true },
  { url: 'https://www.stanneslimehouse.org/', title: "St Anne's Limehouse", kind: 'community forum', zone: true },
  { url: 'https://www.georgegreens.com/', title: "George Green's School", kind: 'community forum', zone: true },
  { url: 'https://www.canarywharfcollege.co.uk/', title: 'Canary Wharf College', kind: 'community forum', zone: true },
  { url: 'https://www.mudchute.org/', title: 'Mudchute Park and Farm', kind: 'events', zone: true },
  { url: 'https://www.surreydocksfarm.org.uk/', title: 'Surrey Docks Farm', kind: 'events', zone: true },
  { url: 'https://www.excel.london/', title: 'ExCeL London', kind: 'events', zone: true },
  { url: 'https://www.londonmuseum.org.uk/', title: 'London Museum (Docklands)', kind: 'events', zone: true },
  { url: 'https://www.rmg.co.uk/', title: 'Royal Museums Greenwich', kind: 'events', zone: true },
  { url: 'https://www.greenwichpeninsula.co.uk/', title: 'Greenwich Peninsula', kind: 'events', zone: true },
  { url: 'https://www.thealbany.org.uk/', title: 'The Albany, Deptford', kind: 'events', zone: true },
  { url: 'https://poplarunion.com/', title: 'Poplar Union', kind: 'events', zone: true },
  { url: 'https://www.raggedschoolmuseum.org.uk/', title: 'Ragged School Museum', kind: 'events', zone: true },
  { url: 'https://group.canarywharf.com/', title: 'Canary Wharf Group (corporate news)', kind: 'business', zone: true },
  { url: 'https://canarywharf.com/', title: 'Canary Wharf (estate)', kind: 'events', zone: true },
];
// (d) councils and public bodies
const MODERNGOV = { // London borough ModernGov hosts; "what's new" RSS is <host>/mgRss.aspx (some under /Internet/)
  'Barking and Dagenham': 'https://modgov.lbbd.gov.uk/Internet/mgRss.aspx', Barnet: 'https://barnet.moderngov.co.uk/mgRss.aspx',
  Bexley: 'https://democracy.bexley.gov.uk/mgRss.aspx', Brent: 'https://democracy.brent.gov.uk/mgRss.aspx',
  Bromley: 'https://cds.bromley.gov.uk/mgRss.aspx', Camden: 'https://democracy.camden.gov.uk/mgRss.aspx',
  Croydon: 'https://democracy.croydon.gov.uk/mgRss.aspx', Enfield: 'https://governance.enfield.gov.uk/mgRss.aspx',
  Greenwich: 'https://greenwich.moderngov.co.uk/mgRss.aspx', Hackney: 'https://hackney.moderngov.co.uk/mgRss.aspx',
  'Hammersmith and Fulham': 'https://democracy.lbhf.gov.uk/mgRss.aspx', Haringey: 'https://www.minutes.haringey.gov.uk/mgRss.aspx',
  Havering: 'https://democracy.havering.gov.uk/mgRss.aspx', Hounslow: 'https://democraticservices.hounslow.gov.uk/mgRss.aspx',
  Islington: 'https://democracy.islington.gov.uk/mgRss.aspx', Kingston: 'https://moderngov.kingston.gov.uk/mgRss.aspx',
  Lambeth: 'https://moderngov.lambeth.gov.uk/mgRss.aspx', Lewisham: 'https://lewisham.moderngov.co.uk/mgRss.aspx',
  Merton: 'https://democracy.merton.gov.uk/mgRss.aspx', Newham: 'https://mgov.newham.gov.uk/mgRss.aspx',
  Redbridge: 'https://moderngov.redbridge.gov.uk/mgRss.aspx', Richmond: 'https://richmond.moderngov.co.uk/mgRss.aspx',
  Southwark: 'https://moderngov.southwark.gov.uk/mgRss.aspx', Sutton: 'https://moderngov.sutton.gov.uk/mgRss.aspx',
  'Tower Hamlets': 'https://democracy.towerhamlets.gov.uk/mgRss.aspx', 'Waltham Forest': 'https://democracy.walthamforest.gov.uk/mgRss.aspx',
  Wandsworth: 'https://democracy.wandsworth.gov.uk/mgRss.aspx', Westminster: 'https://committees.westminster.gov.uk/mgRss.aspx',
  'City of London': 'https://democracy.cityoflondon.gov.uk/mgRss.aspx', 'Kensington and Chelsea': 'https://www.rbkc.gov.uk/committees/mgRss.aspx',
  'London Assembly': 'https://www.london.gov.uk/about-us/londonassembly/meetings/mgRss.aspx',
};
const ZONE_BOROUGHS = new Set(['Tower Hamlets', 'Southwark', 'Lewisham', 'Greenwich', 'Newham', 'City of London', 'London Assembly']);
const COUNCIL_PAGES = [
  { url: 'https://www.towerhamlets.gov.uk/News_events/News.aspx', title: 'Tower Hamlets Council news', zone: true },
  { url: 'https://www.southwark.gov.uk/news', title: 'Southwark Council news', zone: true },
  { url: 'https://lewisham.gov.uk/news', title: 'Lewisham Council news', zone: true },
  { url: 'https://www.royalgreenwich.gov.uk/news', title: 'Royal Greenwich news', zone: true },
  { url: 'https://www.newham.gov.uk/news', title: 'Newham Council news', zone: true },
  { url: 'https://www.cityoflondon.gov.uk/news', title: 'City of London Corporation news', zone: true },
  { url: 'https://consultations.southwark.gov.uk/', title: 'Southwark consultations (Citizen Space)', zone: true },
  { url: 'https://consultation.lewisham.gov.uk/', title: 'Lewisham consultations (Citizen Space)', zone: true },
  { url: 'https://consultations.royalgreenwich.gov.uk/', title: 'Royal Greenwich consultations', zone: true },
  { url: 'https://www.queenelizabetholympicpark.co.uk/', title: 'Queen Elizabeth Olympic Park / LLDC' },
  { url: 'https://www.london-fire.gov.uk/news/', title: 'London Fire Brigade news' },
  { url: 'https://northeastlondon.icb.nhs.uk/news/', title: 'NHS North East London news' },
  { url: 'https://www.bartshealth.nhs.uk/news', title: 'Barts Health NHS Trust news' },
];
const TRANSPORT_PAGES = [
  { url: 'https://tfl.gov.uk/info-for/media/press-releases', title: 'TfL press releases' },
  { url: 'https://pla.co.uk/news', title: 'Port of London Authority news', zone: true },
  { url: 'https://canalrivertrust.org.uk/news-and-views/news', title: 'Canal & River Trust news' },
  { url: 'https://www.londoncityairport.com/', title: 'London City Airport', zone: true },
  { url: 'https://www.thamesclippers.com/', title: 'Uber Boat by Thames Clippers', zone: true },
  { url: 'https://www.londonreconnections.com/', title: 'London Reconnections' },
];
// (f) social: hashtag feeds on a general and a London Mastodon instance
const MASTODON_TAGS = ['canarywharf', 'isleofdogs', 'docklands', 'towerhamlets', 'greenwich', 'deptford', 'rotherhithe', 'poplar', 'limehouse', 'wapping', 'royaldocks', 'london'];
const MASTODON_HOSTS = ['mastodon.social', 'mastodon.london'];
const BSKY_TERMS = ['canary wharf', 'isle of dogs', 'docklands', 'tower hamlets', 'greenwich', 'rotherhithe', 'deptford', 'lewisham', 'southwark', 'newham', 'poplar', 'london borough'];
// a registrable domain under a public-body suffix (lewisham.gov.uk, not cllr.lewisham.gov.uk), or a .london domain
const BSKY_PUBLIC_SUFFIX = /^[a-z0-9-]+\.(gov\.uk|nhs\.uk|police\.uk|ac\.uk|sch\.uk|london)$/i;
const SUBREDDITS = ['london', 'CanaryWharf', 'TowerHamlets', 'greenwich', 'deptford', 'Lewisham', 'newham', 'southwark', 'eastlondon', 'southlondon', 'LondonSocialClub'];
const REDDIT_SEARCHES = ['"canary wharf"', '"isle of dogs"', 'docklands', 'rotherhithe'];
const LEMMY = [{ host: 'feddit.uk', q: 'london' }];
const GROUPSIO_TERMS = ['london', 'docklands', 'isle of dogs', 'tower hamlets', 'greenwich', 'rotherhithe', 'deptford'];
const MEETUP_GROUPS = ['canary-wharf-coffee-walk'];
// (a) directories
const FEEDSPOT_SLUGS = ['london_rss_feeds', 'london_news_rss_feeds', 'london_history_rss_feeds', 'london_theatre_rss_feeds', 'london_lifestyle_rss_feeds',
  'london_law_rss_feeds', 'london_travel_rss_feeds', 'london_food_rss_feeds', 'london_events_rss_feeds', 'london_music_rss_feeds',
  'london_property_rss_feeds', 'london_restaurant_rss_feeds', 'london_art_rss_feeds', 'london_photography_rss_feeds', 'london_architecture_rss_feeds',
  'london_business_rss_feeds', 'london_cycling_rss_feeds', 'east_london_rss_feeds', 'south_london_rss_feeds', 'london_parenting_rss_feeds',
  'london_tech_rss_feeds', 'evening_standard_rss_feeds'];
const OOH_OPML = ['https://ooh.directory/feeds/cats/97nr96/opml/london.xml', 'https://ooh.directory/feeds/cats/g6oe47/opml/areas.xml'];
const GITHUB_LISTS = [ // found by GitHub code search (2026-10-04): "london extension:opml", "ianvisits extension:opml", "londonist.com/feed"
  { repo: 'nate-parrott/feeeed-db', path: 'scraped/ooh_opmls/countries/uk/london.opml', type: 'opml' },
  { repo: 'nate-parrott/feeeed-db', path: 'scraped/ooh_opmls/countries/uk/london/areas.opml', type: 'opml' },
  { repo: 'potemkin666/AlbertAlert', path: 'data/sources/london/context.json', type: 'albertalert' },
];
const WIKI_CATEGORIES = ['Category:London newspapers'];
const WIKI_LISTS = ['List of newspapers in London'];
const ICNN_KML = 'https://www.google.com/maps/d/kml?mid=13EPEnZ3byJLcekzhu13Y2ZPCmGQzpEC1&forcekml=1'; // the member map embedded on https://www.icnn.co.uk/interactive-map-of-members/
const GREATER_LONDON_BOX = { w: -0.52, e: 0.34, s: 51.28, n: 51.70 };

// recorded, never fetched: no open feed, or the platform's terms forbid automated access
export const EXCLUDED = [
  { name: 'Facebook groups and pages', reason: 'No open feed (Facebook removed page RSS in 2015 and groups never had one). Facebook terms forbid automated collection without written permission. Excluded; no workaround tried.' },
  { name: 'Nextdoor', reason: 'No public feed or API for neighbourhood posts; posts need an account and verified address; terms forbid scraping. Excluded.' },
  { name: 'WhatsApp groups and communities', reason: 'Private, end-to-end encrypted, invitation only; no feed. Excluded.' },
  { name: 'X (Twitter) accounts and searches', reason: 'RSS removed in 2013; the API is paid; terms forbid scraping. Excluded (e.g. @IsleofDogsForum is on X only).' },
  { name: 'Instagram and TikTok', reason: 'No feed; terms forbid automated collection. Excluded.' },
  { name: 'Google Groups', reason: 'Google removed Google Groups RSS and Atom feeds (2021 onward); archives need a browser session. Excluded.' },
  { name: 'Reddit RSS (subreddit and search feeds)', reason: 'Feeds exist at https://www.reddit.com/r/<name>/.rss and /search.rss?q=..., but robots.txt says "User-agent: * Disallow: /" and the Reddit Public Content Policy restricts automated access. URLs recorded as facts, not fetched by the tool. One exploratory request to /r/london/.rss on 2026-10-04 (HTTP 200, Atom) was made before robots.txt was read; no other request.' },
  { name: 'groups.io group feeds', reason: 'Group feeds are at https://groups.io/g/<group>/rss, but robots.txt disallows /g/*/rss for every user agent and says "AI crawlers must obtain a license to access any Groups.io data". Only the public search page (allowed) was read, for group names and URLs; no feed or archive was fetched.' },
  { name: 'JISCMail list archives', reason: 'Every page, robots.txt included, answered with a Cloudflare JavaScript challenge on 2026-10-04. Not bypassed; LISTSERV RSS URLs (wa-jisc.exe?RSS&L=<list>) not checked.' },
  { name: 'Meetup event feeds', reason: 'robots.txt disallows */events/rss/*, */events/atom/* and */calendar/*rss*; the group iCal (allowed) answers but held 0 events in October 2026; the GraphQL API needs an OAuth key. Group iCal recorded as checked.' },
  { name: 'Eventbrite', reason: 'Event search API removed (404); organiser events need a private token. Recorded only (already in feeds.json); no key used.' },
  { name: 'Google News RSS search', reason: 'Search feeds aggregate third-party articles under Google terms that do not allow automated use for a catalogue; not used.' },
];

// ============================== seed stage ==============================
async function seedStage() {
  const file = join(RAW, 'seeds.json');
  if (!flags.has('--refresh') && existsSync(file)) return readJson(file);
  const seeds = [], log = [];
  const add = list => { for (const s of list) seeds.push(s); };
  const note = (method, what, result) => { log.push({ method, what, result, date: TODAY }); console.log(`[seed] ${method}: ${what} -> ${result}`); };

  // the 61 feeds found by the earlier site crawl (tools/crawl-sites.mjs)
  const disc = readJson(join(CW, 'registry', 'sources', 'web', 'discovered-feeds.json'));
  add(disc.feeds.map(f => ({ url: f.url, as: 'feed', found_by: 'site-crawl', source: 'registry/sources/web/discovered-feeds.json (tools/crawl-sites.mjs, 2026-10-03)',
    kind: /gov\.uk/.test(f.url) ? 'council' : /canarywharf\.com|newsonthewharf/.test(f.url) ? 'news' : f.format === 'ical' ? 'events' : 'business',
    title: decode(f.title || '') || null, zone: true, found_on: f.found_on?.slice(0, 2) })));
  note('site-crawl', 'registry/sources/web/discovered-feeds.json', `${disc.feeds.length} feeds`);

  // (a) ooh.directory London OPML exports (robots.txt: Allow /)
  for (const u of OOH_OPML) {
    const r = await politeGet(u);
    const outl = [...(r.text || '').matchAll(/<outline\b[^>]*xmlUrl=[^>]*>/g)].map(m => ({ url: normUrl(decode(attr(m[0], 'xmlUrl')), u), title: decode(attr(m[0], 'title') || attr(m[0], 'text')), site: attr(m[0], 'htmlUrl') }));
    add(S('ooh-directory', u, 'news', outl.filter(o => o.url).map(o => ({ url: o.url, as: 'feed', title: o.title, site: o.site }))));
    note('ooh-directory', u, r.status ? `HTTP ${r.status}, ${outl.length} feeds` : r.error || r.robots);
  }
  // (a) GitHub lists (no licence file in either repo: feed URLs taken as facts only)
  for (const g of GITHUB_LISTS) {
    const u = `https://raw.githubusercontent.com/${g.repo}/HEAD/${g.path.split('/').map(encodeURIComponent).join('/')}`;
    const r = await politeGet(u, { checkRobots: false });
    let n = 0;
    if (g.type === 'opml') {
      const outl = [...(r.text || '').matchAll(/<outline\b[^>]*xmlUrl=[^>]*>/g)].map(m => ({ url: normUrl(decode(attr(m[0], 'xmlUrl')), u), title: decode(attr(m[0], 'title') || attr(m[0], 'text')) }));
      add(S('github-list', `https://github.com/${g.repo}/blob/HEAD/${g.path}`, 'news', outl.filter(o => o.url).map(o => ({ url: o.url, as: 'feed', title: o.title })))); n = outl.length;
    } else if (g.type === 'albertalert') {
      try {
        const j = JSON.parse(r.text);
        for (const s of j.sources || []) {
          const url = normUrl(s.endpoint); if (!url) continue; n++;
          const kind = /council|gov\.uk|nhs|police|fire|ambulance|tfl|london\.gov/i.test(`${s.id} ${s.provider} ${url}`) ? (/tfl/i.test(url) ? 'transport' : 'council') : 'news';
          seeds.push({ url, as: s.kind === 'rss' || s.kind === 'atom' ? 'feed' : 'page', found_by: 'github-list', source: `https://github.com/${g.repo}/blob/HEAD/${g.path}`, kind, title: decode(s.provider).replace(/\s+a\s+(?=News|Press|Media|Latest|Updates|RSS)/, ' – ') });
        }
      } catch { }
    }
    note('github-list', `${g.repo} ${g.path}`, r.status ? `HTTP ${r.status}, ${n} entries` : r.error);
  }
  // (a) Feedspot London lists (robots.txt allows these paths); only the feed link of each entry ("ext wb-ba") is taken
  for (const slug of FEEDSPOT_SLUGS) {
    const u = `https://rss.feedspot.com/${slug}/`;
    const r = await politeGet(u);
    const links = r.status === 200 ? [...r.text.matchAll(/<a class="ext wb-ba" href="([^"]+)"/g)].map(m => normUrl(decode(m[1]))).filter(Boolean) : [];
    add(S('feedspot', u, /news|standard/.test(slug) ? 'news' : 'news', [...new Set(links)].map(url => ({ url, as: 'feed' }))));
    note('feedspot', u, r.status ? `HTTP ${r.status}, ${links.length} feeds` : r.error || r.robots);
  }
  // (a) Wikipedia category and list (titles and URLs only; text is CC BY-SA) -> Wikidata P856 official website (CC0).
  // The MediaWiki Action API is used as its etiquette asks (descriptive User-Agent, one request at a time). robots.txt
  // ("Disallow: /w/") is for crawlers of rendered pages, so it is not applied to these API calls; recorded in the README.
  {
    const titles = new Set();
    for (const c of WIKI_CATEGORIES) {
      const r = await politeGet(`https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(c)}&cmnamespace=0&cmlimit=500&format=json`, { checkRobots: false });
      try { for (const m of JSON.parse(r.text).query.categorymembers) titles.add(m.title); } catch { }
      note('wikipedia', c, `${titles.size} titles`);
    }
    for (const l of WIKI_LISTS) {
      const r = await politeGet(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(l)}&prop=links&plnamespace=0&pllimit=500&format=json`, { checkRobots: false });
      let n = 0; try { for (const p of Object.values(JSON.parse(r.text).query.pages)) for (const k of p.links || []) { titles.add(k.title); n++; } } catch { }
      note('wikipedia', l, `${n} linked titles`);
    }
    const qids = new Map(); const list = [...titles];
    for (let i = 0; i < list.length; i += 50) {
      const r = await politeGet(`https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&titles=${encodeURIComponent(list.slice(i, i + 50).join('|'))}&format=json`, { checkRobots: false });
      try { for (const p of Object.values(JSON.parse(r.text).query.pages)) if (p.pageprops?.wikibase_item) qids.set(p.pageprops.wikibase_item, p.title); } catch { }
    }
    const ids = [...qids.keys()];
    const q = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
SELECT ?item ?site ?end WHERE { VALUES ?item { ${ids.map(x => 'wd:' + x).join(' ')} } ?item wdt:P856 ?site . OPTIONAL { ?item wdt:P576 ?end } }`;
    // QLever first (paced by lib.mjs: one query at a time, backoff on 429), else the Wikidata Query Service
    let rows = [], endpoint = 'QLever';
    try { rows = await qlever(q.replace(/^PREFIX[^\n]*\n?/gm, '').replace(/^PREFIX.*?(?=SELECT)/s, '')); }
    catch (e) {
      endpoint = 'Wikidata Query Service';
      const r = await politely('query.wikidata.org', () => fetch('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ query: q }), signal: AbortSignal.timeout(60000) }).then(x => x.json()).catch(() => ({})));
      rows = r.results?.bindings || [];
    }
    const live = rows.filter(b => !b.end);
    const seen = new Set();
    for (const b of live) {
      const qid = b.item.value.split('/').pop(); const site = normUrl(b.site.value); if (!site || seen.has(qid)) continue; seen.add(qid);
      seeds.push({ url: site, as: 'page', found_by: 'wikipedia-wikidata', source: `https://www.wikidata.org/wiki/${qid} (P856), from ${WIKI_CATEGORIES.concat(WIKI_LISTS).join('; ')}`, kind: 'news', title: qids.get(qid), wikidata: qid });
    }
    note('wikipedia-wikidata', `${ids.length} Wikidata items (${endpoint})`, `${rows.length} with P856, ${seen.size} without P576 (dissolved) kept`);
  }
  // (c) ICNN member map (Google My Maps KML export): members inside Greater London
  {
    const r = await politeGet(ICNN_KML, { checkRobots: false });
    let n = 0;
    for (const p of (r.text || '').matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
      const name = decode((/<name>([\s\S]*?)<\/name>/.exec(p[1]) || [])[1]);
      const co = /<coordinates>\s*([-\d.]+),([-\d.]+)/.exec(p[1]); if (!co) continue;
      const lon = +co[1], lat = +co[2]; const B = GREATER_LONDON_BOX;
      if (lon < B.w || lon > B.e || lat < B.s || lat > B.n) continue;
      const url = ((/<description>([\s\S]*?)<\/description>/.exec(p[1]) || [])[1] || '').match(/https?:\/\/[^\s<"\]]+/)?.[0];
      if (!url) { seeds.push({ url: null, as: 'none', found_by: 'icnn-map', source: ICNN_KML, kind: 'news', title: name, note: 'no website in the member map' }); continue; }
      seeds.push({ url: normUrl(url), as: 'page', found_by: 'icnn-map', source: 'ICNN member map (https://www.icnn.co.uk/interactive-map-of-members/)', kind: 'news', title: name }); n++;
    }
    note('icnn-map', ICNN_KML, r.status ? `HTTP ${r.status}, ${n} London members with a website` : r.error);
  }
  // (c) hand lists
  add(S('hand-local-news', "owner's brief (2026-10-04) and zone publishers known to the project", 'news', LOCAL_NEWS.map(x => ({ as: 'page', ...x }))));
  add(S('hand-community', 'zone community, faith, school and venue sites (web search, 2026-10-04)', 'community forum', COMMUNITY.map(x => ({ as: 'page', ...x }))));
  // (d) councils and public bodies
  add(Object.entries(MODERNGOV).map(([name, url]) => ({ url, as: 'feed', found_by: 'moderngov', source: 'London borough ModernGov hosts (the mgRss.aspx pattern of the five feeds already in events.json)', kind: 'council', title: `${name}: democracy what's new (ModernGov RSS)`, zone: ZONE_BOROUGHS.has(name) })));
  add(S('council-sites', 'council news and consultation pages', 'council', COUNCIL_PAGES.map(x => ({ as: 'page', ...x }))));
  add(S('public-bodies', 'TfL, PLA, CRT, London City Airport, river bus', 'transport', TRANSPORT_PAGES.map(x => ({ as: 'page', ...x }))));
  { // GLA: every feed listed on its RSS page
    const u = 'https://www.london.gov.uk/rss-feeds'; const r = await politeGet(u);
    const links = [...(r.text || '').matchAll(/<a[^>]+href="([^"]*rss-feeds\/\d+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m => ({ url: normUrl(m[1], u), title: 'GLA: ' + decode(m[2]) }));
    const uniq = [...new Map(links.map(l => [l.url, l])).values()].filter(l => !/News from|Publications from|vacancies|Schools for Success|Assembly members$/.test(l.title));
    add(uniq.map(l => ({ ...l, as: 'feed', found_by: 'public-bodies', source: u, kind: 'council' })));
    note('public-bodies', u, r.status ? `HTTP ${r.status}, ${links.length} feeds listed, ${uniq.length} kept (former members' feeds, vacancies and school profiles left out)` : r.error);
  }
  // (e) mailing lists: groups.io public search (names and URLs only; feeds disallowed by robots.txt)
  for (const t of GROUPSIO_TERMS) {
    const u = `https://groups.io/search?q=${encodeURIComponent(t)}`; const r = await politeGet(u);
    let n = 0;
    if (r.status === 200) {
      const seen = new Set();
      for (const row of r.text.split(/<tr>/).slice(1)) {
        const m = /href="https:\/\/groups\.io\/g\/([^"/?]+)[^"]*"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)<\/td>/.exec(row); if (!m) continue;
        const g = m[1]; if (seen.has(g)) continue; seen.add(g);
        const desc = decode(m[3].replace(/<script[\s\S]*?<\/script>/g, ' '));
        // London only: the name says London or a zone/borough place, or the description places the group in London
        const name = `${g} ${decode(m[2])}`;
        if (!(/london|docklands|isle ?of ?dogs|tower ?ham|rotherhithe|deptford|poplar|wapping|southwark|lewisham|newham|E14|SE16/i.test(name)
          || /\b(east|south|north|west|central|in|of) london\b|london borough|tower hamlets|docklands|isle of dogs|rotherhithe|deptford|southwark|lewisham|newham|\bE14\b|\bSE1[06]\b/i.test(desc))) continue;
        seeds.push({ url: `https://groups.io/g/${g}/rss`, as: 'not-fetched', found_by: 'groups-io', source: u, kind: 'mailing list', title: decode(m[2]).slice(0, 80) || g,
          group: `https://groups.io/g/${g}`, archive: /Private Archive/i.test(desc) ? 'private' : /Archive/i.test(desc) ? 'public' : 'unknown',
          terms: 'robots.txt disallows /g/*/rss; groups.io asks AI crawlers to obtain a licence: listed, not fetched' }); n++;
      }
    }
    note('groups-io', u, r.status ? `HTTP ${r.status}, ${n} London groups` : r.error || r.robots);
  }
  // (f) Reddit: URLs recorded, never fetched (robots.txt Disallow: /)
  add(SUBREDDITS.map(s => ({ url: `https://www.reddit.com/r/${s}/.rss`, as: 'not-fetched', found_by: 'reddit', source: 'hand list of London subreddits', kind: 'social', title: `r/${s}`, terms: 'robots.txt Disallow: / and the Reddit Public Content Policy: URL recorded, not fetched' })));
  add(REDDIT_SEARCHES.map(q => ({ url: `https://www.reddit.com/search.rss?q=${encodeURIComponent(q)}&sort=new`, as: 'not-fetched', found_by: 'reddit', source: 'Reddit search RSS pattern', kind: 'social', title: `Reddit search ${q}`, zone: true, terms: 'robots.txt Disallow: /: URL recorded, not fetched' })));
  // (f) Lemmy communities on a UK instance (API search; the web /search/ path is disallowed, the API is not)
  for (const l of LEMMY) {
    const u = `https://${l.host}/api/v3/search?q=${encodeURIComponent(l.q)}&type_=Communities&limit=50`; const r = await politeGet(u);
    let n = 0; try { for (const c of JSON.parse(r.text).communities || []) { const name = c.community.name; seeds.push({ url: `https://${l.host}/feeds/c/${name}.xml`, as: 'feed', found_by: 'lemmy', source: u, kind: 'community forum', title: `${l.host} c/${name}` }); n++; } } catch { }
    note('lemmy', u, r.status ? `HTTP ${r.status}, ${n} communities` : r.error || r.robots);
  }
  // (f) Mastodon hashtag RSS
  for (const h of MASTODON_HOSTS) add(MASTODON_TAGS.map(t => ({ url: `https://${h}/tags/${t}.rss`, as: 'feed', found_by: 'mastodon', source: `Mastodon hashtag RSS on ${h}`, kind: 'social', title: `#${t} on ${h}`, zone: t !== 'london' })));
  // (f) Bluesky: public search API; organisations only (handle under a public-body suffix, or the domain of a publisher already found)
  {
    const hosts = new Set(seeds.filter(s => s.url).map(s => { try { return new URL(s.url).host.replace(/^www\./, ''); } catch { return null; } }).filter(Boolean));
    const keep = new Map();
    for (const t of BSKY_TERMS) {
      const u = `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=${encodeURIComponent(t)}&limit=50`; const r = await politeGet(u);
      let n = 0, k = 0; try { for (const a of JSON.parse(r.text).actors || []) { n++; const h = a.handle; if (BSKY_PUBLIC_SUFFIX.test(h) || hosts.has(h)) { if (!keep.has(h)) { keep.set(h, { url: `https://bsky.app/profile/${h}/rss`, as: 'feed', found_by: 'bluesky', source: u, kind: 'social', title: decode(a.displayName || h) }); k++; } } } } catch { }
      note('bluesky', u, r.status ? `HTTP ${r.status}, ${n} accounts, ${k} organisation handles kept` : r.error || r.robots);
    }
    add([...keep.values()]);
  }
  // (f) Meetup group iCal (allowed by robots.txt)
  add(MEETUP_GROUPS.map(g => ({ url: `https://www.meetup.com/${g}/events/ical/`, as: 'feed', found_by: 'meetup', source: 'feeds/events.json (known group near E14)', kind: 'events', title: `Meetup: ${g}`, zone: true })));
  writeJson(file, { date: TODAY, log, seeds });
  writeJson(ROBOTS_FILE, Object.fromEntries(robotsCache));
  return { date: TODAY, log, seeds };
}

// ============================== Common Crawl stage ==============================
// Columnar index (Parquet) of one crawl, read over HTTPS with range requests: footers -> the row groups that hold the
// .london and .uk hosts -> url_host_name scanned -> hosts with London place names (sampled) -> the first capture of each
// host -> its WARC record (one range request) -> <link rel=alternate> feeds, kept when the page is about London.
const CC_CRAWL = 'CC-MAIN-2026-39';
const CC_BASE = 'https://data.commoncrawl.org/';
const CC_PLACE_RE = /canary-?wharf|isle-?of-?dogs|docklands|rotherhithe|greenwich|deptford|poplar|limehouse|wapping|millwall|cubitt|blackwall|surrey-?quays|canada-?water|tower-?hamlets|silvertown|royal-?docks|(^|[.-])(e14|se16|se10|se8|e16|e1w)([.-]|$)|bermondsey|lewisham|newham|southwark|shadwell|leamouth|london/i;
const CC_CORE_RE = /canary-?wharf|isle-?of-?dogs|docklands|rotherhithe|deptford|poplar|limehouse|wapping|millwall|cubitt|blackwall|surrey-?quays|canada-?water|silvertown|royal-?docks|(^|[.-])(e14|se16|se10|se8|e16|e1w)([.-]|$)|shadwell|leamouth/i;
const CC_SAMPLE = { dotlondon: 200, core: 500, borough: 100, london: 200 };
async function ccStage() {
  const file = join(RAW, 'cc-feeds.json');
  if (!flags.has('--refresh') && existsSync(file)) return readJson(file);
  let hp, comp;
  try {
    if (process.env.CC_LIBS) { // a directory holding node_modules/hyparquet and node_modules/hyparquet-compressors
      hp = await import(pathToFileURL(join(process.env.CC_LIBS, 'node_modules', 'hyparquet', 'src', 'index.js')).href);
      comp = (await import(pathToFileURL(join(process.env.CC_LIBS, 'node_modules', 'hyparquet-compressors', 'src', 'index.js')).href)).compressors;
    } else { hp = await import('hyparquet'); comp = (await import('hyparquet-compressors')).compressors; }
  } catch { console.error('cc stage needs hyparquet: npm i --prefix <dir> hyparquet hyparquet-compressors, then CC_LIBS=<dir>'); return null; }
  let reqs = 0, bytes = 0;
  // every request to data.commoncrawl.org goes through one queue (one at a time, >= 1 s apart), with up to 4 tries on
  // 403, 429 and 5xx (CloudFront answered a burst with 403 on the first run), waiting 15, 45, 135 s
  const ccFetch = async (url, init = {}) => {
    for (let k = 0; ; k++) {
      const r = await politely('data.commoncrawl.org', () => fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(120000) })
        .then(async x => ({ status: x.status, headers: x.headers, buf: init.method === 'HEAD' ? null : await x.arrayBuffer() })).catch(e => ({ status: 0, error: e.message })));
      reqs++;
      if (r.status >= 200 && r.status < 300) { if (r.buf) bytes += r.buf.byteLength; return r; }
      if (k >= 3 || !(r.status === 0 || r.status === 403 || r.status === 429 || r.status >= 500)) throw new Error(`Common Crawl ${r.status} ${r.error || ''} ${url}`);
      await sleep(15000 * 3 ** k);
    }
  };
  const ccBuffer = async url => {
    const h = await ccFetch(url, { method: 'HEAD' });
    const byteLength = Number(h.headers.get('content-length'));
    return { byteLength, slice: async (s, e) => (await ccFetch(url, { headers: { Range: `bytes=${s}-${(e ?? byteLength) - 1}` } })).buf };
  };
  const T0 = Date.now();
  // 1. part list and footers (cached)
  const pathsGz = await (await fetch(`${CC_BASE}crawl-data/${CC_CRAWL}/cc-index-table.paths.gz`, { headers: { 'User-Agent': UA } })).arrayBuffer(); reqs++;
  const parts = gunzipSync(Buffer.from(pathsGz)).toString().trim().split('\n').filter(p => p.includes('subset=warc/'));
  const fFile = join(RAW, `cc-footers-${CC_CRAWL}.json`);
  const footers = readJson(fFile, {});
  for (let i = 0; i < parts.length; i++) {
    if (footers[i]) continue;
    for (let t = 0; t < 3; t++) try {
      const file = await ccBuffer(CC_BASE + parts[i]);
      const md = await hp.parquetMetadataAsync(file);
      const cols = md.row_groups[0].columns.map(c => c.meta_data.path_in_schema.join('.')); const si = cols.indexOf('url_surtkey');
      footers[i] = { path: parts[i], rgs: md.row_groups.map(rg => ({ rows: Number(rg.num_rows), min: String(rg.columns[si].meta_data.statistics?.min_value).slice(0, 60), max: String(rg.columns[si].meta_data.statistics?.max_value).slice(0, 60) })) };
      break;
    } catch (e) { await sleep(5000); }
    if (i % 25 === 0) writeJson(fFile, footers);
    await sleep(GAP_MS);
  }
  writeJson(fFile, footers);
  // 2. row groups that can hold london, and uk, hosts (url_surtkey is the reversed host: "london,foo)/", "uk,co,foo)/")
  const targets = [];
  for (const [i, p] of Object.entries(footers)) p.rgs.forEach((rg, j) => {
    for (const pre of ['london,', 'uk,']) if (rg.max >= pre && rg.min < pre + '￿') targets.push({ part: +i, rg: j, tld: pre.slice(0, -1) });
  });
  // 3. host scan
  const hostRows = new Map(); // host -> {part, rg, row (absolute), tld}
  const files = new Map();
  const openPart = async i => { if (!files.has(i)) { const f = await ccBuffer(CC_BASE + footers[i].path); files.set(i, { file: f, md: await hp.parquetMetadataAsync(f) }); } return files.get(i); };
  for (const t of targets) {
    const { file, md } = await openPart(t.part);
    let start = 0; for (let j = 0; j < t.rg; j++) start += Number(md.row_groups[j].num_rows);
    let d; await hp.parquetRead({ file, metadata: md, columns: ['url_host_name'], rowStart: start, rowEnd: start + Number(md.row_groups[t.rg].num_rows), compressors: comp, onComplete: x => d = x });
    d.forEach(([h], k) => {
      if (!h || hostRows.has(h)) return;
      if (t.tld === 'london' && h.endsWith('.london')) hostRows.set(h, { part: t.part, row: start + k, tld: 'london' });
      else if (t.tld === 'uk' && h.endsWith('.uk') && CC_PLACE_RE.test(h)) hostRows.set(h, { part: t.part, row: start + k, tld: 'uk' });
    });
    await sleep(GAP_MS);
  }
  console.log(`[cc] ${targets.length} row groups scanned, ${hostRows.size} hosts kept (${reqs} requests, ${Math.round(bytes / 1e6)} MB)`);
  // 4. deterministic sample (by sha1 of the host name)
  const groups = { dotlondon: [], core: [], borough: [], london: [] };
  for (const [h, v] of hostRows) {
    const g = v.tld === 'london' ? 'dotlondon' : CC_CORE_RE.test(h) ? 'core' : /london/i.test(h) && !/greenwich|lewisham|southwark|newham|bermondsey|tower-?hamlets/i.test(h) ? 'london' : 'borough';
    groups[g].push(h);
  }
  const picked = [];
  for (const [g, hs] of Object.entries(groups)) { hs.sort((a, b) => sha1(a).localeCompare(sha1(b))); for (const h of hs.slice(0, CC_SAMPLE[g])) picked.push({ host: h, group: g, ...hostRows.get(h) }); }
  // 5. the first capture of each picked host (surt order: the root "/" sorts first). Read per row group: the six small
  // columns of every row group that holds a picked host, in whole column chunks (few large requests, not many small ones)
  const caps = [];
  const byRg = new Map();
  for (const p of picked) {
    const { md } = await openPart(p.part);
    let start = 0, j = 0; while (j < md.row_groups.length && start + Number(md.row_groups[j].num_rows) <= p.row) start += Number(md.row_groups[j++].num_rows);
    const k = `${p.part}:${j}`; if (!byRg.has(k)) byRg.set(k, { part: p.part, start, rows: Number(md.row_groups[j].num_rows), hosts: [] }); byRg.get(k).hosts.push(p);
  }
  for (const g of byRg.values()) {
    const { file, md } = await openPart(g.part);
    let d; await hp.parquetRead({ file, metadata: md, columns: ['url_host_name', 'fetch_status', 'content_mime_detected', 'warc_filename', 'warc_record_offset', 'warc_record_length'], rowStart: g.start, rowEnd: g.start + g.rows, compressors: comp, onComplete: x => d = x });
    for (const p of g.hosts) {
      for (let r = p.row - g.start; r < d.length && d[r][0] === p.host; r++) {
        const row = d[r];
        if (row[1] === 200 && /html/.test(row[2] || '')) { caps.push({ ...p, warc: row[3], offset: Number(row[4]), length: Number(row[5]) }); break; }
      }
    }
    d = null;
  }
  console.log(`[cc] ${picked.length} hosts sampled, ${caps.length} HTML captures found (${reqs} requests, ${Math.round(bytes / 1e6)} MB)`);
  // 6. WARC records (one range request each, one at a time, >= 1 s apart) -> feed links and London signals
  const found = [];
  for (const c of caps) {
    let html = '';
    try {
      const r = await ccFetch(CC_BASE + c.warc, { headers: { Range: `bytes=${c.offset}-${c.offset + c.length - 1}` } });
      const rec = gunzipSync(Buffer.from(r.buf)).toString('utf8');
      c.url = (/^WARC-Target-URI:\s*(\S+)/mi.exec(rec) || [])[1] || `https://${c.host}/`;
      const i1 = rec.indexOf('\r\n\r\n'); const i2 = rec.indexOf('\r\n\r\n', i1 + 4); html = rec.slice(i2 + 4);
    } catch { c.error = 'warc read failed'; continue; }
    const text = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')).slice(0, 200000);
    const signals = { london_word: LONDON_RE.test(text), london_postcode: LONDON_PC.test(text), zone_terms: zoneTermsIn(text) };
    const aboutLondon = c.tld === 'london' || signals.london_word || signals.london_postcode;
    const feeds = feedLinks(html, c.url);
    c.feeds = feeds.length; c.about_london = aboutLondon;
    if (!aboutLondon) continue;
    for (const f of feeds) found.push({ url: f.url, as: 'feed', found_by: 'common-crawl', source: `${CC_CRAWL} columnar index (${c.group} hosts), WARC capture of ${c.url}`, kind: null, title: f.title, found_on: [c.url], cc: { crawl: CC_CRAWL, group: c.group, ...signals } });
  }
  const summary = {
    crawl: CC_CRAWL, date: TODAY, index_parts: parts.length, row_groups_scanned: targets.length,
    hosts: { dotlondon: groups.dotlondon.length, core: groups.core.length, borough: groups.borough.length, london: groups.london.length },
    sampled: picked.length, captures: caps.length, about_london: caps.filter(c => c.about_london).length,
    pages_with_feeds: caps.filter(c => c.about_london && c.feeds).length, feeds: found.length,
    requests: reqs, megabytes: Math.round(bytes / 1e6), seconds: Math.round((Date.now() - T0) / 1000),
    query: `hosts ending .london (all, in surt range "london,"), and hosts ending .uk whose name matches ${CC_PLACE_RE.source}; sample sizes ${JSON.stringify(CC_SAMPLE)} by sha1(host) order; first capture with HTTP 200 and an HTML MIME type; feed links from <link rel=alternate>; .uk pages kept only when the text says "London" or has a London postcode`,
  };
  console.log('[cc]', JSON.stringify(summary));
  const out = { summary, seeds: found };
  writeJson(file, out);
  return out;
}

// ============================== autodiscovery stage ==============================
async function autodiscoverStage(seeds) {
  const file = join(RAW, 'autodiscover.json');
  const done = flags.has('--refresh') ? {} : readJson(file, {});
  const pages = [...new Map(seeds.filter(s => s.as === 'page' && s.url).map(s => [s.url, s])).values()].filter(s => !done[s.url]);
  console.log(`[autodiscover] ${pages.length} pages to read (${Object.keys(done).length} cached)`);
  let k = 0;
  await pool(pages, async s => {
    const r = await politeGet(s.url);
    const rec = { date: TODAY, http: r.status || 0, final_url: r.final_url, error: r.error, robots: r.robots, blocked: r.blocked, feeds: [] };
    if (r.status === 200 && !r.blocked) rec.feeds = feedLinks(r.text, r.final_url || s.url);
    // a hand-listed site with no advertised feed: try the common feed paths, stop at the first that parses
    if (r.status === 200 && !r.blocked && !rec.feeds.length && /^hand-|council-sites|public-bodies/.test(s.found_by)) {
      for (const p of ['/feed/', '/rss.xml', '/feed.xml', '/rss', '/news/rss/']) {
        const u = new URL(p, r.final_url || s.url).href; const g = await politeGet(u);
        let parsed = null; try { parsed = g.status === 200 && !g.blocked ? parseFeed(g.text) : null; } catch { }
        if (parsed) { rec.feeds.push({ url: g.final_url || u, format: parsed.format, title: parsed.title, how: `common path ${p}` }); break; }
      }
    }
    done[s.url] = rec;
    if (++k % 20 === 0) { writeJson(file, done); console.log(`[autodiscover] ${k}/${pages.length}`); }
  });
  writeJson(file, done);
  writeJson(ROBOTS_FILE, Object.fromEntries(robotsCache));
  return done;
}

// ============================== verification stage ==============================
function relevance(items) {
  const cutoff = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const r = { items: items.length, recent_items: 0, zone_items: 0, zone_recent_items: 0, borough_items: 0, london_items: 0, terms: {} };
  for (const it of items) {
    const recent = it.date && it.date >= cutoff; if (recent) r.recent_items++;
    const terms = zoneTermsIn(it.text || '');
    if (terms.length) { r.zone_items++; if (recent) r.zone_recent_items++; for (const t of terms) r.terms[t] = (r.terms[t] || 0) + 1; }
    if (BOROUGH_RE.test(it.text || '')) r.borough_items++;
    if (LONDON_RE.test(it.text || '') || LONDON_PC.test(it.text || '')) r.london_items++;
  }
  r.share = r.items ? Math.round(100 * r.zone_items / r.items) / 100 : 0;
  return r;
}
async function verifyOne(url) {
  const r = await politeGet(url);
  const v = { date: TODAY, http: r.status || 0, final_url: r.final_url && r.final_url !== url ? r.final_url : undefined, content_type: r.type || undefined };
  if (r.robots) return { ...v, status: 'robots disallowed' };
  if (r.error) return { ...v, status: /robots/.test(r.error) ? 'robots unreachable' : 'network error', error: r.error };
  if (r.blocked) return { ...v, status: 'blocked', blocked: r.blocked };
  if (r.status < 200 || r.status >= 300) return { ...v, status: 'http error' };
  let p = null; try { p = parseFeed(r.text); } catch (e) { v.parse_error = e.message.slice(0, 80); }
  if (!p) return { ...v, status: 'not a feed' };
  const dates = p.items.map(i => i.date).filter(Boolean).sort();
  Object.assign(v, { format: p.format, feed_title: p.title ? p.title.slice(0, 120) : null, items: p.items.length, newest: dates.at(-1) || null, oldest: dates[0] || null,
    title_sample: p.items.slice(0, 2).map(i => (i.title || '').slice(0, 80)).filter(Boolean), relevance: relevance(p.items) });
  if (dates.length > 1) { const span = (Date.parse(dates.at(-1)) - Date.parse(dates[0])) / 864e5; v.items_per_week = Math.round(10 * 7 * (dates.length - 1) / Math.max(span, 1)) / 10; }
  v.status = p.items.length ? 'verified' : 'empty';
  // CORS: a second request carrying the Origin header (after the per-host gap)
  const c = await politeGet(r.final_url || url, { headers: { Origin: ORIGIN }, checkRobots: false });
  v.acao = c.acao || null; v.cors = c.acao === '*' || c.acao === ORIGIN;
  return v;
}
async function verifyStage(cands) {
  const file = join(RAW, 'verify.json');
  const done = flags.has('--refresh') ? {} : readJson(file, {});
  const todo = cands.filter(c => c.fetch && !done[c.url]);
  console.log(`[verify] ${todo.length} feeds to check (${Object.keys(done).length} cached)`);
  let k = 0;
  await pool(todo, async c => {
    done[c.url] = await verifyOne(c.url);
    if (++k % 25 === 0) { writeJson(file, done); console.log(`[verify] ${k}/${todo.length}`); }
  });
  writeJson(file, done);
  writeJson(ROBOTS_FILE, Object.fromEntries(robotsCache));
  return done;
}

// ============================== merge candidates ==============================
const TERMS = {
  'site-crawl': "publisher's own feed; URL, title and counts kept as facts",
  'ooh-directory': 'listed by ooh.directory (OPML export, robots.txt allows); feed URL as a fact; feed under its publisher\'s terms',
  'github-list': 'listed in a GitHub file with no licence file: URL taken as a fact only; feed under its publisher\'s terms',
  feedspot: 'listed on a Feedspot page (copyright Feedspot): URL taken as a fact only; feed under its publisher\'s terms',
  'wikipedia-wikidata': 'title from Wikipedia (CC BY-SA, title only), website from Wikidata P856 (CC0); feed under its publisher\'s terms',
  'icnn-map': 'ICNN member map (Google My Maps KML export): name and website as facts; feed under its publisher\'s terms',
  'hand-local-news': "publisher's terms; feed URL, title and counts kept as facts",
  'hand-community': "publisher's terms; feed URL, title and counts kept as facts",
  moderngov: 'council website terms (ModernGov); meeting titles are public records; URL and counts as facts',
  'council-sites': 'council website terms (OGL v3.0 where stated); URL and counts as facts',
  'public-bodies': 'public body terms (GLA and TfL content under OGL v3.0 where stated); URL and counts as facts',
  'groups-io': 'robots.txt disallows /g/*/rss; groups.io asks AI crawlers for a licence: listed, not fetched',
  reddit: 'robots.txt Disallow: /; Reddit Public Content Policy: URL recorded, not fetched',
  lemmy: 'posts belong to their authors (instance terms); counts only, no titles kept',
  mastodon: 'posts belong to their authors (instance terms); counts only, no titles kept',
  bluesky: 'posts belong to the account (Bluesky terms; robots.txt allows); counts only, no titles kept',
  meetup: 'Meetup terms; robots.txt allows the group iCal; counts only',
  'common-crawl': 'found in a Common Crawl capture (crawl allowed for scoping, owner 2026-10-03); feed under its publisher\'s terms',
};
const PERSONAL = new Set(['social', 'community forum', 'mailing list']); // no item titles kept for these kinds (posts by private people)
function kindOf(c, v) {
  if (c.kind) return c.kind;
  const u = c.url.toLowerCase();
  if (v?.format === 'ics' || /event|whats-?on|calendar|ical/.test(u)) return 'events';
  if (/gov\.uk|nhs\.uk|police\.uk|london\.gov/.test(u)) return 'council';
  if (/news|press|gazette|times|echo|advertiser|mercury|post|wire|journal|herald|chronicle/.test(u)) return 'news';
  return 'business';
}
function mergeCandidates(seeds, cc, auto, verify) {
  const byKey = new Map();
  const put = (s, extra = {}) => {
    if (!s.url) return;
    const k = keyOf(s.url);
    const c = byKey.get(k) || { url: s.url, found_by: [], sources: [], kind: null, title: null, zone_publisher: false, fetch: false, pages: [] };
    if (!c.found_by.includes(s.found_by)) c.found_by.push(s.found_by);
    if (s.source && !c.sources.includes(s.source)) c.sources.push(s.source);
    c.kind = c.kind || s.kind || null; c.title = c.title || s.title || null; c.zone_publisher ||= !!s.zone;
    if (s.as === 'feed') c.fetch = true;
    if (s.as === 'not-fetched') { c.not_fetched = s.terms; }
    for (const k2 of ['group', 'archive', 'wikidata', 'cc']) if (s[k2] && !c[k2]) c[k2] = s[k2];
    for (const p of [...(s.found_on || []), ...(extra.pages || [])]) if (c.pages.length < 3 && !c.pages.includes(p)) c.pages.push(p);
    byKey.set(k, c);
  };
  for (const s of seeds) if (s.as !== 'page') put(s);
  for (const s of cc?.seeds || []) put(s);
  // pages: each advertised feed becomes a candidate; a page with none is kept as a candidate with a status
  const pageRows = [];
  for (const s of seeds.filter(x => x.as === 'page' && x.url)) {
    const a = auto[s.url];
    if (!a) continue;
    if (a.feeds?.length) {
      // keep at most 3 feeds per page (main feed, comments excluded; then category feeds)
      for (const f of a.feeds.slice(0, 3)) put({ ...s, url: f.url, as: 'feed', title: s.title || f.title }, { pages: [s.url] });
    } else pageRows.push({ url: s.url, found_by: [s.found_by], sources: [s.source], kind: s.kind, title: s.title, zone_publisher: !!s.zone,
      verified: { date: a.date, status: a.robots ? 'robots disallowed' : a.blocked ? 'blocked' : a.error ? 'network error' : a.http !== 200 ? 'http error' : 'no feed advertised', http: a.http, error: a.error, blocked: a.blocked } });
  }
  for (const s of seeds.filter(x => x.as === 'none')) pageRows.push({ url: null, found_by: [s.found_by], sources: [s.source], kind: s.kind, title: s.title, verified: { status: 'no website', note: s.note } });
  return { feeds: [...byKey.values()], pageRows };
}

// ============================== build: candidates.json, OPML, events.json ==============================
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
function liveOf(v) { return v?.status === 'verified' && v.newest && v.newest >= new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10); }
function updateOf(v) { const w = v.items_per_week; return w == null ? 'unknown' : w >= 7 ? 'daily or more' : w >= 1 ? 'weekly' : w >= 0.2 ? 'monthly' : 'rarely'; }
function buildStage(seedsOut, cc, auto, verify) {
  const { feeds, pageRows } = mergeCandidates(seedsOut.seeds, cc, auto, verify);
  const known = new Set(['events.json', 'feeds.json'].flatMap(f => { const d = readJson(join(CW, 'feeds', f)); return d.sources.flatMap(s => [s.feed, s.url, s.api, s.sample].filter(Boolean).map(keyOf)); }));
  const rows = [];
  for (const c of feeds) {
    const v = verify[c.url];
    const kind = kindOf(c, v);
    const status = c.not_fetched ? 'not fetched (terms)' : v ? v.status : 'not checked';
    const rel = v?.relevance || null;
    rows.push({
      url: c.url, title: (c.title || v?.feed_title || '').replace(/\s+a\s+(?=News|Press|Media|Latest|Updates|RSS)/, ' – ') || null, found_by: c.found_by, sources: c.sources, pages: c.pages.length ? c.pages : undefined, kind,
      zone_publisher: c.zone_publisher || undefined,
      verified: { date: v?.date || TODAY, status, http: v?.http, final_url: v?.final_url, content_type: v?.content_type, error: v?.error, blocked: v?.blocked },
      format: v?.format || null, items: v?.items ?? null, newest: v?.newest ?? null, live: liveOf(v), update: v ? updateOf(v) : undefined,
      cors: v?.cors ?? null, relevance: rel, title_sample: v && !PERSONAL.has(kind) ? v.title_sample : undefined,
      already_listed: known.has(keyOf(c.url)) || (v?.final_url && known.has(keyOf(v.final_url))) || undefined,
      group: c.group, archive: c.archive, wikidata: c.wikidata, cc: c.cc,
      terms: c.not_fetched || TERMS[c.found_by[0]] || "publisher's terms",
    });
  }
  for (const p of pageRows) rows.push({ ...p, format: null, items: null, newest: null, live: false, cors: null, relevance: null, terms: TERMS[p.found_by[0]] || "publisher's terms" });
  // zone score: recent zone items first, then all zone items, then share
  const score = r => r.relevance ? r.relevance.zone_recent_items * 3 + r.relevance.zone_items + r.relevance.share * 5 : 0;
  rows.sort((a, b) => (b.live - a.live) || score(b) - score(a) || String(a.url).localeCompare(String(b.url)));
  rows.forEach(r => { if (r.relevance) r.relevance.score = Math.round(score(r) * 10) / 10; });
  // the merge rule for events.json: verified, live, not a personal-post kind unless it is a zone hashtag or forum feed,
  // and (zone items >= 1, or a zone publisher, or a council / transport body)
  const toEvents = rows.filter(r => r.live && !r.already_listed
    && (r.relevance?.zone_items >= 1 || r.zone_publisher || ['council', 'transport'].includes(r.kind))
    && !(r.kind === 'social' && !(r.relevance?.zone_items >= 1)));
  const counts = { candidates: rows.length, by_status: {}, by_method: {}, verified_by_kind: {}, live_by_kind: {}, to_events_json: toEvents.length };
  for (const r of rows) {
    counts.by_status[r.verified.status] = (counts.by_status[r.verified.status] || 0) + 1;
    for (const m of r.found_by) { const x = counts.by_method[m] ||= { candidates: 0, verified: 0, live: 0 }; x.candidates++; if (r.verified.status === 'verified') x.verified++; if (r.live) x.live++; }
    if (r.verified.status === 'verified') counts.verified_by_kind[r.kind] = (counts.verified_by_kind[r.kind] || 0) + 1;
    if (r.live) counts.live_by_kind[r.kind] = (counts.live_by_kind[r.kind] || 0) + 1;
  }
  // best for the zone: content feeds (hashtag and other social feeds match their own tag by construction: listed apart)
  const best = rows.filter(r => r.live && r.relevance && r.kind !== 'social').slice(0, 20).map(r => ({ url: r.url, title: r.title, kind: r.kind, items: r.items, zone_items: r.relevance.zone_items, zone_recent_items: r.relevance.zone_recent_items, score: r.relevance.score }));
  const meta = {
    generated: TODAY, tool: 'tools/discover-feeds.mjs', skill: 'skills/cwplans-feed-discovery/SKILL.md',
    note: 'Every candidate London feed found by the methods below, with its verification. Facts only: feed URL, title, item count, newest date, CORS, update rate and zone-relevance counts. No feed item text is stored: title_sample holds at most two titles cut to 80 characters, and none for social, forum and mailing-list feeds (posts by private people).',
    politeness: `Node fetch, User-Agent "${UA}", robots.txt (RFC 9309) checked on every host and redirect, one request at a time per host and at least ${GAP_MS / 1000} s apart, at most ${HOSTS_PARALLEL} hosts at once, ${TIMEOUT_MS / 1000} s timeout; CORS from a second request carrying Origin: ${ORIGIN}.`,
    relevance: `Counted over every item in the feed (title, summary, content, categories): zone_items = items naming a zone place (${ZONE_TERMS.join(', ')}) or a zone postcode district (E14, SE16, SE10, SE8, E16, E1W); recent = dated within 120 days; borough_items = Tower Hamlets, Southwark, Lewisham, Newham, Royal Borough of Greenwich; london_items = "London" or a London postcode. score = 3 x zone_recent_items + zone_items + 5 x share.`,
    live: 'verified, with a newest item dated within 365 days',
    merge_rule: 'Added to feeds/events.json when live, not already listed there or in feeds.json, and: at least one item names a zone place, or the publisher is in or beside the zone (hand lists and the site crawl), or it is a council or transport body. Social feeds only with zone items. Entries carry harvest: false unless kind is events, so the what\'s-on harvester (tools/fetch-works.mjs) does not read news feeds as programmes.',
    excluded: EXCLUDED, seed_log: seedsOut.log, common_crawl: cc?.summary || null, counts, best_for_zone: best,
    best_social_for_zone: rows.filter(r => r.live && r.kind === 'social' && r.relevance?.zone_items).slice(0, 10).map(r => ({ url: r.url, title: r.title, items: r.items, zone_items: r.relevance.zone_items, zone_recent_items: r.relevance.zone_recent_items })),
  };
  writeJson(join(OUT, 'candidates.json'), { meta, candidates: rows });
  // OPML: every live London feed, grouped by kind
  const live = rows.filter(r => r.live);
  const kinds = [...new Set(live.map(r => r.kind))].sort();
  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
 <head>
  <title>London feeds (verified ${TODAY}), cwplans</title>
  <dateCreated>${new Date().toUTCString()}</dateCreated>
  <ownerId>https://github.com/danbri/londat/blob/main/cwplans/feeds/discovery/README.md</ownerId>
  <docs>http://opml.org/spec2.opml</docs>
 </head>
 <body>
${kinds.map(k => `  <outline text="${esc(k)}" title="${esc(k)}">
${live.filter(r => r.kind === k).map(r => `   <outline type="${r.format === 'ics' ? 'link' : 'rss'}" text="${esc(r.title || r.url)}" title="${esc(r.title || r.url)}" xmlUrl="${esc(r.verified.final_url || r.url)}"${r.pages?.[0] ? ` htmlUrl="${esc(r.pages[0])}"` : ''} category="${esc(r.found_by.join(','))}"/>`).join('\n')}
  </outline>`).join('\n')}
 </body>
</opml>
`;
  writeFileSync(join(OUT, 'london-feeds.opml'), opml);
  console.log(`[build] ${rows.length} candidates, ${live.length} live, ${toEvents.length} for events.json`);
  if (!flags.has('--no-merge')) mergeEvents(toEvents);
  return { counts, best };
}
// events.json: re-read immediately before writing; only new ids are appended; nothing else changes except counts
function mergeEvents(rows) {
  const f = join(CW, 'feeds', 'events.json');
  const ev = JSON.parse(readFileSync(f, 'utf8'));
  const ids = new Set(ev.sources.map(s => s.id));
  const keys = new Set(ev.sources.flatMap(s => [s.feed, s.url].filter(Boolean).map(keyOf)));
  let added = 0;
  for (const r of rows) {
    if (keys.has(keyOf(r.url)) || (r.verified.final_url && keys.has(keyOf(r.verified.final_url)))) continue;
    let host = ''; try { host = new URL(r.url).host.replace(/^www\./, ''); } catch { }
    let id = 'disc-' + slug(r.title || host); let n = 2; while (ids.has(id)) id = 'disc-' + slug(r.title || host) + '-' + n++;
    const rel = r.relevance;
    const e = {
      id, name: `${r.title || host} (${r.format === 'ics' ? 'iCalendar' : r.format === 'atom' ? 'Atom' : r.format === 'jsonfeed' ? 'JSON Feed' : 'RSS'})`,
      category: r.format === 'ics' ? 'ical' : 'rss-atom', subject: r.kind, provider: r.title || host,
      url: r.pages?.[0] || (r.url.match(/^https?:\/\/[^/]+/) || [])[0] + '/', feed: r.verified.final_url || r.url,
      format: r.format === 'ics' ? 'iCalendar' : r.format === 'atom' ? 'Atom' : r.format === 'jsonfeed' ? 'JSON Feed' : 'RSS 2.0',
      auth: 'none', licence: r.terms, cors: !!r.cors, update: r.update || 'unknown', coverage: r.zone_publisher ? 'publisher in or beside the zone' : 'London',
      machine_readable: r.format === 'ics' ? 'ics' : r.format === 'atom' ? 'atom' : r.format === 'jsonfeed' ? 'json' : 'rss',
      verified: { date: r.verified.date, status: 'verified', http: r.verified.http, content_type: r.verified.content_type },
      sample: { items: r.items, newest: r.newest, titles: r.title_sample || [] },
      notes: `Found by ${r.found_by.join(', ')} (feeds/discovery/candidates.json). Kind: ${r.kind}. Zone mentions: ${rel ? `${rel.zone_items} of ${rel.items} items (${rel.zone_recent_items} in the last 120 days)` : 'n/a'}.`,
    };
    if (r.kind !== 'events') e.harvest = false;
    ev.sources.push(e); ids.add(id); keys.add(keyOf(r.url)); added++;
  }
  // counts by category and status, as the file already keeps them
  const counts = {};
  for (const s of ev.sources) { const c = counts[s.category] ||= {}; const st = s.verified?.status || 'not verified'; c[st] = (c[st] || 0) + 1; }
  ev.counts = counts;
  writeFileSync(f, JSON.stringify(ev, null, 2) + '\n');   // the file's own layout (2 spaces)
  console.log(`[build] events.json: ${added} sources added (${ev.sources.length} in all)`);
}

// ============================== main ==============================
async function main() {
  const want = s => !stages.length || stages.includes(s);
  let seeds = want('seed') ? await seedStage() : readJson(join(RAW, 'seeds.json'));
  if (!seeds) { console.error('run the seed stage first'); process.exit(1); }
  const cc = want('cc') ? await ccStage() : readJson(join(RAW, 'cc-feeds.json'));
  const auto = want('autodiscover') ? await autodiscoverStage(seeds.seeds) : readJson(join(RAW, 'autodiscover.json'), {});
  let verify = readJson(join(RAW, 'verify.json'), {});
  if (want('verify')) {
    const { feeds } = mergeCandidates(seeds.seeds, cc, auto, verify);
    verify = await verifyStage(feeds);
  }
  if (want('build')) buildStage(seeds, cc, auto, verify);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
