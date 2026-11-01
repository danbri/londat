import {spatialQueries} from '../docklands/test/fixtures/spatial-queries.mjs';
import fs from 'node:fs';import path from 'node:path';import {performance} from 'node:perf_hooks';import {createHash} from 'node:crypto';
const root=process.argv[2],packages=process.argv[3],out=process.argv[4];if(!out)throw Error('Usage: node bench.mjs REPO PACKAGE_ALIASES OUTPUT_JSON');
const storeRoot=process.env.STORE_DIR||path.join(root,'kgx/shardborough');
const generation=fs.readFileSync(path.join(storeRoot,'CURRENT'),'utf8').trim(),base=path.join(storeRoot,generation),manifest=fs.readFileSync(path.join(base,'manifest.sbm2')).toString('hex');
const queries=spatialQueries;
const results=[];const trials=Number(process.env.TRIALS||2);
for(const alias of ['factoidal-old','factoidal-new']){
 const pkg=path.join(packages,alias),{loadL4}=await import(path.join(pkg,'l4-assets/l4factoidal.js')),version=JSON.parse(fs.readFileSync(path.join(pkg,'package.json'))).version;const e=await loadL4();
 const inspected=e.call('storeManifestInspect',[manifest]);if(inspected.ok===false)throw Error(JSON.stringify(inspected));
 for(const query of queries)for(let trial=0;trial<trials;trial++)for(const indexed of (trial%2?[true,false]:[false,true])){
  const t0=performance.now();const p=e.call('storeQueryPlan',[manifest,query.sparql]);if(p.ok===false)throw Error(JSON.stringify(p));const planMs=performance.now()-t0;
  const keys=[...new Set([...p.keys,...(p.blobKeys||[]),...(indexed?p.keys.flatMap(k=>{const en=inspected.entries.find(x=>x.key===k);return Object.values(en?.predicate==='http://www.opengis.net/ont/geosparql#asWKT'?en.sidecars:{}).filter(x=>x.endsWith('.gbi1'));}):[])])];
  const t1=performance.now();const chunks=keys.map(k=>fs.readFileSync(path.join(base,k)));const blob=Buffer.concat(chunks);let offset=0;const artifacts=keys.map((key,i)=>{const a={key,offset,len:chunks[i].length};offset+=a.len;return a;});const readMs=performance.now()-t1;
  const t2=performance.now();const env=e.callBlobIO('storeOpen',[manifest,JSON.stringify(artifacts)],blob).envelope;if(env.ok===false)throw Error(JSON.stringify(env));const openMs=performance.now()-t2;
  const times=[];let answer;
  try{for(let repeat=0;repeat<2;repeat++){const t=performance.now();answer=e.call('storeHandleQuery',[env.handle,query.sparql]);times.push(performance.now()-t);if(answer.ok===false)throw Error(JSON.stringify(answer));}}finally{e.call('storeHandleClose',[env.handle]);}
  const rows=answer.srj.results.bindings.map(b=>JSON.stringify(b)).sort();const result={version,name:query.name,trial,indexed,planMs,readMs,openMs,firstMs:times[0],repeatMs:times.slice(1),totalFirstMs:planMs+readMs+openMs+times[0],bytes:blob.length,blocks:p.keys.length,sidecars:keys.filter(k=>k.endsWith('.gbi1')).length,openEnvelope:env,rows:rows.length,hash:createHash('sha256').update(rows.join('\n')).digest('hex')};results.push(result);console.log(JSON.stringify({...result,openEnvelope:undefined}));fs.writeFileSync(out,JSON.stringify({generation,queries,runtime:{node:process.version,platform:process.platform,arch:process.arch},method:`${trials} trials per case. Node filesystem reads; same WASM store operations as browser; OS cache uncontrolled, no network, alternating index-mode order, one repeat query per handle; only geometry-predicate GBI1 sidecars loaded.`,results},null,2));
 }
}
for(const q of queries){const r=results.filter(r=>r.name===q.name);if(new Set(r.map(x=>x.hash)).size!==1)throw Error('Results differ: '+q.name);}
for(const r of results){if(r.openEnvelope.geoIndexes!==r.sidecars)throw Error('Decoded index count mismatch');if(r.name==='intersects-miss'&&r.rows!==0)throw Error('Expected empty geographic miss');}
console.log('PASS all result hashes match across index modes and package versions');
