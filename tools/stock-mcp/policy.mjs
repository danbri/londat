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
  const r = await fetch(u, { ...init, headers: { 'user-agent': UA, 'accept-language': 'en-GB', ...(init.headers || {}) }, signal: AbortSignal.timeout(30000) });
  log({ shop: ctx.shop, method: init.method || 'GET', url: u, status: r.status, robots: rb.allowed ? 'allowed' : rb.rule, owner_approval: ctx.owner_approval || undefined });
  if ([401, 403, 429, 503].includes(r.status)) throw new Error(`${host} answered ${r.status} (bot wall or refusal): not retried, not bypassed`);
  if (!r.ok) throw new Error(`${host} answered ${r.status}`);
  return r;
}
