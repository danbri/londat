#!/usr/bin/env node
// Re-check the event and real-time feeds in events.json, or probe one URL.
//
//   node magpie/cwplans/feeds/check-events.mjs                  # every source
//   node magpie/cwplans/feeds/check-events.mjs th-moderngov-ics # some sources
//   node magpie/cwplans/feeds/check-events.mjs --live           # no key + CORS only
//   node magpie/cwplans/feeds/check-events.mjs --json > out.json
//   node magpie/cwplans/feeds/check-events.mjs --url https://example.org/feed.ics [--header 'x-api-version: 2']
//
// Item counts here come from small generic parsers, so for a few JSON/XML APIs (TfL date
// ranges, ModernGov GetMeetings, Hansard) they can differ from the hand-tuned sample in
// events.json; the HTTP status and CORS columns are the point of a re-check.
// mgov.newham.gov.uk sends no TLS intermediate: set NODE_EXTRA_CA_CERTS to a bundle that adds
// the Sectigo intermediate from its certificate's AIA URL, or expect a TLS error there.
//
// Node 22+, no dependencies. Behind the HTTPS proxy, run with NODE_USE_ENV_PROXY=1.
// For each feed it prints: HTTP status, CORS (an Access-Control-Allow-Origin of * or
// https://danbri.github.io on a request that carries that Origin), the number of items
// (VEVENTs, RSS items, Atom entries, JSON records, or schema.org Event objects in an
// HTML page's JSON-LD), the newest item date, and the first titles.
// The parsers are deliberately small: they count and sample, they do not validate.

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

const decode = s => (s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#x27;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/\s+/g, ' ').trim();

const iso = d => { const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };
const maxDate = ds => ds.map(iso).filter(Boolean).sort().at(-1) || null;

function icsDate(v) {
  const m = /(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/.exec(v || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parseIcs(text) {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') cur = {};
    else if (l === 'END:VEVENT') { if (cur) events.push(cur); cur = null; }
    else if (cur) {
      const i = l.indexOf(':');
      if (i < 0) continue;
      const key = l.slice(0, i).split(';')[0];
      const val = l.slice(i + 1).replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ');
      if (key === 'SUMMARY') cur.title = val.trim();
      if (key === 'DTSTART') cur.date = icsDate(val);
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const dated = events.filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = dated.filter(e => e.date >= today);
  const pick = (upcoming.length ? upcoming : dated.slice(-3)).slice(0, 3);
  return {
    kind: 'ics', items: events.length, upcoming: upcoming.length,
    newest: dated.at(-1)?.date || null, next: upcoming[0]?.date || null,
    titles: pick.map(e => `${e.date} ${e.title}`),
  };
}

export function parseFeed(text) {
  const isAtom = /<feed[\s>]/.test(text) && /<entry[\s>]/.test(text);
  const tag = isAtom ? 'entry' : 'item';
  const blocks = [...text.matchAll(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, 'g'))].map(m => m[0]);
  const get = (b, names) => { for (const n of names) { const m = new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`).exec(b); if (m) return decode(m[1]); } return null; };
  const items = blocks.map(b => ({
    title: get(b, ['title']),
    date: get(b, isAtom ? ['updated', 'published'] : ['pubDate', 'dc:date', 'a10:updated', 'updated']),
  }));
  return {
    kind: isAtom ? 'atom' : 'rss', items: items.length,
    newest: maxDate(items.map(i => i.date)),
    titles: items.slice(0, 3).map(i => i.title),
  };
}

const TITLE_KEYS = ['title', 'name', 'BusinessName', 'summary', 'label', 'headline', 'commonName', 'description'];
const DATE_KEYS = ['startDate', 'start_date', 'inception', 'dissolved', 'sittingDate', 'SittingDate', 'dateTabled', 'start', 'date', 'RatingDate', 'updated', 'published', 'created_at', 'datePublished', 'public_timestamp', 'start_date', 'eventDate', 'closed_at', 'timestamp', 'startDateTime', 'modified'];

function largestArray(v, depth = 0) {
  let best = null;
  if (Array.isArray(v)) best = v;
  if (v && typeof v === 'object' && depth < 5) {
    for (const x of Object.values(v)) {
      const a = largestArray(x, depth + 1);
      if (a && (!best || a.length > best.length) && a.some(o => o && typeof o === 'object')) best = a;
    }
  }
  return best;
}
const field = (o, keys) => { for (const k of keys) { const v = o?.[k]; if (typeof v === 'string' && v) return v; if (v?.value) return v.value; if (typeof v?.rendered === 'string') return decode(v.rendered); } return null; };

// OSM API 0.6 changeset list (XML). Counts changesets and samples their comment tags.
// Never keep the user / uid attributes: they name individual mappers.
export function parseOsmChangesets(text) {
  const cs = [...text.matchAll(/<changeset\b([^>]*)>([\s\S]*?)<\/changeset>|<changeset\b([^>]*)\/>/g)];
  const items = cs.map(m => {
    const attrs = m[1] || m[3] || '';
    const body = m[2] || '';
    const comment = (/<tag k="comment" v="([^"]*)"/.exec(body) || [])[1];
    return { date: (/created_at="([^"]+)"/.exec(attrs) || [])[1], title: comment ? decode(comment) : '(no comment)' };
  });
  return { kind: 'osm-changesets', items: items.length, newest: maxDate(items.map(i => i.date)), titles: items.slice(0, 3).map(i => i.title) };
}

export function parseJson(text) {
  const j = JSON.parse(text);
  const arr = largestArray(j) || [];
  const objs = arr.filter(o => o && typeof o === 'object');
  return {
    kind: 'json', items: arr.length,
    newest: maxDate(objs.map(o => field(o, DATE_KEYS))),
    titles: objs.slice(0, 3).map(o => field(o, TITLE_KEYS)).filter(Boolean).map(s => s.slice(0, 120)),
  };
}

function flattenLd(v, out = []) {
  if (Array.isArray(v)) v.forEach(x => flattenLd(x, out));
  else if (v && typeof v === 'object') {
    out.push(v);
    for (const k of ['@graph', 'itemListElement', 'item', 'subEvent', 'event', 'events']) if (v[k]) flattenLd(v[k], out);
  }
  return out;
}

export function parseHtml(text) {
  const ld = [...text.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  const nodes = [];
  let ldTypes = new Set();
  for (const b of ld) { try { flattenLd(JSON.parse(b.trim()), nodes); } catch { /* malformed block */ } }
  for (const n of nodes) [].concat(n['@type'] || []).forEach(t => ldTypes.add(t));
  const isEvent = n => [].concat(n['@type'] || []).some(t => /Event$/.test(t));
  const events = nodes.filter(isEvent);
  const microdata = (text.match(/itemtype=["']https?:\/\/schema\.org\/\w*Event["']/g) || []).length;
  const ics = [...new Set([...text.matchAll(/(?:href|src)=["']((?:webcal:[^"']*)|(?:[^"']*(?:\.ics(?:\?[^"']*)?|[?&]ical=1[^"']*|\/ical\/?|[?&](?:FMT|outputType|format)=ics[^"']*)))["']/gi)].map(m => m[1]))].slice(0, 5);
  const feeds = [...new Set([...text.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)].map(m => (/href=["']([^"']+)["']/.exec(m[0]) || [])[1]).filter(Boolean))].slice(0, 5);
  const today = new Date().toISOString().slice(0, 10);
  const dated = events.map(e => ({ title: decode(String(e.name || '')), date: iso(e.startDate) })).filter(e => e.title);
  const up = dated.filter(e => e.date && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  return {
    kind: 'html', items: events.length, jsonld_events: events.length, microdata_events: microdata,
    jsonld_types: [...ldTypes].slice(0, 12), ics_links: ics, feed_links: feeds,
    newest: maxDate(dated.map(e => e.date)),
    titles: (up.length ? up : dated).slice(0, 3).map(e => `${e.date || ''} ${e.title}`.trim()),
    page_title: decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(text) || [])[1] || '').slice(0, 120),
  };
}

export async function probe(url, { headers = {}, kind, body } = {}) {
  const t0 = Date.now();
  try {
    const init = body ? { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {};
    const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: '*/*', ...init.headers, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    const type = r.headers.get('content-type') || '';
    const text = await r.text();
    // CORS is a second request carrying the Origin header (some servers refuse a first
    // request that carries one, which is a separate fact from whether they allow CORS).
    let cors = null;
    try {
      const c = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: '*/*', Origin: ORIGIN, ...init.headers, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
      cors = c.headers.get('access-control-allow-origin');
      c.body?.cancel().catch(() => {});
    } catch { /* leave cors null */ }
    const out = { http: r.status, final_url: r.url !== url ? r.url : undefined, content_type: type, cors: cors === '*' || cors === ORIGIN, acao: cors, bytes: text.length, ms: Date.now() - t0 };
    const head = text.slice(0, 5000);
    if (r.headers.get('sg-captcha') || /sgcaptcha/i.test(head)) out.blocked = 'SiteGround captcha';
    else if (r.headers.get('cf-mitigated') || /Just a moment|challenge-platform|Attention Required/i.test(head)) out.blocked = 'Cloudflare challenge';
    else if (/_Incapsula_Resource/.test(head)) out.blocked = 'Imperva Incapsula challenge';
    else if (/Azure WAF/.test(head)) out.blocked = 'Azure WAF JavaScript challenge';
    try {
      const k = kind || (/BEGIN:VCALENDAR/.test(text.slice(0, 500)) ? 'ics'
        : /^\s*[[{]/.test(text) ? 'json'
        : /<(rss|feed|rdf:RDF)[\s>]/.test(text.slice(0, 2000)) ? 'feed'
        : /<osm\b/.test(text.slice(0, 500)) ? 'osm' : 'html');
      Object.assign(out, k === 'ics' ? parseIcs(text) : k === 'osm' ? parseOsmChangesets(text) : k === 'json' ? parseJson(text) : k === 'feed' ? parseFeed(text) : parseHtml(text));
    } catch (e) { out.parse_error = e.message; }
    return out;
  } catch (e) {
    return { http: 0, error: String(e.cause?.code || e.cause?.message || e.message).slice(0, 160), ms: Date.now() - t0 };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const hdrs = {};
  args.forEach((a, i) => { if (a === '--header') { const [k, ...v] = args[i + 1].split(':'); hdrs[k.trim()] = v.join(':').trim(); } });
  const ui = args.indexOf('--url');
  if (ui >= 0) {
    const ki = args.indexOf('--kind');
    console.log(JSON.stringify(await probe(args[ui + 1], { headers: hdrs, kind: ki >= 0 ? args[ki + 1] : undefined }), null, 2));
    return;
  }
  const data = JSON.parse(readFileSync(new URL('events.json', import.meta.url), 'utf8'));
  const asJson = args.includes('--json');
  const live = args.includes('--live');
  const ids = args.filter(a => !a.startsWith('--'));
  const srcs = data.sources.filter(s => (!ids.length || ids.includes(s.id))
    && (!live || (s.cors === true && /^none/i.test(s.auth || '') && s.feed)));
  const results = [];
  let next = 0;
  async function worker() {
    while (next < srcs.length) {
      const s = srcs[next++];
      const u = s.feed || s.url;
      if (!u || /[{}]/.test(u)) continue;
      const r = await politely(u, () => probe(u, { headers: s.request_headers || {}, body: s.request_body }));
      const row = { id: s.id, url: u, ...r, recorded_http: s.verified?.http ?? null, recorded_items: s.sample?.items ?? null };
      delete row.titles_full;
      results.push(row);
      if (!asJson) {
        const diff = row.recorded_http != null && row.recorded_http !== r.http ? ` (was ${row.recorded_http})` : '';
        console.log(`${String(r.http || 'ERR').padEnd(4)} ${r.cors ? 'CORS' : '    '} ${String(r.items ?? '-').padStart(5)} ${String(r.newest || '').padEnd(10)} ${s.id}${diff}${r.error ? '  ' + r.error : ''}${r.blocked ? '  ' + r.blocked : ''}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  const ok = results.filter(r => r.http >= 200 && r.http < 300).length;
  if (asJson) console.log(JSON.stringify({ checked: new Date().toISOString(), ok, total: results.length, results }, null, 2));
  else console.log(`\n${ok}/${results.length} returned 2xx (events.json generated ${data.generated}).`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
