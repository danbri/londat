// Service worker of the Three.js port (https://danbri.github.io/londat/docklands/): a repeat visit reads the deployed
// files from the device instead of asking GitHub Pages again for each one (Pages sends max-age=600, so after 10 minutes
// every file costs a round trip, and the module imports and layer loads come in chains of them). Owner, 2026-10-20: "any
// GH based Range request optimisation, or other perf work, would still be worthwhile as a stopgap"; KR3.1. Skill:
// docklands-3d-page, "Load speed on Pages: the service worker". Registered by docklands/index.html; ?sw=0 turns it off
// (the page unregisters it and deletes its caches).
//
// Rules:
// - The page (navigation): network first (navigation preload), the cached copy only when the network fails. So a deploy
//   shows at once (the owner checks each push on the live site).
// - Deployed files: the hash manifest docklands/sw-manifest.json (cwplans/tools/build-sw-manifest.mjs, made by the
//   Pages workflow: path -> SHA-256) is fetched again at each navigation (a 304 when nothing changed). A file whose cached
//   copy has the manifest's hash is served from the cache with no request (cache first: content addressed). Otherwise it
//   is fetched (revalidated past the HTTP cache) and cached only when the SHA-256 of its bytes is the manifest's (never a
//   stale copy under a new hash). Asset requests made while the navigation's manifest is in flight wait for it.
// - Everything else goes to the network untouched: other origins (raw.githubusercontent.com live-cache and cache
//   branches, live APIs, weather), same-origin files not in the manifest, range requests (archives), non-GET requests,
//   and requests with cache: 'no-store' or 'reload'. With no manifest (a local server without one) the worker caches
//   only the page, for offline use.
// - Caches: one per worker version (PREFIX + 'v' + SW_VERSION); activation deletes this worker's older versions only (the
//   origin danbri.github.io is shared with other projects and with the knowledge-graph page's worker, cwplans/kg/sw.js).
//   When the manifest version changes, entries whose hash is no longer deployed are deleted; beyond CAP bytes the oldest
//   entries go first.
// - First visit: the page is not controlled until the worker activates; the page then sends the URLs it has read
//   ({ type: 'warm' }) and the worker copies them from the HTTP cache (cache: 'only-if-cached': no network), checked by
//   hash like any other file.
// - Messages: { type: 'warm', urls }, { type: 'stats' } (answers { type: 'sw-stats', ... }), { type: 'clear' }.
const SW_VERSION = 1;   // bump when these rules change
const PREFIX = 'londat-docklands-';
const CACHE = PREFIX + 'v' + SW_VERSION;
const CAP = 300e6;   // bytes of cached bodies kept at most
const ROOT = new URL('../', self.location).href;   // the site root: the folder that holds docklands/
const MANIFEST = new URL('sw-manifest.json', self.location).href;
const PAGE_KEY = new URL('./', self.location).href;   // the page, cached without its query (?view=, ?ll= ...)
const MANIFEST_TIMEOUT = 8000;

let M = null, known = false, pending = null, puts = 0, OFF = false;
const stats = { hits: 0, fetched: 0, stored: 0, mismatched: 0, refetched: 0, passed: 0, warmed: 0 };

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
async function cachedManifest() {
  try { const r = await (await caches.open(CACHE)).match(MANIFEST); return r ? await r.json() : null; } catch { return null; }
}
async function fromNetwork() {   // the deployed manifest; else (offline, slow) the cached one; a 404 means none deployed
  try {
    const r = await withTimeout(fetch(MANIFEST, { cache: 'no-cache' }), MANIFEST_TIMEOUT);
    if (r.ok) {
      const j = await r.clone().json();
      if (j && j.files) {
        await (await caches.open(CACHE)).put(MANIFEST, r);
        const old = M; M = j; known = true;
        if (old && old.version !== j.version) prune().catch(() => {});
        return M;
      }
    }
    if (r.status === 404) { M = null; known = true; return null; }
  } catch { /* offline or slow */ }
  if (!M) M = await cachedManifest();
  known = true;
  return M;
}
function track(p) { pending = p; p.finally(() => { if (pending === p) pending = null; }); return p; }
const refreshManifest = () => track(fromNetwork());   // at each navigation
function manifest() {   // for a file: the manifest of the last navigation (asset requests wait while it is in flight)
  if (pending) return pending;
  if (known) return Promise.resolve(M);
  return track((async () => { const j = await cachedManifest(); if (j) { M = j; known = true; return M; } return fromNetwork(); })());   // a restarted worker, or the first visit
}
const pathOf = url => url.startsWith(ROOT) ? decodeURIComponent(url.slice(ROOT.length).split(/[?#]/)[0]) : null;

async function sha16(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  let s = ''; for (let i = 0; i < 8; i++) s += d[i].toString(16).padStart(2, '0'); return s;
}
async function store(url, res, h) {   // keep the bytes only when their hash is the deployed one
  const buf = await res.arrayBuffer();
  if (await sha16(buf) !== h) { stats.mismatched++; return false; }
  if (OFF) return false;
  const headers = new Headers(res.headers);
  headers.delete('content-encoding'); headers.delete('content-length');   // the body is stored decoded
  headers.set('x-sw-hash', h); headers.set('x-sw-size', String(buf.byteLength)); headers.set('x-sw-time', String(Date.now()));
  await (await caches.open(CACHE)).put(url, new Response(buf, { status: 200, statusText: res.statusText, headers }));
  stats.stored++;
  if (++puts % 50 === 0) capSize().catch(() => {});
  return true;
}
async function prune() {   // drop entries whose hash is no longer deployed
  if (!M) return;
  const c = await caches.open(CACHE);
  for (const k of await c.keys()) {
    if (k.url === MANIFEST || k.url === PAGE_KEY) continue;
    const p = pathOf(k.url), r = await c.match(k);
    if (!p || !r || r.headers.get('x-sw-hash') !== M.files[p]) await c.delete(k);
  }
  await capSize();
}
async function capSize() {
  const c = await caches.open(CACHE), rows = [];
  let total = 0;
  for (const k of await c.keys()) { const r = await c.match(k); const n = +(r && r.headers.get('x-sw-size')) || 0; total += n; if (n) rows.push([+(r.headers.get('x-sw-time')) || 0, n, k]); }
  if (total <= CAP) return total;
  rows.sort((a, b) => a[0] - b[0]);
  for (const [, n, k] of rows) { if (total <= CAP * 0.8) break; await c.delete(k); total -= n; }
  return total;
}

async function page(event) {
  const req = event.request;
  const man = refreshManifest(); event.waitUntil(man.catch(() => {}));
  try {
    const res = (await event.preloadResponse) || await fetch(req);
    if (res.ok && res.type === 'basic') { const copy = res.clone(); event.waitUntil(caches.open(CACHE).then(c => c.put(PAGE_KEY, copy)).catch(() => {})); }
    return res;
  } catch (err) {
    const hit = await (await caches.open(CACHE)).match(PAGE_KEY);
    if (hit) return hit;
    throw err;
  }
}
async function asset(event, req, path) {
  const m = await manifest(), h = m && m.files && m.files[path];
  if (!h) { stats.passed++; return fetch(req); }
  const c = await caches.open(CACHE), hit = await c.match(req.url);
  if (hit && hit.headers.get('x-sw-hash') === h) { stats.hits++; return hit; }
  stats.fetched++;
  const res = await fetch(new Request(req, { cache: 'no-cache' }));   // past a fresh but old HTTP-cache copy (max-age=600)
  if (res.status !== 200 || res.type !== 'basic') return res;
  // never hand the page a file of another release: during a deploy the CDN can answer the new manifest and an old copy
  // of a module (an old build.js with a new main.js can draw rays of triangles to a few points). On a mismatch
  // ask once more under a query of the hash (a new CDN cache key); keep whichever copy has the deployed hash
  const again = (b, r) => { const headers = new Headers(r.headers); headers.delete('content-encoding'); headers.delete('content-length'); return new Response(b, { status: 200, statusText: r.statusText, headers }); };   // (the body is decoded)
  const buf = await res.arrayBuffer();
  if (await sha16(buf) === h) { event.waitUntil(store(req.url, again(buf.slice(0), res), h).catch(() => {})); return again(buf, res); }
  stats.mismatched++;
  const u = new URL(req.url); u.searchParams.set('v', h);
  const r2 = await fetch(u.href, { cache: 'no-cache' }).catch(() => null);
  if (!r2 || r2.status !== 200) return again(buf, res);
  const b2 = await r2.arrayBuffer();
  if (await sha16(b2) === h) { stats.refetched++; event.waitUntil(store(req.url, again(b2.slice(0), r2), h).catch(() => {})); }
  return again(b2, r2);
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
  if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
  await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || OFF) return;
  if (req.mode === 'navigate') {
    if (/[?&]sw=(0|off|no|false)(&|$)/i.test(req.url)) {   // the way off: from now on this worker passes everything to the network
      OFF = true;
      event.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith(PREFIX)) await caches.delete(k); await self.registration.unregister(); })().catch(() => {}));
      return;
    }
    const u = req.url.split(/[?#]/)[0];
    if (u === PAGE_KEY || u === PAGE_KEY + 'index.html') event.respondWith(page(event));   // other pages under docklands/: untouched
    return;
  }
  if (!req.url.startsWith(ROOT) || req.headers.has('range') || req.cache === 'no-store' || req.cache === 'reload') return;
  const path = pathOf(req.url);
  if (!path || path === 'docklands/sw-manifest.json') return;
  event.respondWith(asset(event, req, path));
});

self.addEventListener('message', event => {
  const d = event.data || {};
  if (d.type === 'warm' && Array.isArray(d.urls)) event.waitUntil((async () => {
    const m = await manifest(); if (!m) return;
    const c = await caches.open(CACHE), todo = [...new Set(d.urls)].filter(u => { const p = pathOf(u); return p && m.files[p]; });
    let i = 0;
    const next = async () => {
      while (i < todo.length) {
        const u = todo[i++], h = m.files[pathOf(u)], hit = await c.match(u);
        if (hit && hit.headers.get('x-sw-hash') === h) continue;
        try { const r = await fetch(u, { cache: 'only-if-cached', mode: 'same-origin' }); if (r.status === 200 && await store(u, r, h)) stats.warmed++; } catch { /* not in the HTTP cache: cached at its next use */ }
      }
    };
    await Promise.all([next(), next(), next(), next()]);
  })());
  else if (d.type === 'stats') event.waitUntil((async () => {
    const c = await caches.open(CACHE), keys = await c.keys();
    event.source && event.source.postMessage({ type: 'sw-stats', version: SW_VERSION, cache: CACHE, manifest: M && M.version, entries: keys.length, urls: keys.map(k => k.url), bytes: await capSize(), ...stats });
  })());
  else if (d.type === 'clear') event.waitUntil(caches.delete(CACHE));
});
