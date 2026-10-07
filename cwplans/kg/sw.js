// Service worker for the knowledge-graph search page: keeps the Factoidal engine (a pinned version) and the graph
// files on the device, so the page opens and answers queries offline after the first visit.
// Engine files (pinned version) and Shardborough store files (a generation folder never changes) are served from the
// cache first; CURRENT, the manifest and the page are network first, with the cache as the fallback. Skill: cwplans-kgx.
const CACHE = 'cwplans-kg-v1';
const ENGINE = /^https:\/\/cdn\.jsdelivr\.net\/npm\/@factoidal\/core@\d+\.\d+\.\d+\//;
const HASHED = /[?&]v=[0-9a-f]{16,}|\/shardborough\/gen-[^/]+\//;   // a store generation never changes once written

self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html']).catch(() => {}))); });
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

async function cacheFirst(req) {
  const c = await caches.open(CACHE), hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await c.put(req, res.clone());
  return res;
}
async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try { const res = await fetch(req, { cache: 'no-cache' }); if (res.ok) await c.put(req, res.clone()); return res; }
  catch (err) { const hit = await c.match(req); if (hit) return hit; throw err; }
}
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  if (ENGINE.test(r.url) || HASHED.test(r.url)) e.respondWith(cacheFirst(r));
  else if (r.url.endsWith('/manifest.json') || r.url.endsWith('/shardborough/CURRENT') || r.mode === 'navigate' || new URL(r.url).origin === location.origin) e.respondWith(networkFirst(r));
});
// the page asks: which hashed data files are cached, and drop those not in the current manifest
self.addEventListener('message', async e => {
  const c = await caches.open(CACHE), keys = await c.keys();
  if (e.data?.type === 'prune') { const keep = new Set(e.data.keep); for (const k of keys) if (HASHED.test(k.url) && !keep.has(k.url)) await c.delete(k); }
  if (e.data?.type === 'keep-generation') for (const k of keys) { const m = k.url.match(/\/shardborough\/(gen-[^/]+)\//); if (m && m[1] !== e.data.generation) await c.delete(k); }
  if (e.data?.type === 'clear') await caches.delete(CACHE);
  const left = (await (await caches.open(CACHE)).keys()).map(k => k.url);
  e.source?.postMessage({ type: 'cache', urls: left });
});
