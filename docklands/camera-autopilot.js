// Stateful camera dynamics in model metres. No renderer, clock, locale or collision claims.
const finitePoint = p => Array.isArray(p) && p.length === 3 && p.every(v => Number.isFinite(v) && Math.abs(v) <= 1e7);
const add = (a,b) => a.map((v,i)=>v+b[i]), sub = (a,b) => a.map((v,i)=>v-b[i]), mul = (a,s) => a.map(v=>v*s);
const norm = a => Math.hypot(...a), unit = (a,f=[0,0,-1]) => norm(a)>1e-9?mul(a,1/norm(a)):f.slice();
const cap = (a,m) => norm(a)>m?mul(a,m/norm(a)):a;
const defaults = {speed_m_s:15,max_acceleration_m_s2:4,max_jerk_m_s3:8,mass_kg:1,drag_per_s:.2,arrival_radius_m:2,gaze_turn_deg_s:45,gaze_distance_m:80,wind_acceleration:[0,0,0]};
const ranges = {speed_m_s:[.1,50],max_acceleration_m_s2:[.1,20],max_jerk_m_s3:[.1,100],mass_kg:[.1,1000],drag_per_s:[0,5],arrival_radius_m:[.1,10],gaze_turn_deg_s:[1,180],gaze_distance_m:[10,1000]};
function configuration(patch,previous=defaults) {
  if (!patch || typeof patch!=='object' || Array.isArray(patch)) throw Error('Autopilot config must be an object');
  const next={...previous,wind_acceleration:previous.wind_acceleration.slice()};
  for (const [key,value] of Object.entries(patch)) {
    if (key==='wind_acceleration') {if(!finitePoint(value)||norm(value)>2)throw Error('Wind acceleration must be a finite vector of at most 2 m/s²');next[key]=value.slice();}
    else {const r=ranges[key];if(!Object.hasOwn(ranges,key))throw Error('Unknown autopilot config: '+key);if(!Number.isFinite(value)||value<r[0]||value>r[1])throw Error('Invalid autopilot config: '+key);next[key]=value;}
  }
  return next;
}
export function createAutopilot({position,target,route,config={},segmentClear}={}) {
  if(!finitePoint(position)||!finitePoint(target))throw Error('Autopilot needs finite position and gaze target');
  function validateRoute(route){
    if(!Array.isArray(route)||!route.length||route.length>256)throw Error('Autopilot needs 1 to256 route points');
    return route.map((r,i)=>{if(!r||!finitePoint(r.point)||(r.gaze!=null&&!finitePoint(r.gaze)))throw Error('Invalid autopilot waypoint '+i);return {point:r.point.slice(),...(r.name!=null?{name:String(r.name).slice(0,160)}:{}),...(r.gaze?{gaze:r.gaze.slice()}:{} )};});
  }
  let points=validateRoute(route);
  if(segmentClear!=null&&typeof segmentClear!=='function')throw Error('segmentClear must be a function');
  let cfg=configuration(config),pos=position.slice(),velocity=[0,0,0],acceleration=[0,0,0],gaze=unit(sub(target,pos)),gazeDistance=Math.max(10,norm(sub(target,pos))),elapsed=0,discardedTime=0,index=0,status='playing',reason=null,override=null,nudges=[],visited=[],lastForward=unit([points[0].point[0]-pos[0],0,points[0].point[2]-pos[2]]);
  const state=()=>({status,reason,position:pos.slice(),velocity:velocity.slice(),acceleration:acceleration.slice(),target:add(pos,mul(gaze,gazeDistance)),elapsed_s:elapsed,discarded_time_s:discardedTime,waypoint_index:index,waypoint_count:points.length,next_waypoint:points[index]?.name??null,visited:visited.map(v=>({...v})),active_nudges:nudges.filter(n=>n.until>elapsed).length,gaze_mode:override&&override.until>elapsed?'explicit':points[index]?.gaze?'waypoint':'travel',config:{...cfg,wind_acceleration:cfg.wind_acceleration.slice()},collision_checked:false,motion_gate_enabled:!!segmentClear});
  function nudge({acceleration:input,duration_s=1,frame='world'}={}) {
    if(!finitePoint(input)||norm(input)>4||!Number.isFinite(duration_s)||duration_s<=0||duration_s>5||!['world','body'].includes(frame))throw Error('Nudge needs acceleration ≤4 m/s², duration (0,5] seconds and world/body frame');
    if(!['playing','braking'].includes(status))throw Error('Resume autopilot before applying a nudge');
    if(nudges.filter(n=>n.until>elapsed).length>=16)throw Error('Too many active nudges');
    let a=input.slice();
    if(frame==='body'){const forward=unit([velocity[0],0,velocity[2]],lastForward),right=[-forward[2],0,forward[0]];a=add(add(mul(right,input[0]),[0,input[1],0]),mul(forward,input[2]));}
    nudges.push({a,until:elapsed+duration_s});return state();
  }
  function lookAt({point,hold_s=5}={}) {
    if(point===null){override=null;return state();}
    if(!finitePoint(point)||!Number.isFinite(hold_s)||hold_s<=0||hold_s>120)throw Error('Gaze needs a finite point and hold (0,120] seconds');
    override={point:point.slice(),until:elapsed+hold_s};return state();
  }
  function step(dt) {
    if(!Number.isFinite(dt)||dt<0)throw Error('Autopilot step needs nonnegative finite seconds');
    if(!['playing','braking'].includes(status)||dt===0)return state();
    if(dt>=5){status='paused';reason='frame-gap';nudges=[];discardedTime+=dt;return state();}
    // Ordinary render stalls slow the simulation instead of pausing or catching up in a jump.
    // Pulse and gaze lifetimes remain simulation time; discarded wall time is reported separately.
    const boundedDt=Math.min(dt,.25);discardedTime+=dt-boundedDt;
    const count=Math.ceil(boundedDt/.01),h=boundedDt/count;
    for(let n=0;n<count&&['playing','braking'].includes(status);n++) {
      elapsed+=h;nudges=nudges.filter(v=>v.until>elapsed);
      const destination=points[index].point,delta=sub(destination,pos),distance=norm(delta),speed=norm(velocity),direction=unit(delta,lastForward);
      if(status==='playing'&&distance<=cfg.arrival_radius_m&&speed<=.35){
        visited.push({index,name:points[index].name??null,time_s:elapsed,distance_m:distance});
        if(index===points.length-1){status='arrived';velocity=[0,0,0];acceleration=[0,0,0];nudges=[];break;}index++;continue;
      }
      // A critically damped velocity servo brakes before each required waypoint.
      const desiredSpeed=status==='braking'?0:Math.min(cfg.speed_m_s,Math.sqrt(2*cfg.max_acceleration_m_s2*Math.max(0,distance-cfg.arrival_radius_m*.5)),distance*.4);
      const desired=mul(direction,desiredSpeed),automatic=mul(sub(desired,velocity),1.8);
      let force=add(automatic,mul(velocity,-cfg.drag_per_s));
      for(const pulse of nudges)force=add(force,mul(pulse.a,cfg.mass_kg));
      // The brake cancels the configured disturbance, so a steady wind cannot prevent stopping.
      if(status!=='braking')force=add(force,mul(cfg.wind_acceleration,cfg.mass_kg));
      const wanted=cap(mul(force,1/cfg.mass_kg),cfg.max_acceleration_m_s2);
      acceleration=add(acceleration,cap(sub(wanted,acceleration),cfg.max_jerk_m_s3*h));
      const nextVelocity=cap(add(velocity,mul(acceleration,h)),cfg.speed_m_s),next=add(pos,mul(add(velocity,nextVelocity),h*.5));
      if(!finitePoint(next)||(segmentClear&&!segmentClear(pos,next))){status='blocked';reason='motion-segment-rejected';velocity=[0,0,0];acceleration=[0,0,0];nudges=[];break;}
      pos=next;velocity=nextVelocity;if(Math.hypot(velocity[0],velocity[2])>.05)lastForward=unit([velocity[0],0,velocity[2]],lastForward);
      if(status==='braking'&&norm(velocity)<.05&&norm(acceleration)<.1){velocity=[0,0,0];acceleration=[0,0,0];status='paused';reason='braked';}
      if(override&&override.until<=elapsed)override=null;
      const focus=override?.point??points[index]?.gaze??add(pos,mul(unit(velocity,lastForward),cfg.gaze_distance_m));
      const wantedGaze=unit(sub(focus,pos),gaze),angle=Math.acos(Math.max(-1,Math.min(1,gaze.reduce((s,v,i)=>s+v*wantedGaze[i],0)))),fraction=angle<1e-8?1:Math.min(1,cfg.gaze_turn_deg_s*Math.PI/180*h/angle);
      // A stable perpendicular handles opposite directions without a zero vector.
      if(angle>Math.PI-1e-5){const axis=unit(Math.abs(gaze[1])<.9?[-gaze[2],0,gaze[0]]:[1,0,0]);gaze=unit(add(mul(gaze,Math.cos(Math.PI*fraction)),mul(axis,Math.sin(Math.PI*fraction))));}
      else {const s=Math.sin(angle);gaze=s<1e-8?wantedGaze:unit(add(mul(gaze,Math.sin((1-fraction)*angle)/s),mul(wantedGaze,Math.sin(fraction*angle)/s)));}
      gazeDistance+= (Math.max(10,Math.min(10000,norm(sub(focus,pos))))-gazeDistance)*(1-Math.exp(-3*h));
    }
    return state();
  }
  return {state,step,nudge,lookAt,setRoute:({route}={})=>{const next=validateRoute(route);if(!['playing','paused'].includes(status))throw Error('Only playing or paused autopilot can reroute');points=next;index=0;visited=[];return state();},configure:patch=>{cfg=configuration(patch,cfg);return state();},pause:()=>{if(['playing','braking'].includes(status)){status='paused';reason='requested';nudges=[];}return state();},resume:()=>{if(status!=='paused')throw Error('Only paused autopilot can resume');status='playing';reason=null;return state();},brake:()=>{if(!['playing','braking'].includes(status))throw Error('Only active autopilot can brake');status='braking';reason=null;nudges=[];return state();},stop:()=>{status='stopped';reason='requested';velocity=[0,0,0];acceleration=[0,0,0];nudges=[];return state();}};
}
