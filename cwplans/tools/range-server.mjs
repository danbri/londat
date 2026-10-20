#!/usr/bin/env node
// A small static file server with HTTP range requests, for local tests of range-read archives (python3 -m http.server
// has no Range support). Hosting study: https://github.com/danbri/londat/blob/main/docs/hosting-options.md . Skill:
// docklands-3d-page, "Hosting: range reads and one-file archives". Local use only: no directory listing, no writes.
//
//   node cwplans/tools/range-server.mjs [--root .] [--port 8215] [--gzip] [--delay 0] [--tls cert.pem,key.pem]
//
// - Range: one range per request (`bytes=a-b`, `bytes=a-`, `bytes=-n`); 206 with Content-Range; 416 when it cannot be
//   met; a multi-range request gets the whole file (200), as GitHub Pages does not do multipart either.
// - --gzip: like GitHub Pages, gzip text and octet-stream answers when the client accepts gzip and sends no Range.
// - --delay ms: wait before each answer (a stand-in for the round trip to a far host; localhost has none).
// - --tls cert,key: HTTPS with HTTP/2 (and HTTP/1.1 for old clients), as the real hosts serve.
// - CORS: Access-Control-Allow-Origin *, Expose-Headers Content-Range, Content-Length, ETag, Accept-Ranges; OPTIONS answers
//   the preflight for Range. Cache-Control: no-cache plus ETag (each test run starts cold in a new browser context).
// - /__stats gives { requests, bytes, paths: { path: { n, bytes } } }; /__reset sets them to zero. Not counted.
import { createServer as createHttp } from 'node:http';
import { createSecureServer } from 'node:http2';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, normalize, extname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.zip': 'application/zip',
  '.gz': 'application/gzip', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv', '.xml': 'application/xml' };
const GZIP_TYPES = /^(text\/|application\/(json|javascript|xml|octet-stream)|model\/gltf|image\/svg)/;   // what GitHub Pages compresses (measured 2026-10-20: json, glb, octet-stream)

export function parseRange(h, size) {   // -> null (whole file), { start, end } or 'bad' (416)
  if (!h) return null; const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim()); if (!m) return null;   // multi-range or other units: whole file
  let start, end;
  if (m[1] === '' && m[2] === '') return 'bad';
  if (m[1] === '') { const n = +m[2]; if (n === 0) return 'bad'; start = Math.max(0, size - n); end = size - 1; }
  else { start = +m[1]; end = m[2] === '' ? size - 1 : Math.min(+m[2], size - 1); }
  return start > end || start >= size ? 'bad' : { start, end };
}

export function startRangeServer({ root = '.', port = 8215, host = '127.0.0.1', gzip = false, delay = 0, tls = null } = {}) {
  const ROOT = resolve(root), stats = { requests: 0, bytes: 0, paths: {} }, gzCache = new Map();
  const count = (p, n) => { stats.requests++; stats.bytes += n; const s = stats.paths[p] || (stats.paths[p] = { n: 0, bytes: 0 }); s.n++; s.bytes += n; };
  async function handle(req, res) {
    const url = new URL(req.url, 'http://x'), path = decodeURIComponent(url.pathname);
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Content-Range, Content-Length, ETag, Accept-Ranges' };
    if (path === '/__stats') { res.writeHead(200, { 'content-type': 'application/json', ...cors }); return res.end(JSON.stringify(stats)); }
    if (path === '/__reset') { stats.requests = 0; stats.bytes = 0; stats.paths = {}; res.writeHead(204, cors); return res.end(); }
    if (req.method === 'OPTIONS') { res.writeHead(204, { ...cors, 'access-control-allow-methods': 'GET, HEAD', 'access-control-allow-headers': 'Range', 'access-control-max-age': '86400' }); return res.end(); }
    if (delay) await new Promise(r => setTimeout(r, delay));
    let file = normalize(join(ROOT, path)); if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { count(path, 0); res.writeHead(404, cors); return res.end(); }
    const st = statSync(file), type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const head = { 'content-type': type, 'accept-ranges': 'bytes', etag, 'cache-control': 'no-cache', vary: 'Accept-Encoding', ...cors };
    if (req.headers['if-none-match'] === etag) { count(path, 0); res.writeHead(304, head); return res.end(); }
    const range = parseRange(req.headers.range, st.size);
    if (range === 'bad') { count(path, 0); res.writeHead(416, { ...head, 'content-range': `bytes */${st.size}` }); return res.end(); }
    const data = readFileSync(file);
    let body, status = 200;
    if (range) { body = data.subarray(range.start, range.end + 1); status = 206; head['content-range'] = `bytes ${range.start}-${range.end}/${st.size}`; }
    else if (gzip && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && GZIP_TYPES.test(type)) {
      const k = file + etag; if (!gzCache.has(k)) gzCache.set(k, gzipSync(data, { level: 6 })); body = gzCache.get(k); head['content-encoding'] = 'gzip';
    } else body = data;
    head['content-length'] = String(body.length);
    count(path, req.method === 'HEAD' ? 0 : body.length);
    res.writeHead(status, head); res.end(req.method === 'HEAD' ? undefined : body);
  }
  const onReq = (req, res) => handle(req, res).catch(e => { try { res.writeHead(500); res.end(String(e)); } catch {} });
  const server = tls ? createSecureServer({ cert: readFileSync(tls[0]), key: readFileSync(tls[1]), allowHTTP1: true }, onReq) : createHttp(onReq);
  return new Promise(ok => server.listen(port, host, () => ok({ server, stats, url: `${tls ? 'https' : 'http'}://${host}:${server.address().port}`, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(r); }) })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv, arg = (k, d) => { const i = a.indexOf(k); return i > 0 ? a[i + 1] : d; };
  const s = await startRangeServer({ root: arg('--root', '.'), port: +arg('--port', 8215), gzip: a.includes('--gzip'), delay: +arg('--delay', 0), tls: arg('--tls', null)?.split(',') || null });
  console.log(`range-server: ${s.url}/ (root ${resolve(arg('--root', '.'))})`);
}
