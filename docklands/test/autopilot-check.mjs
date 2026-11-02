// Browser integration check for developers/CI. This script opens one local Chromium context.
// Agents using a CUA-only session must not run it through a shell; use the approved browser interface.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { LONDON_AUTOPILOT_JOURNEY as journey } from './fixtures/london-autopilot.mjs';
const root=fileURLToPath(new URL('../..',import.meta.url));
const out=root+'/docklands/test/out/autopilot';await mkdir(out,{recursive:true});
const server=spawn('python3',['-m','http.server','8772','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser;
try {
  for(let n=0;n<30;n++){try{if((await fetch('http://127.0.0.1:8772/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:process.platform==='darwin'?{channel:'chrome'}:{}),headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
  await context.addInitScript(()=>{window.mcTools=new Map();document.modelContext={registerTool(t){mcTools.set(t.name,t);}};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8772/docklands/?webgl&vz=1&style=vectrex&weather=0&t=2026-11-01T13:00Z');
  await page.waitForFunction(()=>window.docklands&&window.__docklands3?.ready,null,{timeout:180000});
  const start=await page.evaluate(async fixture=>{
    const {ukAdapter}=await import('/docklands/adapters/uk.js'),H=__docklands3,ad=ukAdapter(H.ctx.A);
    const [x,z]=ad.fromLonLat(fixture.start.lon,fixture.start.lat);
    H.setCam({tx:x+80,ty:fixture.start.height_m,tz:z,dist:80,yaw:-Math.PI/2,pitch:0,hfov:null,fov:.8,roll:0});
    const r=await mcTools.get('start_autopilot').execute({destination:fixture.destination,via:fixture.via,config:fixture.config});
    if(r.isError)throw Error(r.content[0].text);
    return {version:docklands.version,result:r.structuredContent,eye:docklands.getView().eye};
  },journey);
  assert.equal(start.version,'1.9.0');
  await page.waitForFunction(()=>docklands.getAutopilot().elapsed_s>.1,null,{timeout:10000});
  const middle=await page.evaluate(async()=>{
    const call=async(name,args={})=>{const r=await mcTools.get(name).execute(args);if(r.isError)throw Error(r.content[0].text);return r.structuredContent;};
    const before=await call('get_autopilot');
    await call('nudge_autopilot',{acceleration:[.5,0,0],duration_s:1,frame:'body'});
    const gaze=await call('gaze_autopilot',{point:{lon:-.0761,lat:51.5081,height_m:30},hold_s:2});
    const paused=await call('control_autopilot',{action:'pause'});
    return {before,gaze,paused};
  });
  assert.ok(middle.before.elapsed_s>0);assert.equal(middle.paused.status,'paused');
  assert.equal(middle.gaze.gaze_mode,'explicit');
  const frozen=await page.evaluate(()=>docklands.getAutopilot());
  await page.waitForTimeout(100);assert.deepEqual((await page.evaluate(()=>docklands.getAutopilot())).position,frozen.position);
  await page.evaluate(()=>docklands.controlAutopilot({action:'resume'}));
  await page.waitForFunction(t=>docklands.getAutopilot().elapsed_s>t+.1,middle.before.elapsed_s,{timeout:10000});
  const stopped=await page.evaluate(()=>docklands.controlAutopilot({action:'stop'}));assert.equal(stopped.status,'stopped');
  assert.deepEqual(errors,[]);await page.screenshot({path:out+'/london-autopilot-smoke.png'});
  await writeFile(out+'/results.json',JSON.stringify({start,middle,stopped,errors},null,2));
  console.log('PASS: London fixture, WebMCP start/read/nudge/gaze/pause/resume/stop, no page errors. Full route completion is covered by the numerical journey test.');
} finally {await browser?.close();server.kill();}
