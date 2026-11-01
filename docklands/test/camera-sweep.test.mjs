import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSweep, eyeOf } from '../camera-sweep.js';
const a = { tx: -3000, ty: 10, tz: 0, yaw: 179 * Math.PI / 180, pitch: .5, dist: 800 };
const b = { tx: 500, ty: -15, tz: 1000, yaw: -179 * Math.PI / 180, pitch: -.02, dist: 1200, hfov: .8, roll: 2 };
test('course preserves exact endpoints, including a photo lens and negative pitch', () => {
 const p = makeSweep(a, b);
 for (const k of ['tx','ty','tz','yaw','pitch','dist']) { assert.equal(p.sample(0)[k],a[k]); assert.equal(p.sample(1)[k],b[k]); }
 assert.equal(p.sample(1).hfov,b.hfov); assert.equal(p.waypoints.length,11);
 assert.deepEqual(p.waypoints.at(-1).camera,p.sample(1));
});
test('heading crosses the short arc and frames remain finite through a lifted course', () => {
 const p=makeSweep(a,b,{lift_m:200});
 assert.ok(Math.abs(p.sample(.5).yaw-Math.PI)<1e-9);
 assert.ok(p.sample(.5).ty>190);
 for(let n=0;n<=1000;n++) assert.ok(eyeOf(p.sample(n/1000)).every(Number.isFinite));
});
test('reject invalid time, segment count, lift and camera states', () => {
 for(const o of [{duration_s:0},{duration_s:Infinity},{steps:1},{steps:2.1},{lift_m:-1}]) assert.throws(()=>makeSweep(a,b,o));
 assert.throws(()=>makeSweep({...a,dist:0},b));
});

const c0 = { tx: 0, ty: 30, tz: 0, dist: 200, yaw: 0, pitch: .1 };
const c1 = { tx: 400, ty: 80, tz: 0, dist: 200, yaw: Math.PI / 2, pitch: -.2 };
test('curved eye course preserves endpoints while a gaze fixation holds independently', () => {
 const focus = [200, 120, -100];
 const p = makeSweep(c0, c1, { trajectory: 'curved', lift_m: 40, bend_m: 50, duration_s: 12, look_at: [{ at_s: 4, hold_s: 3, point: focus }] });
 assert.deepEqual(eyeOf(p.sample(0)),eyeOf(c0)); assert.deepEqual(eyeOf(p.sample(1)),eyeOf(c1));
 for(const t of [4,5,6,7]) { const c=p.sample(t/12);assert.deepEqual([c.tx,c.ty,c.tz],focus); }
 assert.ok(Math.hypot(...eyeOf(p.sample(7/12)).map((v,i)=>v-eyeOf(p.sample(4/12))[i]))>40);
 assert.ok(p.length_m>Math.hypot(...eyeOf(c1).map((v,i)=>v-eyeOf(c0)[i])));
 const before=p.sample(4/12-1e-7),after=p.sample(4/12+1e-7);
 assert.ok(Math.hypot(before.tx-after.tx,before.ty-after.ty,before.tz-after.tz)<1e-6);
});
test('explicit via points are visited and arc distance advances smoothly', () => {
 const via = [250,180,250];
 const p=makeSweep(c0,c1,{trajectory:'curved',lift_m:0,eye_via:[via]});
 let closest=Infinity;
 for(let i=0;i<=5000;i++)closest=Math.min(closest,Math.hypot(...eyeOf(p.sample(i/5000)).map((v,j)=>v-via[j])));
 assert.ok(closest<.2,`via miss ${closest}`);
 const first=eyeOf(p.sample(.001)),next=eyeOf(p.sample(.01)),origin=eyeOf(c0);
 assert.ok(Math.hypot(...first.map((v,j)=>v-origin[j]))<Math.hypot(...next.map((v,j)=>v-origin[j]))/100);
 assert.deepEqual(p.sample(.4),p.sample(.4));
 assert.throws(()=>makeSweep(c0,c1,{trajectory:'curved',eye_via:[via]}),/lift_m and bend_m zero/);
});
test('curved routes reconstruct true eye positions under vertical exaggeration', () => {
 const target=[150,200,-100], p=makeSweep(c0,c1,{trajectory:'curved',verticalScale:3,lift_m:0,look_at:[{at_s:4,hold_s:3,point:target}]});
 const c=p.sample(.5),e=eyeOf(c,3);
 assert.deepEqual([c.tx,c.ty,c.tz],target);
 assert.ok(e.every(Number.isFinite));
 const off=c.dist*Math.sin(c.pitch);
 assert.ok(Math.abs(e[1]-(c.ty+off/3))<1e-9);
 assert.deepEqual(eyeOf(p.sample(0),3),eyeOf(c0,3));
});
test('stationary eye flights are valid and malformed or singular focus paths reject before playback', () => {
 const stationary=makeSweep(c0,c0,{trajectory:'curved',lift_m:0});
 assert.ok(stationary.length_m<1e-9);assert.deepEqual(eyeOf(stationary.sample(.5)),eyeOf(c0));
 for(const opts of [{trajectory:'nope'},{trajectory:'curved',look_at:[{point:[0,0,0],at_s:4,hold_s:10}]},{trajectory:'curved',eye_via:[[0,NaN,0]]},{trajectory:'curved',bend_m:Infinity},{trajectory:'curved',verticalScale:0}]) assert.throws(()=>makeSweep(c0,c1,opts));
 assert.throws(()=>makeSweep(c0,c1,{trajectory:'curved',lift_m:0,look_at:[{point:eyeOf(c0),at_s:.001,hold_s:3}]}),/within 10 metres/);
 assert.throws(()=>stationary.sample(NaN),/finite/);
});

test('curved gaze rejects a view that OrbitControls would silently clamp overhead', () => {
 const baseline=makeSweep(c0,c1,{trajectory:'curved',lift_m:0});const eye=eyeOf(baseline.sample(.5));
 assert.throws(()=>makeSweep(c0,c1,{trajectory:'curved',lift_m:0,look_at:[{point:[eye[0],eye[1]+100,eye[2]],at_s:5,hold_s:2}]}),/look-up limit/);
});
test('the same physical eye endpoints follow the same model-space curve at different height scales', () => {
 const scaled=(c,v)=>{const horizontal=c.dist*Math.cos(c.pitch),dy=c.dist*Math.sin(c.pitch)*v;return {...c,dist:Math.hypot(horizontal,dy),pitch:Math.atan2(dy,horizontal)};};
 const plain=makeSweep(c0,c1,{trajectory:'curved',lift_m:40,bend_m:30});
 const exaggerated=makeSweep(scaled(c0,3),scaled(c1,3),{trajectory:'curved',verticalScale:3,lift_m:40,bend_m:30});
 for(let i=0;i<=100;i++){
  const a=eyeOf(plain.sample(i/100)),b=eyeOf(exaggerated.sample(i/100),3);
  assert.ok(Math.hypot(...a.map((v,j)=>v-b[j]))<1e-8);
 }
});
