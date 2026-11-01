// Browser integration check; starts a local server, uses CHROME_PATH when set.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../..',import.meta.url));
const out=root+'/docklands/test/out/sweep'; await mkdir(out,{recursive:true});
const server=spawn('python3',['-m','http.server','8769','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
for(let n=0;n<30;n++){try{if((await fetch('http://127.0.0.1:8769/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch({...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : process.platform==='darwin' ? {channel:'chrome'} : {}),headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
 await context.addInitScript(()=>{window.mcTools=new Map();document.modelContext={registerTool(t){mcTools.set(t.name,t);}};});
 const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8769/docklands/?webgl&style=vectrex&layers=keys,registry,placenames&mem=full&t=2026-11-01T13:00Z');
 await page.waitForFunction(()=>window.docklands&&window.__docklands3?.ready,null,{timeout:180000});
 const result=await page.evaluate(async()=>{
  const call=async(n,a={})=>{const r=await mcTools.get(n).execute(a);if(r.isError)throw Error(r.content[0].text);return r.structuredContent;};
  const start=__docklands3.camState(),time=docklands.getView().time.iso;
  const plan=await call('plan_sweep',{view:'rotherhithe',steps:10,duration_s:2});
  const unmoved=__docklands3.camState();
  const begin=await call('start_sweep',{plan_id:plan.id});
  await new Promise(r=>setTimeout(r,700));const middle=await call('get_sweep');
  await new Promise(r=>setTimeout(r,2000));const finish=await call('get_sweep'),end=__docklands3.camState();
  await call('start_sweep',{view:'cw',duration_s:10});
  const stop=await call('stop_sweep');const stopped=__docklands3.camState();
  await new Promise(r=>setTimeout(r,300));const still=__docklands3.camState();
  const bad=await mcTools.get('start_sweep').execute({view:'cw',duration_s:0});
  return {version:docklands.version,tools:mcTools.size,start,unmoved,plan,begin,middle,finish,end,expected:__docklands3.VIEWS.rotherhithe,time,timeAfter:docklands.getView().time.iso,stop,stopped,still,bad};
 });
 assert.equal(result.version,'1.5.0');assert.equal(result.tools,18);assert.deepEqual(result.start,result.unmoved);
 assert.equal(result.plan.waypoints.length,11);assert.equal(result.begin.status,'playing');
 assert.ok(result.middle.progress>0&&result.middle.progress<1);assert.equal(result.finish.status,'completed');
 for(const k of ['tx','ty','tz','dist','pitch'])assert.ok(Math.abs(result.end[k]-result.expected[k])<.1,k);
 assert.equal(result.time,result.timeAfter);assert.equal(result.stop.status,'stopped');assert.deepEqual(result.stopped,result.still);assert.equal(result.bad.isError,true);assert.deepEqual(errors,[]);
 await page.evaluate(()=>docklands.startSweep({view:'cw',duration_s:10}));
 await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>docklands.getSweep().status),'interrupted');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>docklands.startSweep({view:'cw',duration_s:10}));
 await page.waitForFunction(()=>docklands.getSweep().status==='completed',null,{timeout:2000});
 await page.emulateMedia({reducedMotion:'no-preference'});
 const stale=await page.evaluate(async()=>{const p=await docklands.planSweep({view:'rotherhithe'});await docklands.goTo({view:'limehouse'});try{await docklands.startSweep({plan_id:p.id});return false;}catch(e){return /camera moved/i.test(e.message);}});
 assert.equal(stale,true);
 await page.evaluate(()=>docklands.goTo({view:'cw'}));
 await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('tab',{name:'Views',exact:true}).click();
 await page.getByRole('button',{name:'Show course',exact:true}).click();await page.screenshot({path:out+'/sweep-preview.png'});
 assert.match(await page.locator('#sweepStatus').innerText(),/10 course segments/);
 await writeFile(out+'/sweep-results.json',JSON.stringify({result,errors},null,2));console.log('PASS: WebMCP plan, continuous playback, endpoint, preserved clock, stop, invalid inputs, accessible UI; no page errors');
}finally{await browser.close();server.kill();}
