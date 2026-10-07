#!/usr/bin/env node
// Step 3d: Canary Wharf Group's own directory (shops, restaurants/bars, hotels, see & do).
//   NODE_USE_ENV_PROXY=1 node cwplans/registry/sources/brands/tools/fetch-cwg.mjs   (Node's fetch must use the proxy)
// canarywharf.com answers every scripted request with an Imperva/Incapsula bot challenge (checked
// 2026-10-03), so this reads the Internet Archive's copies instead: the site's own Yoast sitemaps as
// archived on 2026-03-04 give the directory (the list of entries), and each entry page's archived copy
// (mostly Nov 2025) gives its title, category, mall/level address lines and website.
// out: registry/sources/brands/cwg-directory.json; raw pages cached in data/raw/registry/cwg/ (not committed)
import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { OUT, RAW, UA, sleep } from './lib.mjs';
import { cwgFields } from './cwg-fields.mjs';

const DIR = join(RAW, 'cwg'), PAGES = join(DIR, 'pages');
mkdirSync(PAGES, { recursive: true });
const WB = 'https://web.archive.org';
async function get(url, file, tries = 5) {
  if (file && existsSync(file)) return readFileSync(file, 'utf8');
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(120000) });
      if (res.status === 404) return null;
      if (res.ok) { const t = await res.text(); if (file) writeFileSync(file, t); await sleep(1200); return t; }
      console.warn(res.status, url);
    } catch (e) { console.warn('retry', i, url, e.cause?.code || e.message); }
    await sleep(8000 * (i + 1));
  }
  return null;
}
const SITEMAPS = { shop: '20260304070930-shop-sitemap.xml', restaurant: '20260304070926-restaurant-sitemap.xml', stay: '2026-stay-sitemap.xml', 'see-do': '2026-seedo-sitemap.xml' };
const SM_URL = { shop: 'shop-sitemap.xml', restaurant: 'restaurant-sitemap.xml', stay: 'stay-sitemap.xml', 'see-do': 'seedo-sitemap.xml' };
const entries = [];
for (const [kind, f] of Object.entries(SITEMAPS)) {
  const xml = await get(`${WB}/web/20260304id_/https://canarywharf.com/${SM_URL[kind]}`, join(DIR, f));
  for (const m of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g))
    if (/canarywharf\.com\/[^/]+\/[^/]+\/$/.test(m[1])) entries.push({ kind, url: m[1], lastmod: m[2] || null });
}
// archive captures: CDX listings per URL prefix (first capture since 2025, query strings dropped)
const cdx = new Map();
for (const p of ['restaurant', 'shop', 'stay', 'see-do', 'eating-drinking/directory', 'shops-services/directory']) {
  const f = join(DIR, `cdx-${p.replace(/\//g, '_')}.txt`);
  const txt = await get(`${WB}/cdx/search/cdx?url=canarywharf.com/${p}/&matchType=prefix&fl=original,timestamp&collapse=urlkey&filter=statuscode:200&filter=!original:.*%5C?.*&from=2025&limit=3000`, f, 2);
  for (const line of (txt || '').split('\n')) { const [u, ts] = line.trim().split(' '); if (u && ts) cdx.set(u.replace(/^http:/, 'https:').replace('//www.', '//'), ts); }
}
const dec = s => s.replace(/&#(\d+);/g, (_, n) => [8217, 39].includes(+n) ? "'" : String.fromCodePoint(+n)).replace(/&amp;|&#038;/g, '&').replace(/&#8211;/g, '–').replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const isChallenge = h => h.length < 5000 && /Incapsula|Request unsuccessful/.test(h);
function parse(html) {
  const title = (html.match(/<h1[^>]*class="[^"]*__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
  // the category block runs to the title; each category is a tag div (the first version stopped the block at the
  // first three closing divs, which are the tag's own, and found no category on any page)
  const cats = [...(html.match(/__categories">([\s\S]*?)<h1/)?.[1] || '').matchAll(/class="tag ?">([^<]*)</g)].map(m => dec(m[1])).filter(Boolean);
  // 2025-26 layout: <div class="entry-address">; 2020-25 layout: <div class="location"><h6>Location</h6><p>
  const addr = (html.match(/<div class="entry-address">([\s\S]*?)<\/div>/) || html.match(/<div class="location">\s*<h6>[^<]*<\/h6>\s*<p>([\s\S]*?)<\/p>/) || [])[1];
  const lines = addr ? addr.split(/<br\s*\/?>/).map(dec).filter(Boolean) : [];
  const web = (html.match(/icon--globe-world-earth"><\/i>\s*<a\s+href="([^"]+)"/) || [])[1] || null;
  return { title: title ? dec(title) : null, categories: cats, address_lines: lines, website: web };
}
const out = [];
let n = 0;
for (const e of entries) {
  const slug = e.url.split('/').slice(-2, -1)[0];
  const old = e.kind === 'restaurant' ? `https://canarywharf.com/eating-drinking/directory/${slug}/` : e.kind === 'shop' ? `https://canarywharf.com/shops-services/directory/${slug}/` : null;
  // candidate captures, best first: the entry's own URL, its 2025 URL (eating-drinking/ or shops-services/ directory),
  // then whatever the archive holds closest to 2026-03. Captures of the bot-challenge page are skipped.
  const cands = [];
  if (cdx.get(e.url)) cands.push({ src: e.url, ts: cdx.get(e.url) });
  if (old && cdx.get(old)) cands.push({ src: old, ts: cdx.get(old) });
  cands.push({ src: e.url, ts: null });
  const rec = { kind: e.kind, slug, cwg_url: e.url, sitemap_lastmod: e.lastmod, archived: null };
  for (const [i, c] of cands.entries()) {
    const file = join(PAGES, `${e.kind}__${slug}${i ? '.alt' + i : ''}.html`);
    const html = await get(c.ts ? `${WB}/web/${c.ts}id_/${c.src}` : `${WB}/web/20260304id_/${c.src}`, file, c.ts ? 5 : 2);
    if (!html || isChallenge(html)) { if (html) rec.challenge_captures = (rec.challenge_captures || 0) + 1; continue; }
    Object.assign(rec, parse(html), { archived: c.ts ? `${WB}/web/${c.ts}/${c.src}` : `${WB}/web/20260304/${c.src} (closest capture)`, archived_on: c.ts ? c.ts.slice(0, 8) : null });
    // mall (the longest place named), level line, postcode (any district: Wood Wharf uses E22), street line, flags:
    // cwg-fields.mjs. The first parser took "United Kingdom" and "55 Upper Bank Street" as levels, the first place in
    // list order as the mall, and only E14 or E16 postcodes.
    const f = cwgFields(rec.address_lines);
    Object.assign(rec, { mall: f.mall, level: f.level, postcode: f.postcode, ...(f.street ? { street: f.street } : {}), ...(f.flags.length ? { flags: f.flags } : {}) });
    break;
  }
  out.push(rec);
  if (++n % 25 === 0) console.log(n, '/', entries.length);
}
writeFileSync(join(OUT, 'cwg-directory.json'), JSON.stringify({
  source: 'Canary Wharf Group directory, https://canarywharf.com/ (sitemaps archived 2026-03-04; entry pages as archived by the Internet Archive)',
  note: 'canarywharf.com blocks scripted requests (Imperva/Incapsula challenge, 2026-10-03); every field here comes from web.archive.org copies',
  generated: new Date().toISOString(), entries: out.length,
  by_kind: out.reduce((m, r) => (m[r.kind] = (m[r.kind] || 0) + 1, m), {}),
  with_page: out.filter(r => r.archived).length,
  directory: out,
}, null, 1));
console.log(`${out.length} entries, ${out.filter(r => r.archived).length} with an archived page`);
