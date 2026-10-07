#!/usr/bin/env node
// Crown lighting of the Canary Wharf towers: find the press pages and the dated open photos that say which colour
// a crown (One Canada Square's pyramid "halo" first) showed on which night. The colour judgement itself is a hand
// step, recorded in registry/sources/lighting/crown-lighting.json. Method, rules and gaps: the cwplans-crown-lighting
// skill (magpie/cwplans/skills/cwplans-crown-lighting/SKILL.md).
//
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-crown-lighting.mjs              # all steps
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-crown-lighting.mjs --press      # CWG sitemaps + archived press pages
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-crown-lighting.mjs --commons    # Commons night photos + thumbnails
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-crown-lighting.mjs --thumbs     # only the missing thumbnails
//   node magpie/cwplans/tools/fetch-crown-lighting.mjs --no-fetch                         # rebuild outputs from the cache
//
// Out (committed): registry/sources/lighting/press-pages.json, registry/sources/lighting/commons-photos.json.
// Cache (gitignored, data/raw/registry/lighting/): sitemaps, archived pages (.html), page text snippets, thumbnails.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { RAW, UA, TOOLS } from './lib.mjs';

const OUT = join(TOOLS, '..', 'registry', 'sources', 'lighting');
const CACHE = join(RAW, 'registry', 'lighting');
for (const d of [OUT, CACHE, join(CACHE, 'press'), join(CACHE, 'thumbs')]) mkdirSync(d, { recursive: true });
const args = new Set(process.argv.slice(2));
const NOFETCH = args.has('--no-fetch');
const THUMBS_ONLY = args.has('--thumbs'); // reuse the cached API answers, fetch only missing thumbnails
const doPress = args.has('--press') || !(args.has('--commons') || args.has('--thumbs'));
const doCommons = args.has('--commons') || args.has('--thumbs') || !args.has('--press');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);
const log = [];

// One request at a time; at least GAP ms between requests to one host; retries with backoff on 429, 5xx, resets.
const GAP = { 'cwg.com': 3000, 'archive.org': 2000, 'web.archive.org': 3000, 'commons.wikimedia.org': 2000, 'upload.wikimedia.org': 3000 };
const lastAt = new Map();
async function fetchText(url, { tries = 4, binary = false } = {}) {
  const host = new URL(url).host;
  for (let i = 0; i < tries; i++) {
    const wait = (lastAt.get(host) || 0) + (GAP[host] || 2000) - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt.set(host, Date.now());
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(90000) });
      if (r.status === 404) return { status: 404 };
      if (r.ok) return { status: r.status, body: binary ? Buffer.from(await r.arrayBuffer()) : await r.text(), url: r.url };
      const ra = Number(r.headers.get('retry-after')) || 0;
      log.push(`${r.status} ${url}`);
      if ((r.status !== 429 && r.status < 500) || i === tries - 1) return { status: r.status };
      await sleep(Math.min(600, ra || 10 * 3 ** i) * 1000);
    } catch (e) {
      log.push(`error ${e.cause?.code || e.message} ${url}`);
      await sleep(10000 * (i + 1));
    }
  }
  return { status: 0 };
}
const sha = s => createHash('sha1').update(s).digest('hex').slice(0, 16);

// ---------- press: CWG sitemaps, then Internet Archive copies of the candidate pages ----------
// cwg.com (formerly group.canarywharf.com) answers page requests with an Imperva challenge, but its robots.txt allows
// the Yoast sitemaps and they are served. Pages are read as Internet Archive id_ copies (the original HTML).
// canarywharf.com (the visitor site, with its own news section) blocks scripts too, and its sitemap is read from the
// Internet Archive (the newest copy of 2026).
const SITEMAPS = {
  'press-release': 'https://cwg.com/press-release-sitemap.xml',
  community_news: 'https://cwg.com/community_news-sitemap.xml',
  'canarywharf-news': 'https://web.archive.org/web/2026id_/https://canarywharf.com/news-sitemap.xml',
};
// A slug names a crown-lighting story when it says lit / illuminated / turns <colour> / lights up <building>.
const SLUG = /(^|-)(lit|illuminat\w*|halo|pyramid|turns-(purple|pink|red|blue|green|orange|gold|yellow|white|teal))(-|$)|lights-up-(green|red|blue|pink|purple|orange|one-canada)|light-it-|goes-(purple|pink|green|blue)/;
// Pages found by search (2026-10-04) whose slug the rule above misses, or which sit on canarywharf.com (not in the
// cwg.com sitemaps). Each is checked the same way.
const KNOWN = [
  'https://canarywharf.com/news/light-it-blue-070121/',
  'https://cwg.com/press-release/canary-wharf-launches-connected-by-light-30102020/',
  'https://cwg.com/press-release/canary-wharf-bursts-with-pride-this-june-010621/',
  'https://cwg.com/community_news/celebrating-the-queens-platinum-jubilee-jun-2022/',
  'https://cwg.com/press-release/canary-wharf-ignites-the-capital-with-launch-of-summer-lights-240621/',
];
const COLOURS = ['red', 'pink', 'purple', 'violet', 'blue', 'green', 'orange', 'amber', 'gold', 'golden', 'yellow', 'white', 'teal', 'turquoise', 'rainbow', 'magenta', 'lilac'];
const CROWN = /one canada square|canada square|pyramid|halo|crown|top of the (building|tower)|tower/i;

function textOf(html) {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'").replace(/&#8211;|&ndash;/g, '-').replace(/\s+/g, ' ').trim();
}
function meta(html, prop) {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
  return m ? m[1] : null;
}
// The date code that CWG puts at the end of a slug: ddmmyy, ddmmyyyy, dd-mm-yy, d-m-yy.
function slugDate(u) {
  const s = u.replace(/\/$/, '').split('/').pop();
  let m = s.match(/-(\d{2})-(\d{2})-(\d{2,4})$/) || s.match(/-(\d{2})(\d{2})(\d{4})$/) || s.match(/-(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${y}-${m[2]}-${m[1]}`;
}

async function press() {
  const urls = new Set(KNOWN);
  for (const [s, sitemapUrl] of Object.entries(SITEMAPS)) {
    const f = join(CACHE, `${s}-sitemap.xml`);
    if (!NOFETCH || !existsSync(f)) {
      const r = await fetchText(sitemapUrl);
      if (r.body) writeFileSync(f, r.body); else log.push(`sitemap ${s} failed ${r.status}`);
    }
    if (!existsSync(f)) continue;
    for (const [, u] of readFileSync(f, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (u.includes('/wp-content/')) continue;
      if (SLUG.test(u.replace(/\/$/, '').split('/').pop())) urls.add(u);
    }
  }
  const pages = [];
  for (const u of urls) {
    const slug = u.replace(/\/$/, '').split('/').pop();
    const kind = u.includes('/community_news/') ? 'community_news' : u.includes('/news/') ? 'news' : 'press-release';
    // the same page under the three host names CWG has used
    const variants = u.includes('canarywharf.com/news/') ? [u] : [
      `https://group.canarywharf.com/${kind}/${slug}/`, `https://cwg.com/${kind}/${slug}/`];
    const cacheHtml = join(CACHE, 'press', `${sha(u)}.html`), cacheMeta = join(CACHE, 'press', `${sha(u)}.json`);
    let rec = existsSync(cacheMeta) ? JSON.parse(readFileSync(cacheMeta, 'utf8')) : null;
    if (!NOFETCH && !(rec && rec.status === 'archived')) {
      rec = { url: u, status: 'not archived', tried: [] };
      for (const v of variants) {
        const a = await fetchText(`https://archive.org/wayback/available?url=${encodeURIComponent(v)}`);
        const snap = a.body && JSON.parse(a.body).archived_snapshots?.closest;
        rec.tried.push({ variant: v, availability: a.status, snapshot: snap?.timestamp || null });
        if (!snap?.available) continue;
        const id = `https://web.archive.org/web/${snap.timestamp}id_/${v}`;
        const p = await fetchText(id, { tries: 2 });
        if (p.body) {
          writeFileSync(cacheHtml, p.body);
          Object.assign(rec, { status: 'archived', archive_url: `https://web.archive.org/web/${snap.timestamp}/${v}`, archive_timestamp: snap.timestamp, fetched: today });
          break;
        }
        rec.status = `archive copy unreachable (${p.status || 'connection reset'})`;
        rec.archive_url = `https://web.archive.org/web/${snap.timestamp}/${v}`;
      }
      writeFileSync(cacheMeta, JSON.stringify(rec, null, 1));
    }
    const out = { url: u, slug_date: slugDate(u), status: rec?.status || 'not fetched', archive_url: rec?.archive_url || null, fetched: rec?.fetched || null };
    if (existsSync(cacheHtml)) {
      const html = readFileSync(cacheHtml, 'utf8'), text = textOf(html);
      out.title = (meta(html, 'og:title') || (html.match(/<title>([^<]*)/i) || [])[1] || '').trim().slice(0, 200);
      out.published = meta(html, 'article:published_time');
      // sentences that name a colour and a crown word: kept locally only (page text is not committed)
      const sentences = text.split(/(?<=[.!?])\s+/).filter(s => CROWN.test(s) && COLOURS.some(c => new RegExp(`\\b${c}\\b`, 'i').test(s)));
      writeFileSync(join(CACHE, 'press', `${sha(u)}.snippets.txt`), sentences.join('\n'));
      out.colour_words = COLOURS.filter(c => sentences.some(s => new RegExp(`\\b${c}\\b`, 'i').test(s)));
      out.names_one_canada_square = /one canada square/i.test(text);
      out.names_halo_or_pyramid = /\bhalo\b|\bpyramid\b/i.test(text);
    }
    pages.push(out);
  }
  pages.sort((a, b) => (a.slug_date || '').localeCompare(b.slug_date || ''));
  writeFileSync(join(OUT, 'press-pages.json'), JSON.stringify({
    meta: {
      about: 'Canary Wharf Group press and news pages whose slug says a building was lit or illuminated, found in the cwg.com sitemaps (plus pages found by search), read from Internet Archive copies. Facts only: title, dates, the colour words that appear in sentences naming a crown or One Canada Square. Page text is not committed.',
      tool: 'tools/fetch-crown-lighting.mjs --press', run: today, slug_rule: String(SLUG), sitemaps: Object.values(SITEMAPS), known_pages: KNOWN,
    },
    pages,
  }, null, 1) + '\n');
  console.log(`press: ${pages.length} candidate pages, ${pages.filter(p => p.status === 'archived').length} read from the archive`);
}

// ---------- Commons: dated night photos of the towers ----------
const CATEGORIES = ['Category:One Canada Square at night', 'Category:Canary Wharf at night'];
const SEARCHES = ['One Canada Square night', 'Canary Wharf night skyline', 'Canary Wharf illuminated', 'Isle of Dogs skyline night'];
const API = 'https://commons.wikimedia.org/w/api.php';
const PLACE = /canary wharf|canada square|docklands|isle of dogs|west india|millwall|blackwall|cabot square|poplar/i;
const II = 'prop=imageinfo&iiprop=extmetadata|url&iiurlwidth=960&iiextmetadatafilter=DateTimeOriginal|LicenseShortName|Artist|ImageDescription';
const strip = s => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
// The API gives imageinfo with thumbnails for at most 50 files per request: follow "continue" and merge by page id.
async function commonsQuery(q) {
  const pages = new Map();
  let cont = {};
  for (let k = 0; k < 20; k++) {
    const extra = Object.entries(cont).map(([a, b]) => `&${a}=${encodeURIComponent(b)}`).join('');
    const r = await fetchText(`${API}?action=query&format=json&formatversion=2&${q}&${II}${extra}`);
    if (!r.body) return pages.size ? [...pages.values()] : null;
    const j = JSON.parse(r.body);
    for (const x of j.query?.pages || []) {
      const old = pages.get(x.pageid);
      pages.set(x.pageid, old && old.imageinfo ? old : { ...old, ...x });
    }
    if (!j.continue) break;
    cont = j.continue;
  }
  return [...pages.values()];
}
async function commons() {
  const f = join(CACHE, 'commons-pages.json');
  let all = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  if (!NOFETCH && !THUMBS_ONLY) {
    for (const c of CATEGORIES) {
      const p = await commonsQuery(`generator=categorymembers&gcmtype=file&gcmlimit=200&gcmtitle=${encodeURIComponent(c)}`);
      if (p) for (const x of p) all[x.title] = { ...all[x.title], ...x, found_by: c }; else log.push(`commons category failed ${c}`);
    }
    for (const s of SEARCHES) {
      const p = await commonsQuery(`generator=search&gsrnamespace=6&gsrlimit=100&gsrsearch=${encodeURIComponent(s + ' filetype:bitmap')}`);
      if (p) for (const x of p) all[x.title] = all[x.title]?.imageinfo ? all[x.title] : { ...x, found_by: all[x.title]?.found_by || `search: ${s}` }; else log.push(`commons search failed ${s}`);
    }
    writeFileSync(f, JSON.stringify(all));
  }
  const photos = [];
  let thumbsStopped = false;
  // thumbnails most likely to show One Canada Square's top first
  const open = x => !/BY-SA|GFDL/i.test(x.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value || 'BY-SA');
  const rank = x => (open(x) ? 0 : 4) + (x.found_by === CATEGORIES[0] ? 0 : 2) + (/canada square|skyline|pyramid/i.test(x.title) ? 0 : 1);
  for (const x of Object.values(all).sort((a, b) => rank(a) - rank(b))) {
    const ii = x.imageinfo?.[0]; if (!ii) continue;
    const em = ii.extmetadata || {};
    // a search hit must be about the place: "Canada Square" alone matched Toronto and Mississauga
    if (!x.found_by.startsWith('Category:') && !PLACE.test(`${x.title} ${strip(em.ImageDescription?.value)}`)) continue;
    const dt = strip(em.DateTimeOriginal?.value);
    const lic = strip(em.LicenseShortName?.value);
    const rec = {
      title: x.title, page: ii.descriptionurl, captured: dt || null, licence: lic || null, author: strip(em.Artist?.value).slice(0, 120) || null,
      found_by: x.found_by,
      use: /BY-SA|GFDL/i.test(lic) ? 'fact only (share-alike: URL, date and colour observed; image not copied)'
        : /^(CC0|Public domain|PDM|CC BY \d|CC BY$)/i.test(lic) ? 'fact; image may be used with attribution' : 'fact only',
    };
    const thumb = join(CACHE, 'thumbs', `${sha(x.title)}.jpg`);
    // upload.wikimedia.org answers 429 after a few dozen thumbnails from this container (2026-10-04: 31, then
    // nothing for 20 minutes): stop at the first refusal and leave the rest for a later run.
    if (!NOFETCH && !thumbsStopped && ii.thumburl && !existsSync(thumb)) {
      const t = await fetchText(ii.thumburl, { binary: true, tries: 1 });
      if (t.body) writeFileSync(thumb, t.body);
      else { thumbsStopped = true; log.push(`thumbnails stopped at ${t.status} (${x.title}); run again later`); }
    }
    rec.thumb_cached = existsSync(thumb) ? `data/raw/registry/lighting/thumbs/${sha(x.title)}.jpg` : null;
    photos.push(rec);
  }
  photos.sort((a, b) => (a.captured || '').localeCompare(b.captured || ''));
  writeFileSync(join(OUT, 'commons-photos.json'), JSON.stringify({
    meta: {
      about: 'Wikimedia Commons photos of Canary Wharf at night with their capture date (EXIF DateTimeOriginal as Commons shows it), licence and author: the candidates for dated crown-colour observations. No image is committed; thumbnails are cached locally to judge the colour by eye.',
      tool: 'tools/fetch-crown-lighting.mjs --commons', run: today, categories: CATEGORIES, searches: SEARCHES,
    },
    photos,
  }, null, 1) + '\n');
  console.log(`commons: ${photos.length} photos, ${photos.filter(p => p.captured).length} with a capture date, ${photos.filter(p => p.thumb_cached).length} thumbnails cached`);
}

if (doPress) await press();
if (doCommons) await commons();
if (log.length) { writeFileSync(join(CACHE, `log-${today}.txt`), log.join('\n') + '\n'); console.log(`${log.length} request problems: data/raw/registry/lighting/log-${today}.txt`); }
