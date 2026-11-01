import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {createAutopilot} from '../camera-autopilot.js';
const norm=a=>Math.hypot(...a),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const setup=extra=>createAutopilot({position:[0,10,0],target:[0,10,-80],route:[{point:[100,10,0],name:'first'},{point:[100,10,100],name:'last'}],...extra});
const advance=(p,seconds)=>{let s;for(let i=0;i<seconds*60;i++)s=p.step(1/60);return s;};
test('required waypoints are visited in order and final approach brakes without nominal overshoot',()=>{
 const p=setup();let previous=p.state(),maxX=0,maxZ=0;
 for(let i=0;i<120*60;i++){
  const s=p.step(1/60);maxX=Math.max(maxX,s.position[0]);maxZ=Math.max(maxZ,s.position[2]);
  assert.ok(norm(s.velocity)<=15+1e-9);assert.ok(norm(s.acceleration)<=4+1e-9);
  if(s.status==='playing')assert.ok(norm(sub(s.acceleration,previous.acceleration))<=8/60+1e-8);
  previous=s;if(s.status==='arrived')break;
 }
 assert.equal(previous.status,'arrived');assert.deepEqual(previous.visited.map(v=>v.name),['first','last']);assert.ok(maxX<=100);assert.ok(maxZ<=100);assert.ok(previous.visited.every(v=>v.distance_m<=2));
});
test('a timed body-relative nudge expires and gaze can look away without changing motion',()=>{
 const p=setup(),control=setup();advance(p,1);advance(control,1);
 p.lookAt({point:[-100,80,0],hold_s:2});
 for(let i=0;i<60;i++){const a=p.step(1/60),b=control.step(1/60);assert.deepEqual(a.position,b.position);}
 assert.notDeepEqual(p.state().target,control.state().target);
 p.nudge({acceleration:[0,1,0],duration_s:.5,frame:'body'});advance(p,.25);assert.equal(p.state().active_nudges,1);advance(p,.5);assert.equal(p.state().active_nudges,0);assert.ok(p.state().position[1]>10);
 advance(p,1);assert.notEqual(p.state().gaze_mode,'explicit');
});
test('mass changes autopilot response while pause and long frame gaps preserve position',()=>{
 const light=setup(),heavy=setup({config:{mass_kg:10}});advance(light,2);advance(heavy,2);assert.ok(light.state().position[0]>heavy.state().position[0]);
 light.nudge({acceleration:[1,0,0]});const before=light.state();const gap=light.step(30);assert.equal(gap.status,'paused');assert.equal(gap.reason,'frame-gap');assert.deepEqual(gap.position,before.position);assert.equal(gap.active_nudges,0);
 advance(light,5);assert.deepEqual(light.state().position,before.position);light.resume();advance(light,1);assert.notDeepEqual(light.state().position,before.position);
});
test('brake decelerates, stop is terminal, and rejected segments cannot move camera',()=>{
 const p=setup({config:{wind_acceleration:[.2,0,0]}});advance(p,3);p.brake();let s=advance(p,20);assert.equal(s.status,'paused');assert.equal(s.reason,'braked');assert.equal(norm(s.velocity),0);p.resume();p.stop();s=advance(p,2);assert.equal(s.status,'stopped');assert.throws(()=>p.resume());
 const blocked=setup({segmentClear:(a,b)=>b[0]<1});s=advance(blocked,10);assert.equal(s.status,'blocked');assert.ok(s.position[0]<1);assert.equal(s.collision_checked,false);assert.equal(s.motion_gate_enabled,true);
});
test('invalid config, commands and vectors reject transactionally, state is detached',()=>{
 const p=setup(),original=p.state();
 for(const patch of [{unknown:1},{toString:2},{constructor:2},{speed_m_s:Infinity},{mass_kg:0},{wind_acceleration:[3,0,0]}])assert.throws(()=>p.configure(patch));
 for(const args of [{acceleration:[5,0,0]},{acceleration:[0,1,0],duration_s:6},{acceleration:[0,1,0],frame:'camera'}])assert.throws(()=>p.nudge(args));
 assert.throws(()=>p.lookAt({point:[NaN,0,0]}));assert.throws(()=>p.step(Infinity));assert.deepEqual(p.state(),original);
 const copy=p.state();copy.position[0]=100;copy.config.wind_acceleration[0]=100;assert.deepEqual(p.state(),original);
});
test('opposite gaze directions remain finite and turn rate is bounded',()=>{
 const p=setup();p.lookAt({point:[0,10,80],hold_s:5});let previous=p.state();
 for(let i=0;i<120;i++){const s=p.step(1/60),a=sub(previous.target,previous.position),b=sub(s.target,s.position),angle=Math.acos(Math.max(-1,Math.min(1,a.reduce((n,v,k)=>n+v*b[k],0)/(norm(a)*norm(b)))));assert.ok(angle<=45*Math.PI/180/60+1e-7);assert.ok(s.target.every(Number.isFinite));previous=s;}
});

test('rerouting preserves momentum and gaze, validates before changing route',()=>{
 const p=setup();advance(p,3);p.lookAt({point:[-100,80,0],hold_s:5});const before=p.state();
 assert.throws(()=>p.setRoute({route:[{point:[NaN,0,0]}]}));assert.deepEqual(p.state(),before);
 p.setRoute({route:[{point:[-50,10,0],name:'new destination'}]});const after=p.state();
 for(const key of ['position','velocity','acceleration','target','elapsed_s','gaze_mode'])assert.deepEqual(after[key],before[key]);
 assert.equal(after.next_waypoint,'new destination');assert.equal(after.waypoint_index,0);assert.deepEqual(after.visited,[]);
});

test('ordinary render stalls discard catch-up time without pausing; long suspension pauses',()=>{
 const stalled=setup(),reference=setup();advance(stalled,2);advance(reference,2);
 const before=stalled.state(),after=stalled.step(.75),expected=reference.step(.25);
 assert.equal(after.status,'playing');assert.equal(after.reason,null);assert.deepEqual(after.position,expected.position);assert.deepEqual(after.velocity,expected.velocity);
 assert.ok(Math.abs(after.elapsed_s-before.elapsed_s-.25)<1e-10);assert.ok(Math.abs(after.discarded_time_s-.5)<1e-10);assert.ok(norm(sub(after.position,before.position))<=15*.25);
 stalled.nudge({acceleration:[0,1,0],duration_s:1});const active=stalled.state(),suspended=stalled.step(5);
 assert.equal(suspended.status,'paused');assert.equal(suspended.reason,'frame-gap');assert.deepEqual(suspended.position,active.position);assert.equal(suspended.active_nudges,0);
});

// Execute the actual page scheduling function with a controlled frame clock.
// Pure dynamics tests alone cannot catch an invalid dt supplied by the browser adapter.
test('page start and resume seed time from the first animation frame',()=>{
 const source=readFileSync(new URL('../api.js',import.meta.url),'utf8');
 const begin=source.indexOf('  function runAutopilot() {'),end=source.indexOf('  async function startAutopilot(');
 assert.ok(begin>=0&&end>begin);
 const p=setup(),queue=[],errors=[],drawn=[];
 const scope={performance:{now:()=>1003.5},requireAutopilotCamera(){},
  H:{vz:1,nav:{stop(){}},setViewName(){},setCam:s=>drawn.push(s)},
  camera:{aspect:1,fov:45},D:Math.PI/180,controlSnapshot:()=>[],
  autopilotEpoch:0,autopilotControls:null,controls:{enabled:true},autopilotMeta:{},autopilot:p,
  adapter:{inBox:()=>true},autopilotCamera:s=>s,flightActive:s=>s==='playing'||s==='braking',
  requestAnimationFrame:fn=>(queue.push(fn),queue.length),releaseAutopilotControls(){},
  autopilotNotice(){},autopilotText:()=>'',stopAutopilot:e=>errors.push(e)};
 const run=runInNewContext(source.slice(begin,end)+'\nrunAutopilot;',scope);
 const frame=t=>{assert.ok(queue.length,'a frame must remain scheduled');queue.shift()(t);};
 run();frame(1000); // frame timestamp can precede the performance.now() at start
 assert.deepEqual(errors,[]);assert.equal(p.state().elapsed_s,0);
 frame(1016);assert.ok(p.state().elapsed_s>0);assert.ok(p.state().position[0]>0);
 const beforeDuplicate=p.state();frame(1016);assert.deepEqual(p.state(),beforeDuplicate);
 p.pause();const beforeResume=p.state();queue.length=0;scope.performance.now=()=>100000;
 p.resume();run();frame(99990); // resume must not integrate the time spent paused
 assert.deepEqual(errors,[]);assert.deepEqual(p.state().position,beforeResume.position);
 assert.deepEqual(p.state().velocity,beforeResume.velocity);assert.equal(p.state().elapsed_s,beforeResume.elapsed_s);
 frame(100006);assert.ok(p.state().elapsed_s>beforeResume.elapsed_s);
 const beforeGap=p.state();frame(106006);assert.equal(p.state().status,'paused');
 assert.equal(p.state().reason,'frame-gap');assert.deepEqual(p.state().position,beforeGap.position);
 assert.deepEqual(errors,[]);assert.ok(drawn.length>=5);
});
