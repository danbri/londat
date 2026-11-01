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
