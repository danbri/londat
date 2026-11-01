// One Chrome context; verifies exact played city segments, failed connectors, speed/range guards and source metadata.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, statfs } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../..',import.meta.url)),out=root+'/docklands/test/out/city-sweep';await mkdir(out,{recursive:true});
const free=await statfs(root);if(free.bavail*free.bsize<500*1024*1024)throw Error('Not enough free disk for a browser test');
const server=spawn('python3',['-m','http.server','8771','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
for(let n=0;n<30;n++){try{if((await fetch('http://127.0.0.1:8771/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:process.platform==='darwin'?{channel:'chrome'}:{}),headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8771/docklands/?webgl&style=vectrex&layers=keys,placenames&weather=0&animate=0&t=2026-11-01T13:00Z');
 await page.waitForFunction(()=>window.docklands&&window.__docklands3?.ready,null,{timeout:240000});
 const result=await page.evaluate(async()=>{
  const {createModelCityRouter}=await import('/docklands/city-route-model.js'),{sampleCityRoute}=await import('/docklands/city-route.js'),{eyeOf}=await import('/docklands/camera-sweep.js'),{ukAdapter}=await import('/docklands/adapters/uk.js');
  const H=__docklands3,ad=ukAdapter(H.ctx.A),start=[-188.1,17.7,-70.5],requestedEnd=[-301.5,10.3,435.4],target=[start[0]+50,start[1]+60,start[2]];
  const setEye=(eye,look=target)=>{const dx=eye[0]-look[0],dy=(eye[1]-look[1])*H.ctx.vzNow(),dz=eye[2]-look[2];H.setCam({tx:look[0],ty:look[1],tz:look[2],dist:Math.hypot(dx,dy,dz),yaw:Math.atan2(dx,dz),pitch:Math.atan2(dy,Math.hypot(dx,dz)),hfov:null,fov:.8,roll:0});};
  setEye(start);const [lon,lat]=ad.toLonLat(requestedEnd[0],requestedEnd[2]),request={lon,lat,routing_policy:'city'};
  const router=createModelCityRouter(H.ctx.A,{height_m:8,clearance_m:2});
  const initial=H.camState(),plan=await docklands.planSweep(request),unmoved=H.camState();
  const failed={};
  for(const [name,args]of Object.entries({tooFast:{...request,duration_s:1},lift:{...request,lift_m:1},curved:{...request,trajectory:'curved'},hugeGaze:{...request,look_at:[{lon,lat,height_m:1e308,at_s:5}]},rangeGaze:{...request,look_at:[{lon:lon+.03,lat,height_m:50000,at_s:5}]}})){
   try{await docklands.planSweep(args);failed[name]='not rejected';}catch(e){failed[name]=e.message;}
  }
  await docklands.goTo({view:'cw'});try{await docklands.planSweep(request);failed.highStart='not rejected';}catch(e){failed.highStart=e.message;}
  setEye(start);
  // A named-view request refers to that camera eye, not its distant look target.
  const look=[requestedEnd[0]+150,requestedEnd[1]+50,requestedEnd[2]],dx=requestedEnd[0]-look[0],dy=requestedEnd[1]-look[1];
  H.VIEWS['city-fixture']={tx:look[0],ty:look[1],tz:look[2],dist:Math.hypot(dx,dy),yaw:-Math.PI/2,pitch:Math.atan2(dy,Math.abs(dx)),hfov:null,fov:.8,roll:0};
  let named;try{named=await docklands.planSweep({view:'city-fixture',routing_policy:'city'});}finally{delete H.VIEWS['city-fixture'];}
  H.setVz(3);setEye(start);const playable=await docklands.planSweep(request);await docklands.startSweep({plan_id:playable.id});
  let playing;for(let n=0;n<600;n++){playing=docklands.getSweep();if(playing.progress>.025)break;await new Promise(r=>setTimeout(r,100));}
  const eye=eyeOf(H.camState(),H.vz),playedCamera=H.camState(),stopped=docklands.stopSweep();
  const pointClear=router.segmentClear(eye,eye);
  // Camera-control changes cannot silently clamp the played eye off its certified route.
  setEye(start);const limitsPlan=await docklands.planSweep(request),max=H.ctx.controls.maxDistance;H.ctx.controls.maxDistance=20;
  try{await docklands.startSweep({plan_id:limitsPlan.id});failed.changedLimits='not rejected';}catch(e){failed.changedLimits=e.message;}finally{H.ctx.controls.maxDistance=max;}
  H.setCam(playedCamera);
  return {version:docklands.version,initial,unmoved,plan,failed,named,playing,stopped,eye,pointClear,verticalScale:H.vz,expectedNamed:{lon,lat}};
 });
 assert.equal(result.version,'1.8.1');assert.deepEqual(result.initial,result.unmoved);assert.equal(result.plan.trajectory,'polyline');assert.equal(result.plan.collision_checked,true);assert.equal(result.plan.collision_scope,'static-model-building-prisms-and-model-bounds');
 assert.ok(result.plan.route_points>16);assert.ok(result.plan.speed.peak_m_s<=20);assert.ok(result.plan.duration_s>120);assert.equal(result.plan.attention.method,'road-lookahead-up');assert.ok(result.plan.model_source.credits.some(s=>/OpenStreetMap/.test(s.text)));
 for(const [name,error]of Object.entries(result.failed))assert.notEqual(error,'not rejected',name);
 assert.equal(result.named.destination_requested.kind,'named-view-eye');assert.ok(Math.abs(result.named.destination_requested.lon-result.expectedNamed.lon)<1e-6);assert.ok(Math.abs(result.named.destination_requested.lat-result.expectedNamed.lat)<1e-6);
 assert.ok(result.playing.progress>0&&result.playing.progress<1);assert.equal(result.stopped.status,'stopped');assert.equal(result.pointClear,true);assert.equal(result.verticalScale,3);assert.deepEqual(errors,[]);
 await page.evaluate(async()=>{__docklands3.frameNow();await new Promise(requestAnimationFrame);__docklands3.frameNow();});
 await page.screenshot({path:out+'/city-road-upward.png'});
 await page.evaluate(async()=>{const H=__docklands3;await docklands.goTo({view:'cw'});});
 await writeFile(out+'/city-sweep-results.json',JSON.stringify({result,errors},null,2));
 console.log('PASS city polyline playback, source credits, gaze, exact eye clearance, speed/connectors/numeric/control guards, named-view-eye destination; no page errors');
}finally{await browser.close();server.kill();}
