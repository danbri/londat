import test from 'node:test';import assert from 'node:assert/strict';
import {projectSubject,scoreComposition,rankCompositions} from '../cinematic-composition.js';
const camera={tx:0,ty:0,tz:0,dist:10,yaw:0,pitch:0,fov:Math.PI/2};
test('projection uses the model camera convention and rejects subjects behind the eye',()=>{
 const centre=projectSubject(camera,[0,0,0]);assert.equal(centre.x,.5);assert.equal(centre.y,.5);assert.equal(centre.depth,10);
 const right=projectSubject(camera,[5,0,0]);assert.ok(Math.abs(right.x-.75)<1e-12);assert.equal(right.onScreen,true);
 assert.equal(projectSubject(camera,[0,0,11]).onScreen,false);assert.ok(projectSubject(camera,[0,5,0]).y<.5);
 const vertical=projectSubject({...camera,pitch:Math.PI/2},[0,0,0]);assert.ok(Number.isFinite(vertical.x)&&Number.isFinite(vertical.y));
});
test('horizontal lens respects aspect and projection handles roll',()=>{
 const a=projectSubject({...camera,hfov:Math.PI/2},[5,0,0],{aspect:2});assert.ok(Math.abs(a.x-.75)<1e-12);
 const b=projectSubject({...camera,roll:90},[5,0,0]);assert.ok(Math.abs(b.x-.5)<1e-12);assert.ok(b.y>.5);
});
const subject=(x,y)=>({x,y,depth:10});
test('composition favours thirds and margins without claiming visibility',()=>{
 const thirds=scoreComposition({subject:subject(1/3,1/3)}),centre=scoreComposition({subject:subject(.5,.5)}),edge=scoreComposition({subject:subject(0,.5)});
 assert.ok(thirds.score>centre.score);assert.ok(centre.score>edge.score);assert.equal(thirds.occlusionKnown,false);
 assert.equal(scoreComposition({subject:subject(1/3,1/3),occlusion:1}).score,0);
 assert.equal(scoreComposition({subject:{x:null,y:null,depth:-1}}).score,0);
});
test('optional horizon, known occlusion and continuity affect ranking; ties remain stable',()=>{
 const candidates=rankCompositions([{id:'a',subject:subject(1/3,1/3),headingChange:Math.PI},{id:'b',subject:subject(1/3,1/3),headingChange:0},{id:'c',subject:subject(1/3,1/3),headingChange:0}]);assert.deepEqual(candidates.map(c=>c.id),['b','c','a']);
 assert.ok(scoreComposition({subject:subject(.5,.5),horizonY:1/3}).score>scoreComposition({subject:subject(.5,.5),horizonY:1.5}).score);
 assert.throws(()=>scoreComposition({subject:subject(.5,.5),occlusion:2}));assert.throws(()=>projectSubject(camera,[Infinity,0,0]));
});

test('subject projection agrees with THREE rigid projection after model vertical scaling', async()=>{
 const THREE=await import('../../third_party/three/build/three.module.js');
 for(const verticalScale of [1,3])for(const hfov of [null,1.1])for(const roll of [0,27]){
  const c={tx:2,ty:4,tz:-3,dist:80,yaw:.7,pitch:.3,fov:.9,hfov,roll},aspect=1.7;
  const off=c.dist*Math.sin(c.pitch),targetY=hfov?(c.ty+off)*verticalScale-off:c.ty*verticalScale;
  const vf=hfov?2*Math.atan(Math.tan(hfov/2)/aspect):c.fov;
  const rendererCamera=new THREE.PerspectiveCamera(vf*180/Math.PI,aspect,.1,1e6);
  rendererCamera.position.set(c.tx+c.dist*Math.sin(c.yaw)*Math.cos(c.pitch),targetY+off,c.tz+c.dist*Math.cos(c.yaw)*Math.cos(c.pitch));
  rendererCamera.lookAt(c.tx,targetY,c.tz);rendererCamera.rotateZ(roll*Math.PI/180);rendererCamera.updateMatrixWorld();
  for(const point of [[0,5,0],[12,18,-7],[-10,0,10]]){
   const actual=projectSubject(c,point,{aspect,verticalScale}),expected=new THREE.Vector3(point[0],point[1]*verticalScale,point[2]).project(rendererCamera);
   assert.ok(Math.abs(actual.x-(expected.x+1)/2)<1e-10);assert.ok(Math.abs(actual.y-(1-expected.y)/2)<1e-10);
  }
 }
});
