import test from 'node:test';
import assert from 'node:assert/strict';
import {createCityRouter,createPrismClearance,sampleCityRoute} from '../city-route.js';
import {createModelCityRouter} from '../city-route-model.js';
const rect=(x0,z0,x1,z1,minY=0,maxY=50)=>({rings:[[[x0,z0],[x1,z0],[x1,z1],[x0,z1]]],minY,maxY});
const enc=(points,stride)=>{const acc=Array(stride).fill(0);return points.flatMap(p=>p.map((v,i)=>{const n=Math.round(v*10),d=n-acc[i];acc[i]=n;return d;}));};
test('continuous prism checks catch thin walls, radius grazing and vertical slab crossings',()=>{
 const c=createPrismClearance([rect(9,-2,9.1,2)],{clearance_m:1});
 assert.equal(c.segmentClear([0,8,0],[20,8,0]),false);
 assert.equal(c.segmentClear([0,8,2.5],[20,8,2.5]),false);
 assert.equal(c.segmentClear([0,52,0],[20,52,0]),true);
 assert.equal(c.segmentClear([9,60,0],[9,-10,0]),false);
 assert.equal(c.segmentClear([0,8,4],[20,8,4]),true);
});
test('courtyard holes and elevated building parts use their actual prism intervals',()=>{
 const building=rect(-10,-10,10,10);building.rings.push([[-5,-5],[-5,5],[5,5],[5,-5]]);
 const c=createPrismClearance([building,rect(20,-5,30,5,20,50)],{clearance_m:1});
 assert.equal(c.segmentClear([-2,8,0],[2,8,0]),true);
 assert.equal(c.segmentClear([0,8,0],[8,8,0]),false);
 assert.equal(c.segmentClear([15,8,0],[35,8,0]),true);
 assert.equal(c.segmentClear([15,25,0],[35,25,0]),false);
});
test('road A* takes a checked exterior detour and sampled eyes stay on those segments',()=>{
 const roads=[[[0,8,0],[10,8,0],[20,8,0]],[[0,8,0],[0,8,10],[20,8,10],[20,8,0]]];
 const router=createCityRouter({roads,buildings:[rect(8,-2,12,3)]},{clearance_m:1,max_snap_m:2,simplify_m:.01});
 const route=router.plan([0,8,0],[20,8,0]);assert.equal(route.ok,true);assert.equal(route.policy,'city-exterior');assert(route.length_m>=40);
 assert.equal(router.segmentClear([0,8,0],[20,8,0]),false);
 assert.equal(route.trajectory,'polyline');assert(route.telemetry.nodes>0);assert(route.telemetry.build_ms>=0);
 for(let i=0;i<=500;i++){const p=sampleCityRoute(route,i/500);assert.equal(router.segmentClear(p,p),true);}
 assert.deepEqual(sampleCityRoute(route,0),[0,8,0]);assert.deepEqual(sampleCityRoute(route,1),[20,8,0]);
 const corner=route.cumulative_m[1]/route.length_m,h=1e-5,a=sampleCityRoute(route,corner-h),b=sampleCityRoute(route,corner),c=sampleCityRoute(route,corner+h);
 assert(Math.hypot(...a.map((v,i)=>v-b[i]))/h<.001);assert(Math.hypot(...c.map((v,i)=>v-b[i]))/h<.001);
});
test('disconnected grade-separated roads do not become one road junction',()=>{
 const router=createCityRouter({roads:[[[-10,8,0],[0,8,0],[10,8,0]],[[0,28,-10],[0,28,0],[0,28,10]]],buildings:[]},{max_snap_m:.5,clearance_m:1});
 assert.equal(router.plan([-10,8,0],[0,28,10]).ok,false);
});
test('unsafe endpoints, absent connectors and search budgets fail closed',()=>{
 const router=createCityRouter({roads:[[[0,8,0],[10,8,0]]],buildings:[rect(-2,-2,2,2)]},{max_snap_m:1,clearance_m:1});
 assert.equal(router.plan([0,8,0],[10,8,0]).error,'endpoint-in-building-clearance');
 assert.equal(router.plan([50,8,50],[60,8,60]).error,'no-clear-start-road-connector');
 assert.throws(()=>createCityRouter({roads:[[[0,8,0],[1,8,0],[2,8,0]]],buildings:[]},{max_vertices:2}),/budget/);
 const bounded=createCityRouter({roads:[[[0,8,0],[10,8,0]]],buildings:[]},{bounds:{x0:-1,x1:11,z0:-1,z1:1},clearance_m:2});
 assert.equal(bounded.plan([0,8,0],[10,8,0]).error,'outside-model-bounds');
});
test('model adapter decodes x/z/y correctly, excludes tunnels, caches one graph and keeps model bounds',()=>{
 const area={meta:{extent:{x0:-100,x1:100,z0:-100,z1:100}},lines:[{k:'road',q:enc([[0,0,2],[10,0,2]],3)},{k:'road',tunnel:true,q:enc([[10,0,2],[20,0,2]],3)}],buildings:[]};
 const router=createModelCityRouter(area,{height_m:8,max_snap_m:.5});assert.equal(router,createModelCityRouter(area,{height_m:8,max_snap_m:.5}));
 const route=router.plan([0,10,0],[10,10,0]);assert.equal(route.ok,true);assert.equal(route.points[0][1],10);assert.equal(router.stats.segments,1);
 assert.equal(router.plan([10,10,0],[20,10,0]).ok,false);
 assert.throws(()=>createModelCityRouter(area,{height_m:100}),/height/);
});
test('vertical approach connectors are checked and explicit destinations resolve to a clear road eye',()=>{
 const roads=[[[0,8,0],[20,8,0]]];
 const router=createCityRouter({roads,buildings:[]},{clearance_m:1});
 const end=router.nearestRoadPoint(20,0);assert.equal(end.ok,true);assert.deepEqual(end.point,[20,8,0]);
 const route=router.plan([0,40,0],end.point);assert.equal(route.ok,true);assert.deepEqual(route.points[0],[0,40,0]);
 const blocked=createCityRouter({roads,buildings:[rect(-2,-2,2,2,0,20)]},{clearance_m:1});
 assert.equal(blocked.plan([0,40,0],[20,8,0]).error,'no-clear-start-road-connector');
 assert.equal(blocked.nearestRoadPoint(0,0).ok,false);
});

test('clearance query work is bounded and oversized unknown spans fail closed',()=>{
 const c=createPrismClearance([],{max_query_cells:4,cell_m:10,clearance_m:0});
 assert.equal(c.segmentClear([0,8,0],[1000000,8,1000000]),false);
});

test('huge finite coordinates cannot stall integer grid or junction loops',()=>{
 const c=createPrismClearance([]);assert.equal(c.segmentClear([1e20,8,1e20],[1e20,8,1e20]),false);
 assert.throws(()=>createPrismClearance([rect(1e20,1e20,1e20+1,1e20+1)]),/unsupported/);
 assert.throws(()=>createCityRouter({roads:[[[1e20,8,0],[1e20,8,1]]],buildings:[]}),/unsupported/);
});

test('finite but enormous vertical deltas cannot become a false-clear prism trace',()=>{
 const c=createPrismClearance([rect(-2,-2,2,2,0,20)]);
 assert.equal(c.segmentClear([-10,1e308,0],[10,-1e308,0]),false);
});
