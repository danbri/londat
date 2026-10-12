// Fetch policy of the stock-mcp server (owner, 2026-10-12: "These tools will be user-assisting browser functionality and
// not unconstrained web crawling. For this dev and eval phase you can ignore robots.txt so long as EVERY set of fetches
// to a site is explicitly requested by me or approved. If multiple files pulled they are in batches of max 50 and
// requests are staggered."). Rules, enforced here for every request:
//  - robots.txt is read per host (cached for the process); a disallowed path is fetched only when the call carries
//    owner_approval (the owner's words and date), which is logged with the call;
//  - 6 s or more between requests to one host; at most 50 requests per host per process;
//  - no bot-wall handling: a 403/429/503 or a challenge page ends the call with an error;
//  - every request is logged (time, shop, method, URL, status, approval) to $STOCK_MCP_LOG or data/raw/stock-mcp/calls.jsonl.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOG = process.env.STOCK_MCP_LOG || join(ROOT, 'data', 'raw', 'stock-mcp', 'calls.jsonl');
const GAP_MS = +(process.env.STOCK_MCP_GAP_MS || 6000), MAX_PER_HOST = 50;
const UA = 'cwplans-stock-mcp/0.1 (user-assisted stock check; https://github.com/danbri/londat)';
const robotsCache = new Map(), lastAt = new Map(), count = new Map();

const sleep = ms => new Promise(r => setTimeout(r, ms));
function log(rec) { try { mkdirSync(dirname(LOG), { recursive: true }); appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...rec }) + '\n'); } catch {} }

async function robotsRules(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let rules = null;
  try {
    const r = await fetch(origin + '/robots.txt', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    if (r.status === 404 || r.status === 410) rules = [];
    else if (r.ok && !/^\s*</.test(t)) { rules = []; let on = false;
      for (const line of t.split(/\r?\n/)) { const [k, ...v] = line.split(':'), key = k.trim().toLowerCase(), val = v.join(':').split('#')[0].trim();
        if (key === 'user-agent') on = val === '*'; else if (on && (key === 'allow' || key === 'disallow') && val) rules.push([key, val]); } }
  } catch {}
  robotsCache.set(origin, rules); return rules;                                   // null = unreadable
}
const re = p => new RegExp('^' + p.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'));
export async function robotsAllows(u) {
  const { origin, pathname, search } = new URL(u), rules = await robotsRules(origin);
  if (rules === null) return { allowed: false, rule: 'robots.txt unreadable' };
  const m = rules.filter(([, p]) => re(p).test(pathname + search)).sort((a, b) => b[1].length - a[1].length)[0];
  return { allowed: !m || m[0] === 'allow', rule: m ? m.join(': ') : null };
}

// ctx: { shop, owner_approval }
export async function politeFetch(u, init = {}, ctx = {}) {
  const host = new URL(u).host, rb = await robotsAllows(u);
  if (!rb.allowed && !ctx.owner_approval) { log({ shop: ctx.shop, url: u, refused: rb.rule }); throw new Error(`robots.txt does not allow ${new URL(u).pathname} (${rb.rule}); give owner_approval (the owner's words and date) to run this call`); }
  const n = (count.get(host) || 0) + 1; if (n > MAX_PER_HOST) throw new Error(`more than ${MAX_PER_HOST} requests to ${host} in this process: stop and ask the owner`);
  count.set(host, n);
  const wait = (lastAt.get(host) || 0) + GAP_MS - Date.now(); if (wait > 0) await sleep(wait);
  lastAt.set(host, Date.now());
  const r = await fetch(u, { ...init, headers: { 'user-agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(30000) });
  log({ shop: ctx.shop, method: init.method || 'GET', url: u, status: r.status, robots: rb.allowed ? 'allowed' : rb.rule, owner_approval: ctx.owner_approval || undefined });
  if ([401, 403, 429, 503].includes(r.status)) throw new Error(`${host} answered ${r.status} (bot wall or refusal): not retried, not bypassed`);
  if (init.redirect === 'manual' && r.status >= 300 && r.status < 400) return r;          // the caller follows it (cookie jar)
  if (!r.ok) throw new Error(`${host} answered ${r.status}`);
  return r;
}

// GET with a cookie jar, following redirects by hand (at most 4 hops; each hop is a request under the rules above).
// Some shops set the market in cookies on a redirect (The White Company); fetch's own redirect drops them.
export async function fetchWithJar(u, init = {}, ctx = {}, jar = new Map()) {
  for (let hop = 0; hop < 5; hop++) {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const r = await politeFetch(u, { ...init, redirect: 'manual', headers: { ...(init.headers || {}), ...(cookie ? { cookie } : {}) } }, ctx);
    for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); }
    if (r.status < 300 || r.status >= 400) return r;
    u = new URL(r.headers.get('location'), u).href;
  }
  throw new Error('too many redirects');
}

// Headless Chromium on demand, for shops whose bot manager refuses plain fetch but serves a real browser (owner,
// 2026-10-12: "carefully eg headless browser on demand"). Same rules: robots.txt / owner_approval, the gap per host, the
// log, and a stop on any challenge or refusal. The browser keeps its own user agent (HeadlessChrome): nothing is hidden.
let browser = null, context = null;
export async function browserPage(ctx = {}) {
  if (!context) {
    const { chromium } = await import('playwright');
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    browser = await chromium.launch({ headless: true, executablePath: process.env.STOCK_MCP_CHROME || undefined, args: ['--no-sandbox', ...(proxy ? [`--proxy-server=${proxy}`] : [])] });
    context = await browser.newContext({ locale: ctx.locale || undefined });
  }
  return context.newPage();
}
export async function browserGoto(page, u, ctx = {}) {
  const host = new URL(u).host, rb = await robotsAllows(u);
  if (!rb.allowed && !ctx.owner_approval) { log({ shop: ctx.shop, url: u, refused: rb.rule, browser: true }); throw new Error(`robots.txt does not allow ${new URL(u).pathname} (${rb.rule}); give owner_approval (the owner's words and date) to run this call`); }
  const n = (count.get(host) || 0) + 1; if (n > MAX_PER_HOST) throw new Error(`more than ${MAX_PER_HOST} requests to ${host} in this process: stop and ask the owner`);
  count.set(host, n);
  const wait = (lastAt.get(host) || 0) + GAP_MS - Date.now(); if (wait > 0) await sleep(wait);
  lastAt.set(host, Date.now());
  const r = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const status = r?.status() ?? 0, title = await page.title().catch(() => '');
  log({ shop: ctx.shop, method: 'GET', url: u, status, browser: true, robots: rb.allowed ? 'allowed' : rb.rule, owner_approval: ctx.owner_approval || undefined });
  if ([401, 403, 429, 503].includes(status) || /access denied|just a moment|attention required|captcha/i.test(title)) throw new Error(`${host} answered ${status} "${title}" in the browser (bot wall or refusal): not retried, not bypassed`);
  return r;
}
// a same-origin GET from inside the page (the page's own cookies), counted and logged like any request
export async function browserFetchText(page, u, ctx = {}) {
  const host = new URL(u).host, n = (count.get(host) || 0) + 1; if (n > MAX_PER_HOST) throw new Error(`more than ${MAX_PER_HOST} requests to ${host} in this process`);
  count.set(host, n); const wait = (lastAt.get(host) || 0) + GAP_MS - Date.now(); if (wait > 0) await sleep(wait); lastAt.set(host, Date.now());
  const r = await page.evaluate(async url => { const x = await fetch(url, { credentials: 'include' }); return { status: x.status, text: await x.text() }; }, u);
  log({ shop: ctx.shop, method: 'GET', url: u, status: r.status, browser: 'in-page', owner_approval: ctx.owner_approval || undefined });
  if ([401, 403, 429, 503].includes(r.status)) throw new Error(`${host} answered ${r.status} in the page: not retried, not bypassed`);
  return r.text;
}
export async function closeBrowser() { try { await browser?.close(); } catch {} browser = null; context = null; }
