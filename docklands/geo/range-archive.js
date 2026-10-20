// Range reader for one ZIP archive on a static host (HTTP range requests): many small files in one file, read entry by
// entry with `Range: bytes=a-b`. Plain ES module, no dependencies; browser and Node 22 (fetch, DecompressionStream).
// Written for the hosting study https://github.com/danbri/londat/blob/main/docs/hosting-options.md (owner, 2026-10-20:
// "we need to work on scaling ... consider our options, eg http range reqs?"). Packed by
// cwplans/tools/pack-range-archive.mjs. Skill: docklands-3d-page, "Hosting: range reads and one-file archives".
//
//   const ar = await openRangeArchive('https://host/uk.zip');     // 1 request: a suffix range for the end of the file
//   const json = await ar.json('layers/roads/8/254-200.json');      // reads that are asked for in the same tick share requests
//   const fetchJson = archiveFetchJson(ar, 'https://host/uk/');     // the fetchJson that skeleton.js openSkeleton takes
//
// - Open: one suffix range (`bytes=-N`, default 256 KB) gets the end-of-central-directory record, the central directory
//   and (when the packer put it last) the manifest. Fallback when a suffix range fails (cross-origin hosts whose CORS
//   preflight refuses the Range header, such as raw.githubusercontent.com and jsDelivr, 2026-10-20): HEAD for the size,
//   then an explicit range. A server that ignores Range (200) still works: the whole file is then in memory.
// - Reads: entries asked for in one tick are sorted by offset and merged into one range when the gap between them is at
//   most `gap` bytes (default 32 KB) and the span at most `maxSpan` (1 MB). Entries in the opening tail cost no request.
// - Methods: 0 (stored) and 8 (deflate, inflated with DecompressionStream('deflate-raw')). No ZIP64 (archives < 4 GB,
//   < 65,535 entries), no encryption. A 3D Tiles 3TZ archive is a ZIP too; this reader reads its central directory and
//   ignores its `@3dtilesIndex1@` hash index.
// - Redirects (Hugging Face `resolve/` URLs answer 302 to a signed CDN URL with `Cache-Control: no-store`): the final URL
//   (`response.url`) is used for the next reads; on a 4xx from it the reader goes back to the first URL once.
// - `cache: 'no-store'` (default): Chromium's HTTP cache lets only one request at a time write the entry of a URL (the
//   cache lock), so parallel range reads of one archive run one after another with the cache on (measured 2026-10-20:
//   the London step 787 ms against 272 ms at 40 ms delay). Pass `cache: 'default'` to use the HTTP cache anyway.
//   The reader keeps no entry cache of its own; skeleton.js keeps the decoded files.
// - `stats`: requests, bytes received, entries read; for the measurements in the study.

const SIG_EOCD = 0x06054b50, SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50;

export async function openRangeArchive(url, { fetch: f = globalThis.fetch.bind(globalThis), tail = 262144, gap = 32768, maxSpan = 1 << 20, cache = 'no-store' } = {}) {
  const stats = { requests: 0, bytes: 0, entries: 0, url, log: [] }, T0 = Date.now();
  let readUrl = url;
  async function get(headers, method = 'GET') {
    for (let attempt = 0; ; attempt++) {
      stats.requests++; const t = Date.now();
      const r = await f(readUrl, cache === 'default' ? { method, headers } : { method, headers, cache });
      if (stats.log.length < 500) stats.log.push({ at: t - T0, ms: Date.now() - t, method, range: headers.Range || null, status: r.status });
      if (r.ok) { if (r.url && r.url !== readUrl && method === 'GET') readUrl = r.url; return r; }
      if (attempt === 0 && readUrl !== url && r.status >= 400 && r.status < 500) { readUrl = url; continue; }
      throw new Error(`range-archive: ${r.status} ${method} ${headers.Range || ''} ${url}`);
    }
  }
  async function body(r) { const b = new Uint8Array(await r.arrayBuffer()); stats.bytes += b.byteLength; return b; }
  const total = r => { const m = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || ''); return m ? +m[1] : null; };

  // 1. the end of the file
  let size = null, tailStart = 0, tailBuf;
  try {
    const r = await get({ Range: `bytes=-${tail}` }); tailBuf = await body(r);
    if (r.status === 206) { size = total(r); if (size == null) throw new Error('no Content-Range'); tailStart = size - tailBuf.byteLength; }
    else { size = tailBuf.byteLength; tailStart = 0; }   // 200: the server sent the whole file
  } catch (e) {
    const h = await get({}, 'HEAD'); size = +h.headers.get('content-length');
    if (!(size > 0)) throw new Error('range-archive: no size for ' + url + ' (' + e.message + ')');
    tailStart = Math.max(0, size - tail);
    const r = await get({ Range: `bytes=${tailStart}-${size - 1}` }); tailBuf = await body(r);
    if (r.status === 200) tailStart = 0;
  }
  const dvT = new DataView(tailBuf.buffer, tailBuf.byteOffset, tailBuf.byteLength);
  let eocd = -1;
  for (let i = tailBuf.byteLength - 22; i >= Math.max(0, tailBuf.byteLength - 22 - 65535); i--) if (dvT.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  if (eocd < 0) throw new Error('range-archive: no end-of-central-directory record in ' + url);
  const count = dvT.getUint16(eocd + 10, true), cdSize = dvT.getUint32(eocd + 12, true), cdOff = dvT.getUint32(eocd + 16, true);
  if (cdOff === 0xffffffff || count === 0xffff) throw new Error('range-archive: ZIP64 is not supported');

  // 2. the central directory (in the tail, or one more range)
  let cd;
  if (cdOff >= tailStart) cd = tailBuf.subarray(cdOff - tailStart, cdOff - tailStart + cdSize);
  else cd = await body(await get({ Range: `bytes=${cdOff}-${cdOff + cdSize - 1}` }));
  const dv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength), dec = new TextDecoder();
  const entries = new Map();
  for (let p = 0, n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== SIG_CEN) throw new Error('range-archive: bad central directory at entry ' + n);
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), offset = dv.getUint32(p + 42, true);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nl));
    entries.set(name, { name, method, csize, usize, offset, nl, xl });
    p += 46 + nl + xl + cl;
  }

  // 3. entry reads, batched per tick
  let queue = [], timer = null;
  const inTail = (a, b) => a >= tailStart && b <= tailStart + tailBuf.byteLength;
  function slice(buf, start, e) {   // buf holds file bytes from `start`; the entry's data, or null if the buffer is short
    const o = e.offset - start; if (o < 0 || o + 30 > buf.byteLength) return null;
    const d = new DataView(buf.buffer, buf.byteOffset + o, 30);
    if (d.getUint32(0, true) !== SIG_LOC) throw new Error('range-archive: bad local header for ' + e.name);
    const a = o + 30 + d.getUint16(26, true) + d.getUint16(28, true), b = a + e.csize;
    return b <= buf.byteLength ? buf.subarray(a, b) : null;
  }
  const guessEnd = e => Math.min(cdOff, e.offset + 30 + e.nl + e.xl + 64 + e.csize);   // local extra may differ from central
  async function flush() {
    timer = null; const q = queue; queue = [];
    const need = [];
    for (const job of q) {
      const s = inTail(job.e.offset, guessEnd(job.e)) ? slice(tailBuf, tailStart, job.e) : null;
      if (s) job.ok(s); else need.push(job);
    }
    need.sort((a, b) => a.e.offset - b.e.offset);
    const groups = [];
    for (const job of need) {
      const g = groups[groups.length - 1], a = job.e.offset, b = guessEnd(job.e);
      if (g && a - g.b <= gap && b - g.a <= maxSpan) { g.b = Math.max(g.b, b); g.jobs.push(job); } else groups.push({ a, b, jobs: [job] });
    }
    await Promise.all(groups.map(async g => {
      try {
        const r = await get({ Range: `bytes=${g.a}-${g.b - 1}` }); let buf = await body(r), start = g.a;
        if (r.status === 200) start = 0;   // whole file
        for (const job of g.jobs) {
          let s = slice(buf, start, job.e);
          if (!s) { const e = job.e, rr = await get({ Range: `bytes=${e.offset}-${e.offset + 30 + e.nl + 65535 + e.csize}` }); s = slice(await body(rr), rr.status === 200 ? 0 : e.offset, e); }
          if (s) job.ok(s); else job.fail(new Error('range-archive: short read for ' + job.e.name));
        }
      } catch (err) { for (const job of g.jobs) job.fail(err); }
    }));
  }
  async function inflate(e, data) {
    if (e.method === 0) return data;
    if (e.method !== 8) throw new Error(`range-archive: method ${e.method} not supported (${e.name})`);
    const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    return new Uint8Array(out);
  }
  async function bytes(name) {
    const e = entries.get(name); if (!e) throw new Error('range-archive: no entry ' + name);
    const raw = await new Promise((ok, fail) => { queue.push({ e, ok, fail }); if (!timer) timer = setTimeout(flush, 0); });
    stats.entries++;
    return inflate(e, raw);
  }
  return {
    url, size, stats, entries,
    has: name => entries.has(name),
    list: () => [...entries.keys()],
    bytes,
    text: async name => dec.decode(await bytes(name)),
    json: async name => JSON.parse(dec.decode(await bytes(name))),
  };
}

// A fetchJson for readers that take one (skeleton.js openSkeleton): URLs under `root` come from the archive; others (and
// names the archive does not hold) go to the network.
export function archiveFetchJson(ar, root, { fallback = async u => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); } } = {}) {
  const base = root.endsWith('/') ? root : root + '/';
  return async u => {
    const s = String(u); const name = s.startsWith(base) ? decodeURIComponent(s.slice(base.length).split(/[?#]/)[0]) : null;
    return name != null && ar.has(name) ? ar.json(name) : fallback(s);
  };
}
