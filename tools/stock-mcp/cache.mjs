// Cache and observation log of the stock-mcp server. The system gets data when a user needs it and keeps what it learnt:
//  - product lookups (find_product: words, SKU or EAN -> the shop's ids) are kept for a day: ids change rarely;
//  - stock answers are kept for 5 minutes: shops call their figures "a guide" and they change through the day;
//  - every answer is appended to an observation log (shop, ids, Canary Wharf answer, time) for evaluation and for a
//    later history of what was in stock when; nothing is fetched to fill it.
// Files under $STOCK_MCP_DIR or data/raw/stock-mcp/ (ignored by git): cache.json, observations.jsonl.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = process.env.STOCK_MCP_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'raw', 'stock-mcp');
const FILE = join(DIR, 'cache.json'), OBS = join(DIR, 'observations.jsonl');
export const TTL = { find: 24 * 3600e3, stock: 5 * 60e3 };
let mem = null;
const load = () => { if (mem) return mem; try { mem = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {}; } catch { mem = {}; } return mem; };
const save = () => { try { mkdirSync(DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify(mem)); } catch {} };

export const key = (kind, shop, a) => kind + '|' + shop + '|' + JSON.stringify(Object.keys(a).filter(k => !['shop', 'owner_approval', 'fresh'].includes(k)).sort().map(k => [k, a[k]]));
export function get(k, kind) { const e = load()[k]; return e && Date.now() - e.t < TTL[kind] ? { ...e.v, cached: { at: new Date(e.t).toISOString(), ttl_s: TTL[kind] / 1000 } } : null; }
export function put(k, v) { load()[k] = { t: Date.now(), v }; save(); }
export function observe(rec) { try { mkdirSync(DIR, { recursive: true }); appendFileSync(OBS, JSON.stringify({ at: new Date().toISOString(), ...rec }) + '\n'); } catch {} }
