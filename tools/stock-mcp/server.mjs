#!/usr/bin/env node
// stock-mcp — an MCP server (stdio) that checks whether a product is in stock at a Canary Wharf shop, one call per
// user need, through the call the shop's own product page makes. Registered in the repo's .mcp.json as "cwplans-stock".
//
//   node tools/stock-mcp/server.mjs          (Claude Code starts it; JSON-RPC on stdin/stdout)
//   node tools/stock-mcp/test.mjs [--live]   (protocol test; --live makes one stock call per shop: owner approval needed)
//
// Fetch rules (robots.txt, owner approval, 6 s per host, logging, no bot-wall handling): policy.mjs.
// Shops, ids and answers: shops.mjs. Skill: cwplans-stock-check (cwplans/skills/cwplans-stock-check/SKILL.md).
import { SHOPS } from './shops.mjs';

const log = (...a) => process.stderr.write(`[stock-mcp] ${a.join(' ')}\n`);
const json = v => ({ content: [{ type: 'text', text: JSON.stringify(v, null, 1) }] });
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const TOOLS = [
  { name: 'list_stock_shops', description: 'The Canary Wharf shops whose stock this server can check, with the product id each needs, the Canary Wharf store id and the kind of answer (count, level, yes/no, sizes, product list).',
    inputSchema: { type: 'object', properties: {} },
    run: async () => json(Object.entries(SHOPS).map(([id, s]) => ({ shop: id, name: s.name, canary_wharf_store: s.canaryWharf, answer: s.answer, arguments: s.args }))) },
  { name: 'stock_check', description: 'Ask one shop whether a product is in stock at its Canary Wharf branch (one call per user need; 1 request, 6 s or more apart per host). Arguments: shop (see list_stock_shops) and that shop\'s product id arguments. A call to a path that robots.txt disallows needs owner_approval (the owner\'s words and date). Answers are the shop\'s own guide figures, not a promise.',
    inputSchema: { type: 'object', required: ['shop'], properties: { shop: { type: 'string', enum: Object.keys(SHOPS) }, variant_code: { type: 'string' }, sku: { type: 'string' }, qty: { type: 'number' }, product_code: { type: 'string' }, store: { type: 'string' }, product_id: { type: 'string' }, pid: { type: 'string' }, color: { type: 'string' }, size: { type: 'string' }, skus: { type: 'array', items: { type: 'array' } }, query: { type: 'string' }, owner_approval: { type: 'string', description: "the owner's words and date approving this set of fetches (needed when robots.txt disallows the path)" } } },
    run: async a => { const s = SHOPS[a.shop]; if (!s) throw new Error(`unknown shop ${a.shop}`);
      const t0 = Date.now(), r = await s.check(a, { shop: a.shop, owner_approval: a.owner_approval });
      return json({ shop: a.shop, name: s.name, checked_at: new Date().toISOString(), ms: Date.now() - t0, answer_kind: s.answer, ...r, note: 'Stock figures are the shop\'s own guide; they can change before a visit.' }); } },
];

const send = m => process.stdout.write(JSON.stringify(m) + '\n');
async function handle({ id, method, params }) {
  try {
    if (id === undefined) return;                                                  // notifications
    if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[0], capabilities: { tools: {} }, serverInfo: { name: 'cwplans-stock', version: '0.1.0' },
      instructions: 'Check stock at Canary Wharf shops, one call per user need. list_stock_shops gives each shop\'s id arguments; stock_check asks one shop. robots.txt rules apply unless the owner approved the fetch (owner_approval).' } });
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
process.stdin.on('end', () => process.exit(0));
log('ready');
