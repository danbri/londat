// Test of the stock-mcp server, driven the way an MCP client drives it (JSON-RPC over stdio).
//   node tools/stock-mcp/test.mjs                 protocol only: initialize, tools/list, list_stock_shops, argument errors; no network
//   node tools/stock-mcp/test.mjs --live --approval="<owner's words, date>" [--shops=a,b]
//                                                 one stock call per shop (product ids from the surveys of 2026-10-12)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2), opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || null;
const live = args.includes('--live'), approval = opt('approval'), only = opt('shops')?.split(',');
if (live && !approval) { console.error('--live makes requests to shop sites: give --approval="<owner\'s words, date>"'); process.exit(2); }
const srv = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], { stdio: ['pipe', 'pipe', 'inherit'], env: process.env });
let buf = '', id = 0; const wait = new Map();
srv.stdout.on('data', d => { buf += d; let nl; while ((nl = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, nl)); buf = buf.slice(nl + 1); wait.get(m.id)?.(m); wait.delete(m.id); } });
const call = (method, params) => new Promise(r => { const i = ++id; wait.set(i, r); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); });
const tool = async (name, a) => { const m = await call('tools/call', { name, arguments: a }); return { error: m.result?.isError, body: m.result?.content?.[0]?.text }; };
let fail = 0; const ok = (c, msg, extra = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}${extra ? ' — ' + extra : ''}`); if (!c) fail++; };

const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
ok(init.result?.serverInfo?.name === 'cwplans-stock', 'initialize');
const tl = await call('tools/list', {});
ok(tl.result?.tools?.map(t => t.name).join() === 'list_stock_shops,find_product,stock_check,check_product', 'tools/list', tl.result?.tools?.map(t => t.name).join());
const ls = await tool('list_stock_shops', {}); const shops = JSON.parse(ls.body);
ok(shops.length >= 10 && shops.every(s => s.canary_wharf_store && s.arguments), 'list_stock_shops', `${shops.length} shops`);
const miss = await tool('stock_check', { shop: 'hobbs' });
ok(miss.error && /pid/.test(miss.body), 'missing argument refused before any request', miss.body);
const bad = await tool('stock_check', { shop: 'nope' });
ok(bad.error, 'unknown shop refused');

// one product per shop, from the surveys of 2026-10-12 (stock-check-survey.json); Boss needs [EAN, size] pairs from a
// product page, so it is left out unless --shops names it with a pair in BOSS_SKUS
const CASES = {
  'the-white-company': { variant_code: 'CLDDSNNA' },
  'crockett-jones': { sku: '20499A-J01L3/E/060' },
  'robert-dyas': { sku: '251735' },
  'sostrene-grene': { sku: '521893-002' },
  'watches-of-switzerland': { product_code: '17631061' },
  'space-nk': { product_id: 'UK200019905' },
  hobbs: { pid: '0226-5770-9045L00', color: '1880', size: '004' },
  accessorize: { query: 'classic tote bag' },
  intimissimi: { pid: 'CLD28B', color: '019', size: 'S_M_L' },
  ...(process.env.BOSS_SKUS ? { boss: { pid: process.env.BOSS_PID, skus: JSON.parse(process.env.BOSS_SKUS) } } : {}),
};
if (live) for (const [shop, a] of Object.entries(CASES)) {
  if (only && !only.includes(shop)) continue;
  const r = await tool('stock_check', { shop, ...a, owner_approval: approval });
  let j = null; try { j = JSON.parse(r.body); } catch {}
  ok(!r.error && j?.canary_wharf, `stock_check ${shop}`, r.error ? r.body : JSON.stringify(j.canary_wharf).slice(0, 220));
}
srv.stdin.end(); console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0);
