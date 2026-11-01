import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutopilot } from '../camera-autopilot.js';
import { ukAdapter } from '../adapters/uk.js';
import { LONDON_AUTOPILOT_JOURNEY as journey } from './fixtures/london-autopilot.mjs';
// Use the model's existing WGS84 transform, without loading a second model copy.
import '../../cwplans/docklands/data/area.js';
const adapter = ukAdapter(globalThis.DOCKLANDS_AREA);
const point = p => { const [x,z] = adapter.fromLonLat(p.lon,p.lat); return [x,p.height_m,z]; };
const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
const make = () => createAutopilot({ position:point(journey.start),
  target:point(journey.via[0].gaze), config:journey.config,
  route:[...journey.via,{...journey.destination,name:'Canary Wharf arrival'}]
    .map(p=>({point:point(p),name:p.name,gaze:p.gaze?point(p.gaze):undefined})) });

test('London Bridge journey reaches Belfast, Tower and Canary Wharf in order with bounded dynamics',()=>{
  const flight=make(); let state=flight.state(),peakSpeed=0,peakAcceleration=0,peakJerk=0,previousAcceleration=state.acceleration;
  let nudged=false,looked=false,released=false;
  const dt=1/60;
  for(let frame=0;frame<60*1800 && state.status==='playing';frame++){
    if(!nudged&&state.elapsed_s>=8){flight.nudge({acceleration:[.7,0,.4],duration_s:2,frame:'body'});nudged=true;}
    if(!looked&&state.elapsed_s>=12){flight.lookAt({point:point(journey.via[1].gaze),hold_s:3});looked=true;}
    state=flight.step(dt);
    if(looked&&state.elapsed_s>16){assert.notEqual(state.gaze_mode,'explicit');released=true;}
    peakSpeed=Math.max(peakSpeed,Math.hypot(...state.velocity));
    peakAcceleration=Math.max(peakAcceleration,Math.hypot(...state.acceleration));
    // Arriving deliberately clears acceleration; constrain the active integration only.
    if(state.status==='playing')peakJerk=Math.max(peakJerk,distance(state.acceleration,previousAcceleration)/dt);
    previousAcceleration=state.acceleration;
    assert.ok([...state.position,...state.target,...state.velocity].every(Number.isFinite));
  }
  assert.equal(state.status,'arrived');
  assert.deepEqual(state.visited.map(v=>v.name),['HMS Belfast flyby','Tower of London flyby','Wapping reach','Limehouse reach','Canary Wharf arrival']);
  assert.ok(state.visited.every(v=>v.distance_m<=journey.config.arrival_radius_m));
  assert.ok(distance(state.position,point(journey.destination))<=journey.config.arrival_radius_m);
  assert.ok(peakSpeed<=journey.config.speed_m_s+1e-8);
  assert.ok(peakAcceleration<=journey.config.max_acceleration_m_s2+1e-8);
  assert.ok(peakJerk<=journey.config.max_jerk_m_s3+1e-5);
  assert.equal(state.active_nudges,0); assert.ok(nudged&&looked&&released);
  assert.equal(state.collision_checked,false);
});

test('independent gaze changes view without changing the London journey motion',()=>{
  const baseline=make(),directed=make();
  directed.lookAt({point:point(journey.via[1].gaze),hold_s:5});
  let a,b;
  for(let i=0;i<120;i++){a=baseline.step(1/60);b=directed.step(1/60);assert.deepEqual(a.position,b.position);assert.deepEqual(a.velocity,b.velocity);}
  assert.ok(distance(a.target,b.target)>10);
});
