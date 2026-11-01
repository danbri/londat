// Browser comparison: npm install --prefix /tmp/kg-bench factoidal-old@npm:@factoidal/core@0.15.0 factoidal-new@npm:@factoidal/core@0.28.0
// node tools/benchmark-kg.mjs --packages /tmp/kg-bench/node_modules
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const i=process.argv.indexOf('--packages');
if(i<0) throw Error('Pass --packages DIR containing factoidal-old and factoidal-new npm aliases');
const packages=path.resolve(process.argv[i+1]);
const out=root+'/docklands/test/out/kg-bench';await mkdir(out,{recursive:true});
const results=[];
const server=spawn('python3',['-m','http.server','8768','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
for(let n=0;n<30;n++) { try {if((await fetch('http://127.0.0.1:8768/')).ok) break;} catch {} await new Promise(r=>setTimeout(r,100)); }
const browser=await chromium.launch({...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : process.platform==='darwin' ? {channel:'chrome'} : {}),headless:true});
try {
 for(const version of ['0.15.0','0.28.0']) for(let trial=0;trial<3;trial++) {
  const context=await browser.newContext({serviceWorkers:'block'});
  const pkg=path.join(packages,version==='0.15.0'?'factoidal-old':'factoidal-new');
  await context.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/@factoidal\/core@[^/]+\//,async route=>{
   const rel=new URL(route.request().url()).pathname.replace(/^.*?\/core@[^/]+\//,'');
   try {await route.fulfill({body:await readFile(path.join(pkg,rel)),contentType:rel.endsWith('.wasm')?'application/wasm':'text/javascript'});} catch(e){await route.abort();}
  });
  await context.route('**/cwplans/kg/worker.js',async route=>route.fulfill({body:(await readFile(root+'/cwplans/kg/worker.js','utf8')).replace(/core@\d+\.\d+\.\d+\//,'core@'+version+'/').replace(/const PACKAGE_VERSION = '[^']+';/,`const PACKAGE_VERSION = '${version}';`),contentType:'text/javascript'}));
  const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const start=Date.now();await page.goto('http://127.0.0.1:8768/cwplans/kg/#tall');
  await page.waitForFunction(()=>/rows/.test(document.getElementById('outNote').textContent),{},{timeout:120000});
  const boot=Date.now()-start; await page.locator('summary').filter({hasText:'SPARQL'}).click();
  for(const name of ['tall','graphs','stepfree','occupants']) {
   if(name!=='tall') {await page.locator('[data-v="'+name+'"]').click(); await page.waitForFunction(()=>/rows|No rows/.test(document.getElementById('outNote').textContent),{},{timeout:120000});}
   const cold=await page.locator('#outNote').innerText();
   await page.getByRole('button',{name:'Run query',exact:true}).click();
   await page.waitForFunction(()=>/rows|No rows/.test(document.getElementById('outNote').textContent),{},{timeout:120000});
   const warm=await page.locator('#outNote').innerText();
   const rows=await page.locator('#outBody').innerText();
   results.push({version,trial,name,browser:browser.version(),boot_ms:boot,cold,warm,row_sha256:createHash('sha256').update(rows).digest('hex'),errors});
   console.log(JSON.stringify({version,trial,name,cold,warm}));
   await writeFile(out+'/results.json',JSON.stringify(results,null,2));
  }
  await context.close();
 }
} finally {await browser.close();server.kill();}
