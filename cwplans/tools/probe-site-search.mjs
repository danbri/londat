// Test the schema.org SearchAction templates that the harvested sites publish: fill each template with fixed queries
// (a place name and the One Canada Square postcode) and a nonsense control query, fetch each result page once, and count
// only what a place query adds over the control (site menus and footers name Canary Wharf on every page).
// Templates are read with @factoidal/core SPARQL. Only counts, types and result URLs are kept, no page text.
//   in:  third_party/cwplans-structured-data/all.nq.gz; data/raw/crawl/<host>/robots.json (cached rules, else fetched)
//   out: third_party/cwplans-structured-data/search/probe.json; raw result pages in data/raw/site-search/ (gitignored)
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/probe-site-search.mjs [--host=h]
//   node magpie/cwplans/tools/probe-site-search.mjs --offline     # re-read the cached result pages; no requests
// Skill: cwplans-web-harvest, "Site search (SearchAction)".
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { gunzipSync, gzipSync } from 'zlib';
import { createHash } from 'crypto';
import { join } from 'path';
import { parse, query } from '@factoidal/core';
import { TOOLS, RAW, UA } from './lib.mjs';

const TP = join(TOOLS, '..', '..', '..', 'third_party', 'cwplans-structured-data'), OUT = join(TP, 'search'), CACHE = join(RAW, 'site-search');
mkdirSync(OUT, { recursive: true }); mkdirSync(CACHE, { recursive: true });
const OFFLINE = process.argv.includes('--offline'), PREV = OFFLINE ? JSON.parse(readFileSync(join(OUT, 'probe.json'), 'utf8')) : null;
const QUERIES = ['Canary Wharf', 'E14 5AB'], CONTROL = 'zqxjvw', GAP = 1100, onlyHost = process.argv.find(a => a.startsWith('--host='))?.slice(7);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const host = g => { const m = g.match(/^https?:\/\/web\.archive\.org\/web\/\d+[a-z_]*\/(.*)$/); const u = m ? m[1] : g; return new URL(/^https?:/.test(u) ? u : 'http://' + u).hostname.replace(/^www\./, ''); };

const ds = await parse(gunzipSync(readFileSync(join(TP, 'all.nq.gz'))).toString(), { format: 'nquads' });
const rows = await query(ds, `PREFIX s: <https://schema.org/> PREFIX h: <http://schema.org/>
SELECT DISTINCT ?g ?tpl ?t WHERE { GRAPH ?g { ?x (s:potentialAction|h:potentialAction) ?a . ?a a ?at . FILTER(?at IN (s:SearchAction, h:SearchAction))
  ?a (s:target|h:target) ?t0 . OPTIONAL { ?t0 (s:urlTemplate|h:urlTemplate) ?u } BIND(IF(BOUND(?u), ?u, ?t0) AS ?tpl) OPTIONAL { ?x a ?t } } }`);
const sites = new Map();
for (const r of rows) {
  const g = r.get('g').value, tpl = r.get('tpl').value, site = host(g); if (onlyHost && site !== onlyHost) continue;
  const e = sites.get(site) || sites.set(site, { site, templates: new Set(), declared_on: new Set() }).get(site);
  e.templates.add(tpl); const t = r.get('t')?.value; if (t) e.declared_on.add(t.replace(/^https?:\/\/(www\.)?schema\.org\//, ''));
}
// one template per site: the first absolute one with a placeholder, a relative one resolved against the page's site
const pick = e => { const ts = [...e.templates].filter(t => /\{[^}]+\}/.test(t)); const t = ts.find(t => /^https?:/.test(t)) || ts[0]; return t && !/^https?:/.test(t) ? 'https://' + e.site + t : t; };

// robots.txt, RFC 9309 (same rules as crawl-sites.mjs): our token's group, else *; longest match wins, Allow wins a tie
const UA_TOKEN = 'glitchcan-cwplans';
function parseRobots(txt) {
  const groups = []; let cur = null, lastWasUA = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!lastWasUA) groups.push(cur = { agents: [], rules: [] }); cur.agents.push(v.toLowerCase()); lastWasUA = true; continue; }
    lastWasUA = false; if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({ allow: k === 'allow', path: v });
  }
  const mine = groups.filter(g => g.agents.some(a => a !== '*' && UA_TOKEN.startsWith(a.replace(/\/.*/, ''))));
  return (mine.length ? mine : groups.filter(g => g.agents.includes('*'))).flatMap(g => g.rules).filter(r => r.path !== '' || !r.allow);
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
async function request(url) {
  let u = url, hops = 0, res;
  for (;;) {
    try { res = await fetch(u, { redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' }, signal: AbortSignal.timeout(30000) }); }
    catch (e) { return { url: u, error: String(e.cause?.code || e.message) }; }
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc && hops++ < 8) { u = new URL(loc, u).href; continue; }
    const body = Buffer.from(await res.arrayBuffer()); return { url: u, status: res.status, type: res.headers.get('content-type') || '', body, hops };
  }
}
// --offline: the page from the cache, with the status, final URL and type the last run recorded
const prevOf = new Map(PREV ? PREV.sites.flatMap(s => (s.results || []).map(r => [r.url, r])) : []);
async function cached(url) {
  const f = join(CACHE, createHash('sha1').update(url).digest('hex').slice(0, 16) + '.html.gz'), p = prevOf.get(url);
  if (!p || !existsSync(f)) return { url, error: 'not cached' };
  return { url: p.final_url, status: p.status, type: p.content_type || '', body: gunzipSync(readFileSync(f)), hops: p.hops };
}
const robotsCache = new Map();
async function rulesFor(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  if (OFFLINE) { const p = PREV.sites.find(s => s.template && new URL(s.template.replace(/\{[^}]+\}/g, 'x')).origin === origin);
    const out = p?.results?.every(r => r.robots === 'disallowed') ? { state: 'ok', rules: [{ allow: false, path: '/' }] } : { state: 'ok', rules: [] }; robotsCache.set(origin, out); return out; }
  const f = join(RAW, 'crawl', new URL(origin).host, 'robots.json');
  let out;
  if (existsSync(f)) out = JSON.parse(readFileSync(f, 'utf8'));
  else {
    const r = await request(origin + '/robots.txt');
    if (r.error || r.status >= 500) out = { state: 'unreachable', rules: null };
    else if (r.status >= 400) out = { state: 'none', rules: [] };
    else { const txt = r.body.toString('utf8'); out = /<html|<!doctype/i.test(txt.slice(0, 500)) ? { state: 'none', rules: [] } : { state: 'ok', rules: parseRobots(txt) }; }
    await sleep(GAP);
  }
  robotsCache.set(origin, out); return out;
}

// what a result page holds: wall, no-result wording, mentions, JSON-LD types, same-site links that look like a branch
const WALL = /cf-chl|challenge-platform|<title>just a moment|_Incapsula_|incapsula incident|px-captcha|<title>attention required|<title>access denied/i;
const NONE = /no results|nothing found|0 results|no products? (were )?found|did not match any|sorry,? (but )?(nothing|no)|we couldn.t find|no matches/i;
const ASSET = /\.(css|js|mjs|json|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|eot|pdf|xml)$|\/(cdn|wp-content|wp-includes|static|assets)\//i;
const BRANCH = /\/(restaurants?|locations?|stores?|shops?|branch(es)?|find-us|venues?|our-restaurants|studios?|clinics?|practices?|gyms?|hotels?)\/|canary[-_ ]?wharf|crossrail|cabot|jubilee-place|canada-place/i;
function inspect(r, origin) {
  const html = r.body.toString('utf8'), text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const types = new Set();
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { [].concat(o['@type'] || []).forEach(t => types.add(String(t))); Object.values(o).forEach(walk); } }; walk(JSON.parse(m[1])); } catch {}
  }
  const links = new Set();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try { const u = new URL(m[1].replace(/&amp;/g, '&'), r.url); u.search = u.search.replace(/[?&](s|q|query|search|term)=[^&]*/g, ''); if (u.host.replace(/^www\./, '') === new URL(origin).host.replace(/^www\./, '') && !ASSET.test(u.pathname)) links.add(u.origin + u.pathname); } catch {}
  }
  return { text_chars: text.length, wall: WALL.test(html.slice(0, 20000)), no_result_wording: NONE.test(text),
    mentions_canary_wharf: (text.match(/canary wharf/gi) || []).length, mentions_e14: (text.match(/\bE14\b/g) || []).length,
    jsonld_types: [...types].slice(0, 20), links };
}
// what a place query adds over the control: new same-site links (branch-like ones apart), new mentions
function versus(r, c) {
  if (!r.links) return r;
  const added = c?.links ? [...r.links].filter(u => !c.links.has(u)) : [...r.links];
  const out = { ...r, added_links: added.length, added_branch_links: added.filter(u => BRANCH.test(new URL(u).pathname)).slice(0, 12),
    added_mentions: r.mentions_canary_wharf + r.mentions_e14 - (c?.mentions_canary_wharf || 0) - (c?.mentions_e14 || 0) };
  delete out.links; return out;
}
const classify = all => {
  const rs = all.filter(r => !r.control), ok = rs.filter(r => r.status === 200);
  if (rs.every(r => r.robots === 'disallowed')) return 'robots-disallowed';
  if (rs.some(r => r.wall) || rs.every(r => [401, 403, 429, 503].includes(r.status))) return 'blocked';
  if (!ok.length) return 'broken';
  if (ok.every(r => r.text_chars < 1500 && !r.added_links)) return 'script-rendered';
  if (ok.some(r => r.added_branch_links?.length && r.added_mentions > 0)) return 'finds-branch';
  if (ok.some(r => r.added_links > 0 && r.added_mentions > 0)) return 'finds-place-content';
  return 'no-place-result';
};

const list = [...sites.values()], out = [];
const byOrigin = new Map();
for (const e of list) { const t = pick(e); e.template = t || null; if (!t) { out.push({ site: e.site, template: null, class: 'no-placeholder', templates: [...e.templates] }); continue; }
  const o = new URL(t.replace(/\{[^}]+\}/g, 'x')).origin; (byOrigin.get(o) || byOrigin.set(o, []).get(o)).push(e); }
// hosts in parallel, one request at a time per host with GAP between
await Promise.all([...byOrigin.entries()].map(async ([origin, es]) => {
  const rb = await rulesFor(origin);
  for (const e of es) {
    const results = []; let control = null;
    for (const q of [CONTROL, ...QUERIES]) {
      const url = e.template.replace(/\{[^}]+\}/, encodeURIComponent(q)).replace(/\{[^}]+\}/g, '');
      const u = new URL(url), path = u.pathname + u.search;
      if (rb.state === 'unreachable' || !robotsAllows(rb.rules || [], path)) { results.push({ query: q, url, robots: rb.state === 'unreachable' ? 'unreachable' : 'disallowed' }); continue; }
      const r = OFFLINE ? await cached(url) : await request(url); if (!OFFLINE) await sleep(GAP);
      if (r.error) { results.push({ query: q, url, robots: 'allowed', error: r.error }); continue; }
      if (!OFFLINE) writeFileSync(join(CACHE, createHash('sha1').update(url).digest('hex').slice(0, 16) + '.html.gz'), gzipSync(r.body));
      const rec = { query: q, url, robots: 'allowed', final_url: r.url, status: r.status, content_type: r.type.split(';')[0], hops: r.hops, ...(r.status === 200 ? inspect(r, origin) : { wall: WALL.test(r.body.toString('utf8').slice(0, 20000)) }) };
      if (q === CONTROL) { control = rec; continue; }
      results.push(versus(rec, control));
    }
    if (control) { const c = { ...control }; delete c.links; results.unshift({ ...c, control: true }); }
    out.push({ site: e.site, template: e.template, declared_on: [...e.declared_on], platform: /[?&]s=\{/.test(e.template) ? 'wordpress ?s=' : 'other', class: classify(results), results });
    console.log(e.site.padEnd(32), out.at(-1).class, results.map(r => r.status || r.robots || r.error).join(' '));
  }
}));
// which branch-like hits the harvest does not hold yet: seeds for the next crawl
const key = u => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*/, '').replace(/\/$/, '');
const have = new Set(readdirSync(join(TP, 'pages')).flatMap(f => readFileSync(join(TP, 'pages', f), 'utf8').split('\n').filter(l => l.trim()).flatMap(l => { const r = JSON.parse(l); return [r.url, r.final_url].filter(Boolean).map(key); })));
for (const s of out) { const hits = [...new Set((s.results || []).flatMap(r => r.added_branch_links || []))]; if (hits.length) { s.hits_new = hits.filter(u => !have.has(key(u))); s.hits_harvested = hits.filter(u => have.has(key(u))); } }
out.sort((a, b) => a.site.localeCompare(b.site));
const counts = out.reduce((m, r) => (m[r.class] = (m[r.class] || 0) + 1, m), {});
writeFileSync(join(OUT, 'probe.json'), JSON.stringify({ meta: { generated: new Date().toISOString(), tool: 'magpie/cwplans/tools/probe-site-search.mjs', queries: QUERIES, control_query: CONTROL, gap_ms: GAP, user_agent: UA,
  note: 'One fetch per site and query of the SearchAction template the site publishes. Counts, types and result URLs only; no page text is kept.', sites: out.length, counts, hits_new: out.reduce((a, s) => a + (s.hits_new?.length || 0), 0), hits_harvested: out.reduce((a, s) => a + (s.hits_harvested?.length || 0), 0) }, sites: out }, null, 1) + '\n');
console.log(JSON.stringify(counts));
