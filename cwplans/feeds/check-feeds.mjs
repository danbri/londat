#!/usr/bin/env node
// Re-check every url, api and sample in feeds.json and print what each returns.
//
//   node magpie/cwplans/feeds/check-feeds.mjs                 # all sources
//   node magpie/cwplans/feeds/check-feeds.mjs tfl-jamcams ea-tide-tower-pier
//   node magpie/cwplans/feeds/check-feeds.mjs --json > check.json
//   node magpie/cwplans/feeds/check-feeds.mjs --live          # only the no-key, CORS-on sources
//
// Node 22+, no dependencies. Columns: HTTP status; CORS, shown when a request carrying
// Origin: https://danbri.github.io gets Access-Control-Allow-Origin of * or that origin;
// kind (url/api/sample); source id; and "(was N)" when the status differs from feeds.json.
// An api is only fetched when the source has no sample (the sample exercises the api).
// Behind an HTTPS proxy, run with NODE_USE_ENV_PROXY=1 if your Node version needs it.

import { readFileSync } from 'node:fs';

const UA = 'glitchcan-cwplans/0.1 (https://github.com/danbri/glitchcan-minigam)';
// politeness: at most one request at a time to a host, and 1 s between requests to the same host
const hostQueue = new Map();
function politely(u, fn) {
  let h; try { h = new URL(u).host; } catch { return fn(); }
  const run = async () => { try { return await fn(); } finally { await new Promise(res => setTimeout(res, 1000)); } };
  const p = (hostQueue.get(h) || Promise.resolve()).then(run, run); hostQueue.set(h, p.catch(() => {})); return p;
}
const ORIGIN = 'https://danbri.github.io';
const here = new URL('.', import.meta.url);
const feeds = JSON.parse(readFileSync(new URL('feeds.json', here), 'utf8'));

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const liveOnly = args.includes('--live');
const ids = args.filter(a => !a.startsWith('--'));

const isLive = s => /^none/i.test(s.auth || '') && s.cors === true && s.sample && s.verified?.status === 'verified';
const sources = feeds.sources.filter(s => (!ids.length || ids.includes(s.id)) && (!liveOnly || isLive(s)));

const jobs = [];
for (const s of sources) {
  for (const kind of ['url', 'api', 'sample']) {
    const u = s[kind];
    if (!u || !/^https?:\/\//.test(u) || /[{}]/.test(u)) continue;
    if (kind === 'api' && s.sample) continue;
    jobs.push({ s, kind, u });
  }
}

async function probe({ s, kind, u }) {
  const headers = { 'User-Agent': UA, ...(kind === 'url' ? {} : { Origin: ORIGIN }), ...(s.request_headers || {}) };
  const t0 = Date.now();
  try {
    const r = await fetch(u, { headers, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    // Read a little of the body so the connection is released; we do not keep it.
    const reader = r.body?.getReader();
    if (reader) { await reader.read().catch(() => {}); reader.cancel().catch(() => {}); }
    return { http: r.status, type: r.headers.get('content-type'), cors: r.headers.get('access-control-allow-origin'), ms: Date.now() - t0 };
  } catch (e) {
    return { http: 0, error: (e.cause?.code || e.cause?.message || e.message || String(e)).toString().slice(0, 120), ms: Date.now() - t0 };
  }
}

const results = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++];
    const r = await politely(job.u, () => probe(job));
    const was = job.s.verified?.[job.kind === 'url' ? 'page_http' : `${job.kind}_http`];
    const row = { id: job.s.id, kind: job.kind, url: job.u, ...r, recorded: was ?? null };
    results.push(row);
    if (!asJson) {
      const changed = was != null && was !== r.http ? `  (was ${was})` : '';
      console.log(`${String(r.http || 'ERR').padEnd(4)} ${r.cors === '*' || r.cors === ORIGIN ? 'CORS' : '    '} ${job.kind.padEnd(6)} ${job.s.id}${changed}${r.error ? '  ' + r.error : ''}`);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const ok = results.filter(r => r.http >= 200 && r.http < 300).length;
const changed = results.filter(r => r.recorded != null && r.recorded !== r.http).length;
if (asJson) console.log(JSON.stringify({ checked: new Date().toISOString(), ok, total: results.length, changed, results }, null, 2));
else console.log(`\n${ok}/${results.length} requests returned 2xx; ${changed} differ from feeds.json (generated ${feeds.generated}).`);
