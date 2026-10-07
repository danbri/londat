// Archive, as served, the Living Map data behind https://map.canarywharf.com/ (owner, 2026-10-06: "Archive everything
// including all map tiles into a mallmap subfolder, as is"): the app shell, the map config, the GET API answers
// (feature-objects, feature-names, geofences, styles, the tag searches, /features for every feature name), the sprite,
// the language file, every indoor vector tile (zoom 0-19) and basemap tile (zoom 0-16) over the map's extents, and
// the popup images that tiles and features name. Bytes are written unchanged; manifest.json maps each URL to its file
// with status, type, size, SHA-256 and time. Restartable: a URL already in the manifest is not fetched again.
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/archive-cwg-mallmap.mjs [--only=tiles|api|media|app]
//   out: danbri/londat third_party/cwg/mallmap/ (LONDAT_DIR, default ../londat)
// Not fetched: the Gotham font glyphs (a commercial typeface, Hoefler&Co), the session and event POSTs (usage logging),
// third-party scripts (Mapbox, marker.io). Skill: cwplans-web-harvest, "Mall plans".
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import { UA } from './lib.mjs';
import { LONDAT_DIR } from './londat.mjs';

const OUT = join(LONDAT_DIR, 'third_party', 'cwg', 'mallmap'), MAN = join(OUT, 'manifest.json');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
const API = 'https://map-api.prod.livingmap.com', CDN = 'https://prod.cdn.livingmap.com', P = 'canary_wharf', LANG = 'en-GB';
const GAP = { 'prod.cdn.livingmap.com': 500 };            // a static CDN (CloudFront, s-maxage forever); 1100 ms elsewhere
const sleep = ms => new Promise(r => setTimeout(r, ms));
const man = existsSync(MAN) ? JSON.parse(readFileSync(MAN, 'utf8')) : { files: {} };
// answers that failed (4xx other than 404, 5xx, network) are dropped and asked again; a URL no longer asked stays out
for (const [u, r] of Object.entries(man.files)) if (r.status == null || (r.status >= 400 && r.status !== 404)) delete man.files[u];
const save = () => { man.about = 'Living Map data behind https://map.canarywharf.com/ (Canary Wharf Group), archived as served for reference. See README.md.'; man.updated = new Date().toISOString(); writeFileSync(MAN, JSON.stringify(man, null, 1) + '\n'); };
let saved = 0;
// one queue per host: one request at a time, GAP apart
const queues = new Map();
function get(url, file) {
  if (man.files[url] && (man.files[url].status === 200 ? existsSync(join(OUT, man.files[url].file)) : man.files[url].status === 204 || man.files[url].status === 404)) return Promise.resolve(man.files[url]);
  const host = new URL(url).host, prev = queues.get(host) || Promise.resolve();
  const p = prev.then(async () => {
    let res, body, err;
    for (let i = 0; i < 4; i++) {
      try { res = await fetch(url, { headers: { 'user-agent': UA, origin: 'https://map.canarywharf.com', referer: 'https://map.canarywharf.com/' }, signal: AbortSignal.timeout(60000) }); body = Buffer.from(await res.arrayBuffer()); err = null; if (res.status < 500 && res.status !== 429) break; }
      catch (e) { err = String(e.cause?.code || e.message); }
      await sleep(3000 * 2 ** i);
    }
    await sleep(GAP[host] ?? 1100);
    const rec = { file: null, status: res?.status ?? null, type: res?.headers.get('content-type') || null, bytes: body?.length ?? 0, fetched: new Date().toISOString(), ...(err ? { error: err } : {}) };
    if (res?.status === 200) { const f = join(OUT, file); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, body); rec.file = file; rec.sha256 = createHash('sha256').update(body).digest('hex'); }
    man.files[url] = rec; if (++saved % 50 === 0) { save(); console.log(saved, 'fetched', url); }
    return rec;
  });
  queues.set(host, p.catch(() => {})); return p;
}
const body = rec => rec?.file ? readFileSync(join(OUT, rec.file)) : null;
const json = rec => { const b = body(rec); try { return b ? JSON.parse(b) : null; } catch { return null; } };
const slug = s => String(s).normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'x';

// 1. the app shell and the config
const cfgRec = await get(`${API}/v1/maps?host=map.canarywharf.com`, 'api/maps.json');
const cfg = (() => { const j = json(cfgRec); const d = j?.data ?? j; return Array.isArray(d) ? d[0] : d; })();
if (!cfg) throw new Error('no map config');
const jobs = [];
if (!only || only === 'app') {
  const html = body(await get('https://map.canarywharf.com/', 'app/index.html'))?.toString() || '';
  for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) jobs.push(get('https://map.canarywharf.com' + m[1], 'app' + m[1]));
  if (cfg.favicon_url) jobs.push(get(cfg.favicon_url, 'api/assets/favicon.ico'));
}
// 2. the GET API answers
const media = new Set();
if (!only || only === 'api' || only === 'media') {
  for (const [path, file] of [['feature-objects', 'feature-objects.json'], ['feature-names', 'feature-names.json'], ['geofences', 'geofences.json'], ['styles/styles.json', 'styles.json']])
    jobs.push(get(`${API}/v1/maps/${P}/${path}?lang=${LANG}`, 'api/' + file));
  // the tag search needs latitude, longitude and floor_id together: one answer per tag and floor
  for (const t of cfg.search_tags || []) for (const f of cfg.floors || [])
    jobs.push(get(`${API}/v1/maps/${P}/search/tag/${t.id}?latitude=${cfg.center.latitude}&longitude=${cfg.center.longitude}&floor_id=${f.id}&limit=100`, `api/search-tag/${t.id}/floor-${f.id}.json`));
  jobs.push(get(`${CDN}/styles/${P}/icons.json`, 'sprite/icons.json'), get(`${CDN}/styles/${P}/icons.png`, 'sprite/icons.png'),
    get(`${CDN}/styles/${P}/icons@2x.json`, 'sprite/icons@2x.json'), get(`${CDN}/styles/${P}/icons@2x.png`, 'sprite/icons@2x.png'),
    get(`https://languages.livingmap.com/prod/lmp/${LANG}.json`, `languages/${LANG}.json`));
  const names = json(await get(`${API}/v1/maps/${P}/feature-names?lang=${LANG}`, 'api/feature-names.json'))?.data || [];
  const seen = new Set();
  for (const n of names) {
    const s = slug(n), file = `api/features-by-name/${seen.has(s) ? s + '-' + createHash('sha1').update(n).digest('hex').slice(0, 6) : s}.json`; seen.add(s);
    // without a position: latitude, longitude and floor_id must be sent together or not at all (HTTP 400)
    jobs.push(get(`${API}/v1/maps/${P}/features?long_name=${encodeURIComponent(n)}&lang=${LANG}`, file).then(rec => {
      const walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') Object.values(o).forEach(walk); else if (typeof o === 'string' && /^https:\/\/\S+\.(jpe?g|png|webp|gif|svg)$/i.test(o)) media.add(o); };
      walk(json(rec));
    }));
  }
}
// 3. every tile over the extents
const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z), lat2y = (lat, z) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
const E = cfg.extents, tileJobs = [];
const sources = [['indoor', z => `${CDN}/tiles/${P}/{z}/{x}/{y}.pbf?lang=${LANG}`, 19, 'pbf'], ['basemap', z => `${CDN}/${P}_basemap/{z}/{x}/{y}`, 16, 'pbf']];
if (!only || only === 'tiles' || only === 'media') {
  for (const [name, tpl, maxz, ext] of sources) for (let z = 0; z <= maxz; z++) {
    const x0 = lon2x(E.bottom_left.longitude, z), x1 = lon2x(E.top_right.longitude, z), y0 = lat2y(E.top_right.latitude, z), y1 = lat2y(E.bottom_left.latitude, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++)
      tileJobs.push(get(tpl(z).replace('{z}', z).replace('{x}', x).replace('{y}', y), `tiles/${name}/${z}/${x}/${y}.${ext}`).then(rec => {
        if (name !== 'indoor' || !rec?.file) return;
        try { const t = new VectorTile(new Protobuf(body(rec))); for (const l of Object.values(t.layers)) for (let i = 0; i < l.length; i++) { const u = l.feature(i).properties.popup_image_url; if (u && /^https:/.test(u)) media.add(u); } } catch {}
      }));
  }
  console.log('tiles to check:', tileJobs.length);
}
await Promise.all([...jobs, ...tileJobs]);
// 4. the popup images
if (!only || only === 'media') await Promise.all([...media].map(u => { const p = new URL(u); return get(u, `media/${p.host}${p.pathname}`); }));
save();
const recs = Object.values(man.files), by = s => recs.filter(r => r.status === s).length;
console.log(JSON.stringify({ urls: recs.length, ok: by(200), empty_204: by(204), not_found: by(404), other: recs.filter(r => ![200, 204, 404].includes(r.status)).length, bytes: recs.reduce((a, r) => a + (r.file ? r.bytes : 0), 0) }));
