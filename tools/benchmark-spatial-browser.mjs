import {spatialQueries} from '../docklands/test/fixtures/spatial-queries.mjs';
// Browser/WASM spatial index comparison. No production files are changed.
// node tools/benchmark-spatial-browser.mjs REPO ALIASES_NODE_MODULES GEOMETRY_STORE OUTPUT_JSON
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const [root,packages,geometryStore,output]=process.argv.slice(2).map(x=>path.resolve(x));
if(!output)throw Error('Pass REPO ALIASES_NODE_MODULES GEOMETRY_STORE OUTPUT_JSON');
const require=createRequire(path.join(root,'package.json'));
const {chromium}=require('playwright');
const stores={mixed:path.join(root,'kgx/shardborough'),geometry:geometryStore};
const result={method:'Headless Chrome; official local package aliases; persisted store artifacts served over loopback HTTP; HTTP cache disabled and service workers blocked. Engine boot/manifest inspect shared per version/store. One fresh handle per case plus one repeated query. Local transfer times, not WAN/cold-disk measurements.',created:new Date().toISOString(),results:[],errors:[]};
const server=http.createServer((req,res)=>{
 try{
  const parts=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean);
  if(parts.some(x=>x==='..'))throw Error('Invalid path');
  let file;
  if(parts[0]==='package')file=path.join(packages,...parts.slice(1));
  else if(parts[0]==='store'&&stores[parts[1]])file=path.join(stores[parts[1]],...parts.slice(2));
  else{res.setHeader('content-type','text/html');res.end('<!doctype html><title>Spatial benchmark</title>');return;}
  const bytes=fs.readFileSync(file);
  res.setHeader('content-type',file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');
  res.setHeader('cache-control','no-store');res.end(bytes);
 }catch(e){res.statusCode=404;res.end(String(e));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})}).catch(async error=>{await new Promise(resolve=>server.close(resolve));throw error;});
result.browser=browser.version();
const queries=spatialQueries.filter(q=>['intersects-local','intersects-miss'].includes(q.name));
result.queries=queries;
try{
 for(const alias of ['factoidal-old','factoidal-new']){
  const version=JSON.parse(fs.readFileSync(path.join(packages,alias,'package.json'))).version;
  const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();
  page.on('pageerror',e=>result.errors.push(String(e)));
  const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await page.goto(origin);
  const boot=await page.evaluate(async ({origin,alias})=>{const t=performance.now();const {loadL4}=await import(`${origin}/package/${alias}/l4-assets/l4factoidal.js`);window.engine=await loadL4();return performance.now()-t;},{origin,alias});
  for(const store of ['mixed','geometry']){
   const setup=await page.evaluate(async({origin,store})=>{const t=performance.now();window.storeBase=`${origin}/store/${store}`;window.generation=(await(await fetch(`${storeBase}/CURRENT`)).text()).trim();const manifest=new Uint8Array(await(await fetch(`${storeBase}/${generation}/manifest.sbm2`)).arrayBuffer());window.manifestHex=Array.from(manifest,b=>b.toString(16).padStart(2,'0')).join('');window.inspect=engine.call('storeManifestInspect',[manifestHex]);if(inspect.ok===false)throw Error(JSON.stringify(inspect));return{generation,manifestBytes:manifest.length,setupMs:performance.now()-t};},{origin,store});
   for(const query of queries)for(const indexed of [false,true]){
    const row=await page.evaluate(async({query,indexed})=>{
     const t0=performance.now();const plan=engine.call('storeQueryPlan',[manifestHex,query.sparql]);if(plan.ok===false)throw Error(JSON.stringify(plan));const planMs=performance.now()-t0;
     const sidecars=indexed?plan.keys.flatMap(k=>{const e=inspect.entries.find(e=>e.key===k);return e?.predicate==='http://www.opengis.net/ont/geosparql#asWKT'?Object.values(e.sidecars||{}).filter(k=>k.endsWith('.gbi1')):[];}):[];
     const keys=[...new Set([...plan.keys,...(plan.blobKeys||[]),...sidecars])];
     const chunks=[];const t1=performance.now();for(let i=0;i<keys.length;i+=6){const group=await Promise.all(keys.slice(i,i+6).map(async key=>new Uint8Array(await(await fetch(`${storeBase}/${generation}/${key}`)).arrayBuffer())));chunks.push(...group);}
     const bytes=chunks.reduce((n,b)=>n+b.length,0),blob=new Uint8Array(bytes);let offset=0;const artifacts=keys.map((key,i)=>{const a={key,offset,len:chunks[i].length};blob.set(chunks[i],offset);offset+=a.len;return a;});const fetchMs=performance.now()-t1;
     const t2=performance.now();const envelope=engine.callBlobIO('storeOpen',[manifestHex,JSON.stringify(artifacts)],blob).envelope;const openMs=performance.now()-t2;if(envelope.ok===false)throw Error(JSON.stringify(envelope));
     const times=[];let r;
     try{for(let i=0;i<2;i++){const t=performance.now();r=engine.call('storeHandleQuery',[envelope.handle,query.sparql]);times.push(performance.now()-t);if(r.ok===false)throw Error(JSON.stringify(r));}}finally{engine.call('storeHandleClose',[envelope.handle]);}
     if(envelope.geoIndexes!==sidecars.length)throw Error('Index count mismatch');const bindings=r.srj.results.bindings.map(b=>JSON.stringify(b)).sort();return{planMs,fetchMs,openMs,firstMs:times[0],repeatMs:times[1],totalFirstMs:planMs+fetchMs+openMs+times[0],blocks:plan.keys.length,bytes,indexes:envelope.geoIndexes,rows:bindings.length,bindings};
    },{query,indexed});
    const bindings=row.bindings;delete row.bindings;
    const entry={version,store,name:query.name,indexed,bootMs:boot,...setup,...row,hash:createHash('sha256').update(bindings.join('\n')).digest('hex')};
    result.results.push(entry);fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(entry));
   }
  }
  await context.close();
 }
 for(const query of queries){const cases=result.results.filter(r=>r.name===query.name);if(new Set(cases.map(r=>r.hash)).size!==1)throw Error('Result mismatch '+query.name);if(query.name==='intersects-miss'&&cases.some(r=>r.rows!==0))throw Error('Expected empty miss');}
 if(result.errors.length)throw Error(JSON.stringify(result.errors));
 result.validation={complete:true,hashesMatch:true,decodedIndexCountsChecked:true,missEmpty:true,pageErrors:0};
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log('PASS browser hash/index/empty-result checks');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
