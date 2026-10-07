// Query the cwplans knowledge graph's Shardborough store in the browser with the Factoidal Lean engine (WebAssembly).
// The engine plans each SPARQL query from the store manifest (zone maps drop blocks that cannot match); this worker
// fetches only the blocks the plan names (the service worker keeps them), not their sidecar indexes (they only make a
// scan faster), and answers from a store handle that holds those blocks. Up to MAX_HANDLES handles stay open; a query
// whose blocks one of them holds reuses it. Results come as a count and pages (LIMIT/OFFSET).
// Messages: {id, type: 'init', base} | {id, type: 'query', sparql, page, pageSize} | {id, type: 'describe', iri}.
// Skill: cwplans-kgx.
import { loadL4 } from 'https://cdn.jsdelivr.net/npm/@factoidal/core@0.7.1/l4-assets/l4factoidal.js';

const MAX_HANDLES = 4;
let engine, base, gen, manifestHex;
const handles = [];                                       // { id, keys: Set, bytes, used } most recently used last
const bytes = new Map();                                  // artifact key -> bytes, as fetched
const plans = new Map();                                  // sparql -> plan
const HEX = Array.from({ length: 256 }, (_, b) => b.toString(16).padStart(2, '0'));
const hexOf = u8 => { const p = new Array(u8.length); for (let i = 0; i < u8.length; i++) p[i] = HEX[u8[i]]; return p.join(''); };
// raw.githubusercontent.com answers 429 when many files are asked for at once: wait (Retry-After, else 1, 2, 4, 8 s)
const getBytes = async url => {
  for (let i = 0; ; i++) {
    const r = await fetch(url);
    if (r.ok) return new Uint8Array(await r.arrayBuffer());
    if (i >= 4 || !(r.status === 429 || r.status >= 500)) throw new Error(`${r.status} for ${url}`);
    await new Promise(ok => setTimeout(ok, 1000 * (+r.headers.get('Retry-After') || 2 ** i)));
  }
};
const stats = { fetched: 0, fetchedBytes: 0, opens: 0 };
const EMPTY = { kind: 'select', srj: { head: { vars: [] }, results: { bindings: [] } } };

async function init(b) {
  base = b; engine = await loadL4();
  gen = (await (await fetch(base + 'shardborough/CURRENT', { cache: 'no-cache' })).text()).trim();
  let manifest; for (const name of ['manifest.sbm2', 'manifest.sbm1']) { try { manifest = await getBytes(`${base}shardborough/${gen}/${name}`); break; } catch {} }
  if (!manifest) throw new Error('no manifest in ' + gen);
  manifestHex = hexOf(manifest);
  const ins = engine.call('storeManifestInspect', [manifestHex]);
  return { generation: gen, rows: ins.totalRows, bytes: ins.totalBytes, blocks: ins.entries.length, wire: ins.wireVersion,
    graphs: new Set(ins.entries.flatMap(e => (e.graphs || []).map(g => g.value ?? g))).size, predicates: new Set(ins.entries.map(e => e.predicate)).size,
    manifestBytes: manifest.length, engine: engine.version().split(' (')[0] };
}
async function fetchKeys(keys) {
  const todo = keys.filter(k => !bytes.has(k));
  for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(async k => {
    const b = await getBytes(`${base}shardborough/${gen}/${k}`); bytes.set(k, b); stats.fetched++; stats.fetchedBytes += b.length; }));
}
// a handle that holds every key: an open one if it can, else a new one with just these keys
async function handleFor(keys) {
  const h = handles.find(h => keys.every(k => h.keys.has(k)));
  if (h) { handles.splice(handles.indexOf(h), 1); handles.push(h); return h; }
  await fetchKeys(keys);
  const artifacts = []; let off = 0;
  for (const k of keys) { artifacts.push({ key: k, offset: off, len: bytes.get(k).length }); off += bytes.get(k).length; }
  const blob = new Uint8Array(off); for (const a of artifacts) blob.set(bytes.get(a.key), a.offset);
  const env = engine.callBlobIO('storeOpen', [manifestHex, JSON.stringify(artifacts)], blob).envelope;
  if (env.ok === false) throw new Error(env.error || 'storeOpen refused');
  stats.opens++;
  const nh = { id: env.handle, keys: new Set(keys), bytes: off };
  handles.push(nh);
  while (handles.length > MAX_HANDLES) { const old = handles.shift(); try { engine.call('storeHandleClose', [old.id]); } catch {} }
  return nh;
}
function plan(sparql) {
  if (plans.has(sparql)) return plans.get(sparql);
  const p = engine.call('storeQueryPlan', [manifestHex, sparql]);
  if (p.ok === false) throw new Error(p.error);
  const r = { keys: [...new Set([...p.keys, ...(p.blobKeys ?? [])])], blocks: p.keys.length, zoneExcluded: p.zoneExcluded ?? 0 };
  plans.set(sparql, r); if (plans.size > 200) plans.delete(plans.keys().next().value);
  return r;
}
async function onHandle(keys, sparql) {
  let need = keys;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!need.length) return { r: EMPTY };                // no block can match
    const h = await handleFor(need);
    try { const r = engine.call('storeHandleQuery', [h.id, sparql]); if (r.ok === false) throw new Error(r.error); return { r, h }; }
    catch (err) { const m = String(err.message).match(/needs artifact '([^']+)'/); if (!m) throw err; need = [...need, m[1]]; }
  }
  throw new Error('the handle kept missing artifacts');
}
// split a query into its prologue (PREFIX/BASE) and body
const splitPrologue = q => { const m = q.match(/^((?:\s*(?:PREFIX\s+\S*:\s*<[^>]*>|BASE\s+<[^>]*>|#[^\n]*))*)\s*([\s\S]*)$/i); return [m[1], m[2]]; };
// split a SELECT body into head, WHERE group and tail. An IRI cannot hold a brace, so the scan skips only string
// literals and comments. Null when the body does not have that shape.
function whereSplit(body) {
  let i = body.indexOf('{'); if (i < 0) return null;
  const start = i; let depth = 0;
  for (; i < body.length; i++) {
    const c = body[i];
    if (c === '#') { const e = body.indexOf('\n', i); i = e < 0 ? body.length : e; continue; }
    if (c === '"' || c === "'") { const long = body.startsWith(c.repeat(3), i), close = long ? c.repeat(3) : c; i += close.length;
      while (i < body.length && !body.startsWith(close, i)) i += body[i] === '\\' ? 2 : 1; i += close.length - 1; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return { head: body.slice(0, start), group: body.slice(start, i + 1), tail: body.slice(i + 1) };
  }
  return null;
}
// a SELECT with no LIMIT of its own comes back a page at a time. When its rows are the solutions of its WHERE group
// (no DISTINCT, REDUCED, aggregate, GROUP BY, HAVING or trailing VALUES) a COUNT over that group gives the total; a
// COUNT over a subquery would not do, because the planner does not look inside a subquery and names every block.
// Otherwise the page asks for one row more, to know whether a later page exists.
async function query(sparql, page = 0, pageSize = 200) {
  const t0 = performance.now(), f0 = stats.fetchedBytes, o0 = stats.opens, p = plan(sparql);
  const [pro, body] = splitPrologue(sparql);
  const isSelect = /^SELECT\b/i.test(body), hasLimit = /\b(LIMIT|OFFSET)\s+\d+\s*$/i.test(body.trim());
  let count = null, more = false, res;
  if (isSelect && !hasLimit && pageSize) {
    const w = whereSplit(body);
    const plain = w && !/^SELECT\s+(DISTINCT|REDUCED)\b|\b(COUNT|SUM|MIN|MAX|AVG|SAMPLE|GROUP_CONCAT)\s*\(/i.test(w.head) && !/\b(GROUP\s+BY|HAVING|VALUES)\b/i.test(w.tail);
    if (plain) {
      const c = await onHandle(p.keys, `${pro}\nSELECT (COUNT(*) AS ?__count) WHERE ${w.group}`);
      count = c.r === EMPTY ? 0 : +(c.r.srj?.results?.bindings?.[0]?.__count?.value ?? NaN);
      res = count === 0 ? { r: EMPTY } : await onHandle(p.keys, `${pro}\n${body}\nLIMIT ${pageSize} OFFSET ${page * pageSize}`);
    } else {
      res = await onHandle(p.keys, `${pro}\n${body}\nLIMIT ${pageSize + 1} OFFSET ${page * pageSize}`);
      const rows = res.r.srj?.results?.bindings; if (rows && rows.length > pageSize) { more = true; rows.length = pageSize; }
    }
  } else res = await onHandle(p.keys, sparql);
  const r = res.r;
  return { kind: r.kind, srj: r.srj, boolean: r.boolean, count, more, page, pageSize, ms: Math.round(performance.now() - t0),
    blocks: p.blocks, zoneExcluded: p.zoneExcluded, fetchedBytes: stats.fetchedBytes - f0, opened: stats.opens - o0,
    handleBlocks: res.h ? res.h.keys.size : 0, handleBytes: res.h ? res.h.bytes : 0, cachedBytes: stats.fetchedBytes };
}
async function describe(iri) {
  const t0 = performance.now(), f0 = stats.fetchedBytes;
  const out = await query(`SELECT ?g ?p ?o WHERE { GRAPH ?g { <${iri}> ?p ?o } }`, 0, 500);
  const inc = await query(`SELECT ?g ?s ?p WHERE { GRAPH ?g { ?s ?p <${iri}> } }`, 0, 200);
  return { out: out.srj.results.bindings, outCount: out.count, in: inc.srj.results.bindings, inCount: inc.count, ms: Math.round(performance.now() - t0),
    blocks: out.blocks + inc.blocks, fetchedBytes: stats.fetchedBytes - f0 };
}
self.onmessage = async ({ data }) => {
  try {
    const r = data.type === 'init' ? await init(data.base) : data.type === 'query' ? await query(data.sparql, data.page, data.pageSize) : await describe(data.iri);
    self.postMessage({ id: data.id, ok: true, r });
  } catch (err) { self.postMessage({ id: data.id, ok: false, error: String(err?.message || err) }); }
};
