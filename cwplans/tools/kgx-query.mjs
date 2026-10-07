// Ask the kgx Shardborough store one SPARQL query through a store handle (no 64-block cap; `factoidal query` is the
// stateless call and refuses a plan above 64 blocks). Prints tab-separated rows.
//   node cwplans/tools/kgx-query.mjs <file.rq | 'SPARQL'> [store dir, default $LONDAT_DIR/kgx/shardborough]
// Skill: cwplans-kgx.
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadEngine } from '@factoidal/core/engine';
import { openStore, openStoreHandle } from '@factoidal/core/store';
import { LONDAT_DIR } from './londat.mjs';

const [arg, dir = join(LONDAT_DIR, 'kgx', 'shardborough')] = process.argv.slice(2);
if (!arg) { console.error('usage: kgx-query.mjs <file.rq | SPARQL> [store dir]'); process.exit(2); }
const sparql = existsSync(arg) ? readFileSync(arg, 'utf8') : arg;
const engine = await loadEngine(), t0 = Date.now();
const h = openStoreHandle(engine, openStore(dir), { sparql });
const r = h.query(sparql); h.close();
if (r.ok === false) { console.error(r.error); process.exit(1); }
if (r.kind !== 'select') { console.log(JSON.stringify(r.boolean ?? r)); process.exit(0); }
const vars = r.srj.head.vars, term = t => !t ? '' : t.type === 'uri' ? `<${t.value}>` : t.value;
console.log(vars.join('\t'));
for (const b of r.srj.results.bindings) console.log(vars.map(v => term(b[v])).join('\t'));
console.error(`${r.srj.results.bindings.length} rows, ${Date.now() - t0} ms`);
