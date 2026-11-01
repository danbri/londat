// Geometric composition heuristics, not an image aesthetic model or an occlusion test.
const clamp = n => Math.max(0, Math.min(1, n));
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = v => { const n=Math.hypot(...v);return n>1e-10?v.map(x=>x/n):null; };
const finitePoint = p => Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
export function projectSubject(camera, point, {aspect=1,verticalScale=1}={}) {
  if(!finitePoint(point)||!Number.isFinite(aspect)||aspect<=0||!Number.isFinite(verticalScale)||verticalScale<=0)throw Error('A finite 3D subject and positive aspect are required');
  for(const key of ['tx','ty','tz','dist','yaw','pitch'])if(!Number.isFinite(camera[key]))throw Error('A finite model camera is required');
  if(camera.dist<=0)throw Error('Camera range must be positive');
  const hfov=camera.hfov??camera.lens?.hfov;
  const off=camera.dist*Math.sin(camera.pitch),targetY=hfov&&verticalScale!==1?(camera.ty+off)*verticalScale-off:camera.ty*verticalScale;
  const eye=[camera.tx+camera.dist*Math.sin(camera.yaw)*Math.cos(camera.pitch),targetY+off,camera.tz+camera.dist*Math.cos(camera.yaw)*Math.cos(camera.pitch)];
  const forward=unit([camera.tx-eye[0],targetY-eye[1],camera.tz-eye[2]]);
  // Use yaw to keep a stable right vector even at a vertical view.
  const right=[Math.cos(camera.yaw),0,-Math.sin(camera.yaw)],up=unit(cross(right,forward));
  const v=point.map((n,i)=>(i===1?n*verticalScale:n)-eye[i]),depth=dot(v,forward);
  if(depth<=1e-8)return {x:null,y:null,depth,onScreen:false};
  const fov=hfov!=null?2*Math.atan(Math.tan(hfov/2)/aspect):(camera.fov??camera.lens?.fov??45.8*Math.PI/180);
  if(!Number.isFinite(fov)||fov<=0||fov>=Math.PI)throw Error('Field of view must be between zero and pi');
  const roll=(camera.roll??camera.lens?.roll??0)*Math.PI/180; // Page roll is degrees; lens fields are radians.
  if(!Number.isFinite(roll))throw Error('Camera roll must be finite');
  const u=dot(v,right),w=dot(v,up),rx=u*Math.cos(roll)+w*Math.sin(roll),ry=-u*Math.sin(roll)+w*Math.cos(roll);
  const y=.5-ry/(2*depth*Math.tan(fov/2)),x=.5+rx/(2*depth*Math.tan(fov/2)*aspect);
  return {x,y,depth,onScreen:x>=0&&x<=1&&y>=0&&y<=1};
}
export function scoreComposition({subject,horizonY=null,occlusion=null,headingChange=null}={}) {
  if(!subject)throw Error('A projected subject is required');
  const onScreen=subject.depth>0&&Number.isFinite(subject.x)&&Number.isFinite(subject.y)&&subject.x>=0&&subject.x<=1&&subject.y>=0&&subject.y<=1;
  const terms={};
  if(!onScreen)return {score:0,onScreen:false,terms,occlusionKnown:occlusion!=null};
  const distance=Math.min(...[1/3,2/3].flatMap(x=>[1/3,2/3].map(y=>Math.hypot(subject.x-x,subject.y-y))));
  terms.thirds=clamp(1-distance/Math.SQRT1_2);
  // A smooth edge penalty avoids rewarding subjects clipped at the viewport boundary.
  terms.margin=clamp(Math.min(subject.x,1-subject.x,subject.y,1-subject.y)/.12);
  const weights={thirds:.5,margin:.2,horizon:.1,visibility:.1,continuity:.1};
  if(horizonY!=null){if(!Number.isFinite(horizonY))throw Error('Horizon must be finite');terms.horizon=clamp(1-Math.min(Math.abs(horizonY-1/3),Math.abs(horizonY-2/3))/.5);}
  if(occlusion!=null){if(!Number.isFinite(occlusion)||occlusion<0||occlusion>1)throw Error('Occlusion must be from zero to one');terms.visibility=1-occlusion;}
  if(headingChange!=null){if(!Number.isFinite(headingChange)||headingChange<0)throw Error('Heading change must be a nonnegative angle');terms.continuity=clamp(1-headingChange/Math.PI);}
  const sum=Object.keys(terms).reduce((s,k)=>s+weights[k],0);
  let score=Object.keys(terms).reduce((s,k)=>s+terms[k]*weights[k],0)/sum;
  // An explicitly occluded subject is unsuitable even if its projected placement is attractive.
  if(occlusion!=null)score*=1-occlusion;
  return {score:clamp(score),onScreen:true,terms,occlusionKnown:occlusion!=null};
}
export function rankCompositions(candidates) {
  return candidates.map((candidate,index)=>({...candidate,composition:scoreComposition(candidate),index})).sort((a,b)=>b.composition.score-a.composition.score||a.index-b.index);
}
