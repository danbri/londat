#!/usr/bin/env node
// stock-mcp — an MCP server (stdio) that checks whether a product is in stock at a Canary Wharf shop, one call per
// user need, through the call the shop's own product page makes. Registered in the repo's .mcp.json as "cwplans-stock".
//
//   node tools/stock-mcp/server.mjs          (Claude Code starts it; JSON-RPC on stdin/stdout)
//   node tools/stock-mcp/test.mjs [--live]   (protocol test; --live makes one stock call per shop: owner approval needed)
// Tools: list_stock_shops, find_product (words / SKU / EAN -> the shop's ids), stock_check, check_product (both). Cache
// and observation log: cache.mjs.
//
// Fetch rules (robots.txt, owner approval, 6 s per host, logging, no bot-wall handling): policy.mjs.
// Shops, ids and answers: adapters/canary-wharf.mjs (the place: data/region.json). Skill: cwplans-stock-check (cwplans/skills/cwplans-stock-check/SKILL.md).
// the region's shop adapters (one file per region in adapters/; STOCK_MCP_ADAPTER names another)
const { SHOPS } = await import(process.env.STOCK_MCP_ADAPTER || './adapters/canary-wharf.mjs');
import * as cache from './cache.mjs';
import { closeBrowser } from './policy.mjs';

const log = (...a) => process.stderr.write(`[stock-mcp] ${a.join(' ')}\n`);
const json = v => ({ content: [{ type: 'text', text: JSON.stringify(v, null, 1) }] });
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const ARGS = { shop: { type: 'string', enum: Object.keys(SHOPS) }, variant_code: { type: 'string' }, sku: { type: 'string' }, qty: { type: 'number' }, product_code: { type: 'string' }, store: { type: 'string' }, product_id: { type: 'string' }, pid: { type: 'string' }, color: { type: 'string' }, size: { type: 'string' }, skus: { type: 'array', items: { type: 'array' } }, query: { type: 'string' },
  fresh: { type: 'boolean', description: 'ignore the cache (stock answers are cached 5 minutes, product lookups a day)' },
  owner_approval: { type: 'string', description: "the owner's words and date approving this set of fetches (needed when robots.txt disallows the path)" } };
const NOTE = 'Stock figures are the shop\'s own guide; they can change before a visit.';

// one stock answer, through the cache; every fetched answer goes to the observation log
async function stock(a) {
  const s = SHOPS[a.shop]; if (!s) throw new Error(`unknown shop ${a.shop}`);
  const k = cache.key('stock', a.shop, a), hit = !a.fresh && cache.get(k, 'stock'); if (hit) return hit;
  const t0 = Date.now(), r = await s.check(a, { shop: a.shop, owner_approval: a.owner_approval });
  const v = { shop: a.shop, name: s.name, checked_at: new Date().toISOString(), ms: Date.now() - t0, answer_kind: s.answer, ...r, note: NOTE };
  cache.put(k, v); cache.observe({ kind: 'stock', shop: a.shop, args: Object.fromEntries(Object.entries(a).filter(([x]) => !['owner_approval', 'fresh'].includes(x))), canary_wharf: r.canary_wharf });
  return v;
}
// candidate products with the arguments stock_check takes, through the cache
async function find(a) {
  const s = SHOPS[a.shop]; if (!s) throw new Error(`unknown shop ${a.shop}`);
  if (!s.find) throw new Error(`${s.name}: no product lookup yet; give the shop's own ids to stock_check (list_stock_shops shows them)`);
  if (!a.query) throw new Error('argument "query" is needed: words, a SKU or an EAN');
  const k = cache.key('find', a.shop, { query: a.query }), hit = !a.fresh && cache.get(k, 'find'); if (hit) return hit;
  const t0 = Date.now(), r = await s.find(a, { shop: a.shop, owner_approval: a.owner_approval });
  const v = { shop: a.shop, name: s.name, query: a.query, found_at: new Date().toISOString(), ms: Date.now() - t0, ...r };
  cache.put(k, v); cache.observe({ kind: 'find', shop: a.shop, query: a.query, candidates: (r.candidates || []).length });
  return v;
}

const TOOLS = [
  { name: 'list_stock_shops', description: 'The Canary Wharf shops whose stock this server can check: the product id each stock_check needs, whether find_product works for it, the Canary Wharf store id and the kind of answer (count, level, yes/no, sizes, product list).',
    inputSchema: { type: 'object', properties: {} },
    run: async () => json(Object.entries(SHOPS).map(([id, s]) => ({ shop: id, name: s.name, canary_wharf_store: s.canaryWharf, answer: s.answer, find_product: !!s.find, find_by: s.findBy || null, arguments: s.args }))) },
  { name: 'find_product', description: 'Find products at one shop from the user\'s words, a SKU or an EAN (what the shop\'s own search accepts: see find_by in list_stock_shops). Returns candidates, each with the exact arguments stock_check needs (per size where the shop checks per size). 1 or 2 requests; cached a day.',
    inputSchema: { type: 'object', required: ['shop', 'query'], properties: ARGS },
    run: async a => json(await find(a)) },
  { name: 'stock_check', description: 'Ask one shop whether a product is in stock at its Canary Wharf branch (one call per user need; 1 request, 6 s or more apart per host; cached 5 minutes). Arguments: shop and that shop\'s product ids (from find_product or list_stock_shops). A path that robots.txt disallows needs owner_approval (the owner\'s words and date). Answers are the shop\'s own guide figures, not a promise.',
    inputSchema: { type: 'object', required: ['shop'], properties: ARGS },
    run: async a => json(await stock(a)) },
  { name: 'check_product', description: 'One step for a user need: find_product at one shop, then stock_check of the best candidate (the first, or the one whose size matches "size"). 2 to 3 requests. Returns the candidate used, the other candidates and the Canary Wharf answer.',
    inputSchema: { type: 'object', required: ['shop', 'query'], properties: ARGS },
    run: async a => { const f = await find(a), c = (f.candidates || [])[0];
      if (!c) return json({ ...f, answer: null, note: 'no candidate found' });
      const v = a.size && c.sizes ? (c.sizes.find(z => String(z.label).toLowerCase() === String(a.size).toLowerCase()) || null) : null;
      const args = { ...(v ? v.args : c.args) };
      if (!args || !Object.keys(args).length) return json({ ...f, answer: null, note: 'the candidate has no stock_check arguments (choose a size: see sizes)' });
      const r = await stock({ shop: a.shop, ...args, owner_approval: a.owner_approval, fresh: a.fresh });
      return json({ shop: a.shop, query: a.query, used: { name: c.name, url: c.url, size: v?.label || null, args }, answer: r, other_candidates: (f.candidates || []).slice(1, 6).map(x => ({ name: x.name, url: x.url })) }); } },
];

const send = m => process.stdout.write(JSON.stringify(m) + '\n');
async function handle({ id, method, params }) {
  try {
    if (id === undefined) return;                                                  // notifications
    if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[0], capabilities: { tools: {} }, serverInfo: { name: 'cwplans-stock', version: '0.2.0' },
      instructions: 'Check stock at Canary Wharf shops, one call per user need. list_stock_shops gives the shops; find_product turns words, a SKU or an EAN into a shop\'s ids; stock_check asks one shop; check_product does both. Answers are cached (stock 5 minutes, products a day). robots.txt rules apply unless the owner approved the fetch (owner_approval).' } });
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } });
    if (method === 'tools/call') {
      const tool = TOOLS.find(t => t.name === params?.name);
      if (!tool) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `unknown tool: ${params?.name}` } });
      try { return send({ jsonrpc: '2.0', id, result: await tool.run(params.arguments || {}) }); }
      catch (e) { return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: String(e?.message || e).slice(0, 2000) }] } }); }
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
  } catch (e) { send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(e?.message || e) } }); }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk; let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); continue; }
    handle(msg);
  }
});
const quit = async () => { await closeBrowser(); process.exit(0); };
process.stdin.on('end', quit);
process.on('SIGTERM', quit);
log('ready');
