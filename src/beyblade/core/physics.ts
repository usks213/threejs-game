import type { Battle, BattleResult, Finish, Launch, Profile, Top, Vec3, Quaternion } from './types';
import { points } from './rules';

export const STEP=1/240;
const G=9.81;
/** Topology from official BX-17 manual p7. Dimensions remain explicit estimates, not CAD. */
export const STADIUM={
  radius:.22, coverRadius:.245, launchOpeningRadius:.155, coverRoofHeight:.16, bowlDepth:.012, bowlStiffness:2*G*.012/(.22*.22), wallHeight:.12,
  railRadius:.201,railHeightMin:.002,railHeightMax:.013,railMaxTilt:.65,
  railNotchDepth:.037,railNotchHalfAngle:.24,pocketOuterRadius:.325,pocketEntryRadius:.22,pocketRampLength:.03,pocketFloorHeight:-.006,
  pockets:[
    {angle:Math.PI/2,halfWidth:.24,finish:'xtreme' as const},
    {angle:Math.PI*.17,halfWidth:.22,finish:'over' as const},
    {angle:Math.PI*.83,halfWidth:.22,finish:'over' as const},
  ],
};
export interface PhysicsTop extends Top {
  pendingFinish?:'over'|'xtreme';pocketEnteredTick?:number;pocketRestTime?:number;pocketAngle?:number;
  rotationStopped?:boolean;finishTick?:number;
}
const V=(x=0,y=0,z=0):Vec3=>({x,y,z});
const add=(a:Vec3,b:Vec3)=>V(a.x+b.x,a.y+b.y,a.z+b.z);
const sub=(a:Vec3,b:Vec3)=>V(a.x-b.x,a.y-b.y,a.z-b.z);
const scale=(v:Vec3,s:number)=>V(v.x*s,v.y*s,v.z*s);
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:Vec3,b:Vec3)=>V(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const norm=(a:Vec3)=>Math.hypot(a.x,a.y,a.z);
const unit=(a:Vec3,fallback=V(0,1,0))=>norm(a)>1e-12?scale(a,1/norm(a)):fallback;
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const finite=(x:number,fallback:number)=>Number.isFinite(x)?x:fallback;
const angleDifference=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const position=(t:Top)=>V(t.x,t.y,t.z);
const velocity=(t:Top)=>V(t.vx,t.vy,t.vz);
function multiply(a:Quaternion,b:Quaternion):Quaternion{return{x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z};}
function normalized(q:Quaternion):Quaternion{const length=Math.hypot(q.x,q.y,q.z,q.w);return{x:q.x/length,y:q.y/length,z:q.z/length,w:q.w/length};}
export function rotate(q:Quaternion,v:Vec3):Vec3{const u=V(q.x,q.y,q.z),uv=cross(u,v);return add(v,add(scale(uv,2*q.w),scale(cross(u,uv),2)));}
const inverseRotate=(q:Quaternion,v:Vec3)=>rotate({x:-q.x,y:-q.y,z:-q.z,w:q.w},v);
function rotationVector(v:Vec3):Quaternion{const angle=norm(v);if(angle<1e-12)return{x:0,y:0,z:0,w:1};const s=Math.sin(angle/2)/angle;return{x:v.x*s,y:v.y*s,z:v.z*s,w:Math.cos(angle/2)};}
export const bodyAxis=(t:Top)=>rotate(t.orientation,V(0,1,0));
export const comHeight=(p:Profile)=>p.centerOfMassHeight??p.height*.72;
interface SurfaceSample{height:number;dx:number;dz:number;inPocket:boolean}
function floorSurface(x:number,z:number):SurfaceSample{
  const r2=x*x+z*z,R=STADIUM.radius,inside=r2<R*R,base=STADIUM.bowlDepth*Math.min(r2/(R*R),1),slope=inside?2*STADIUM.bowlDepth/(R*R):0;
  let blend=0,blendX=0,blendZ=0;
  for(const p of STADIUM.pockets){
    const nx=Math.cos(p.angle),nz=Math.sin(p.angle),along=x*nx+z*nz,across=-x*nz+z*nx,width=R*Math.sin(p.halfWidth);
    const a=clamp((along-STADIUM.pocketEntryRadius)/STADIUM.pocketRampLength,0,1),c=clamp((Math.abs(across)-(width-.012))/.016,0,1);
    const av=a*a*(3-2*a),cv=1-c*c*(3-2*c),weight=av*cv;
    if(weight>blend){
      const da=6*a*(1-a)/STADIUM.pocketRampLength,dc=-6*c*(1-c)/.016*Math.sign(across);
      blend=weight;blendX=da*nx*cv+av*dc*(-nz);blendZ=da*nz*cv+av*dc*nx;
    }
  }
  const difference=STADIUM.pocketFloorHeight-base;
  return{height:base+difference*blend,dx:slope*x*(1-blend)+difference*blendX,dz:slope*z*(1-blend)+difference*blendZ,inPocket:blend>0};
}
/** Continuous estimated lip/ramp surface: return motion meets a physical inclined normal, never an 18mm height teleport. */
export function pocketFloorAt(x:number,z:number):number|null{const sample=floorSurface(x,z);return sample.inPocket?sample.height:null;}
export function bowlHeightAt(x:number,z:number):number{return floorSurface(x,z).height;}
export function bowlNormalAt(x:number,z:number):Vec3{const sample=floorSurface(x,z);return unit(V(-sample.dx,1,-sample.dz));}
export function bladeRadiusAt(profile:Profile,angle:number):number{
  const phase=profile.contactLobes*angle*profile.spin,skew=profile.bladeSkew??0;
  return profile.radius*(1+profile.contactLobeDepth*(Math.cos(phase)+skew*Math.sin(2*phase))/(1+Math.abs(skew)));
}
export function bladeCenterHeightAt(profile:Profile,angle:number):number{
  return profile.height*.82-comHeight(profile)+(profile.bladeRampAmplitude??0)*Math.sin(profile.contactLobes*angle*profile.spin);
}
export function getBladeOutline(profile:Profile,samples=48):{x:number;z:number}[]{return Array.from({length:samples},(_,i)=>{const a=i/samples*Math.PI*2,r=bladeRadiusAt(profile,a);return{x:r*Math.cos(a),z:r*Math.sin(a)};});}
export function getRatchetGeometry(profile:Profile){return{radius:profile.radius*.65,centerHeight:profile.height*.43,halfThickness:.0025};}
export function getBladeVertices(profile:Profile,samples=48):Vec3[]{const outline=getBladeOutline(profile,samples),half=.0045;return[-1,1].flatMap(side=>outline.map((p,i)=>V(p.x,bladeCenterHeightAt(profile,i/samples*Math.PI*2)+side*half,p.z)));}
/** Closed tooth line with the official rear inward notch topology. Centerline y is gear height above the bowl. */
export function getRailPath(samples=128):Vec3[]{
  const angles=Array.from({length:samples},(_,i)=>-Math.PI+i/samples*2*Math.PI);
  const rear=-Math.PI/2,h=STADIUM.railNotchHalfAngle;
  angles.push(rear-h,rear-h*.35,rear+h*.35,rear+h);
  angles.sort((a,b)=>a-b);
  return angles.filter((a,i)=>i===0||Math.abs(a-angles[i-1])>1e-8).map(a=>{
    const d=Math.abs(angleDifference(a,rear));
    const notch=d>=h?0:d<=h*.35?1:(h-d)/(h*.65);
    const r=STADIUM.railRadius-STADIUM.railNotchDepth*notch,x=Math.cos(a)*r,z=Math.sin(a)*r;
    return V(x,bowlHeightAt(x,z)+.007,z);
  });
}
const RAIL=getRailPath();

export function inverseInertia(t:Top,v:Vec3,q=t.orientation):Vec3{const body=inverseRotate(q,v);return rotate(q,V(body.x/t.bodyInertia.x,body.y/t.bodyInertia.y,body.z/t.bodyInertia.z));}
function inertia(t:Top,v:Vec3):Vec3{const body=inverseRotate(t.orientation,v);return rotate(t.orientation,V(body.x*t.bodyInertia.x,body.y*t.bodyInertia.y,body.z*t.bodyInertia.z));}
export function syncDerived(t:Top):void{t.angularVelocity=inverseInertia(t,t.angularMomentum);t.omega=dot(t.angularVelocity,bodyAxis(t));t.tilt=Math.acos(clamp(bodyAxis(t).y,-1,1));}
/** Explicit state setter for experiments/tests; do not mutate derived scalar omega/tilt. */
export function setAngularVelocity(t:Top,world:Vec3):void{t.angularMomentum=inertia(t,world);syncDerived(t);}
export function setOrientation(t:Top,q:Quaternion,preserveBodySpin=true):void{const spin=t.omega;t.orientation=normalized(q);if(preserveBodySpin)t.angularMomentum=inertia(t,scale(bodyAxis(t),spin));syncDerived(t);}
export function kineticEnergy(t:Top):number{return .5*t.profile.mass*(t.vx*t.vx+t.vy*t.vy+t.vz*t.vz)+.5*dot(t.angularMomentum,inverseInertia(t,t.angularMomentum));}
export function totalEnergy(t:Top):number{return kineticEnergy(t)+t.profile.mass*G*t.y+.5*(t.profile.lockStiffness??.014)*t.lock*t.lock;}
function applyImpulse(t:Top,j:Vec3,r:Vec3):void{t.vx+=j.x/t.profile.mass;t.vy+=j.y/t.profile.mass;t.vz+=j.z/t.profile.mass;t.angularMomentum=add(t.angularMomentum,cross(r,j));syncDerived(t);}
const pointVelocity=(t:Top,r:Vec3)=>add(velocity(t),cross(t.angularVelocity,r));
const contactMass=(t:Top,r:Vec3,n:Vec3)=>1/t.profile.mass+dot(cross(inverseInertia(t,cross(r,n)),r),n);
function angularFriction(t:Top,axis:Vec3,maxImpulse:number):void{const speed=dot(t.angularVelocity,axis),effective=dot(axis,inverseInertia(t,axis));const j=-Math.sign(speed)*Math.min(Math.abs(speed)/effective,Math.max(0,maxImpulse));t.angularMomentum=add(t.angularMomentum,scale(axis,j));syncDerived(t);}

export function createBattle(profiles:[Profile,Profile],launches:[Launch,Launch]):Battle{
  const tops=profiles.map((p,i):PhysicsTop=>{
    if(![p.mass,p.radius,p.inertia,p.burstThreshold,p.gearRadius].every(n=>Number.isFinite(n)&&n>0)||p.radius>=STADIUM.radius/2||p.gearRadius>=p.radius||![p.drag,p.grip,p.height,p.railGrip,p.contactLobes,p.contactLobeDepth,p.gearHeight].every(Number.isFinite)||![1,-1].includes(p.spin))throw new Error('Invalid physical profile');
    const optionalPositive=[p.transverseInertia,p.centerOfMassHeight,p.tipRadius,p.lockStiffness,p.lockReleaseAngle];
    if(optionalPositive.some(v=>v!==undefined&&(!Number.isFinite(v)||v<=0))||![p.tipFriction??0,p.rollingDrag??0,p.bladeRampAmplitude??0,p.bladeSkew??0].every(Number.isFinite)||p.height<=0||p.contactLobes<1||p.contactLobeDepth<0||p.contactLobeDepth>.5)throw new Error('Invalid body/contact estimate');
    const l=launches[i],power=clamp(finite(l.power,.75),.05,1),angle=clamp(finite(l.angle,0),-Math.PI,Math.PI),tilt=clamp(finite(l.tilt,.12),0,.65),side=i===0?-1:1,direction=angle+(i===0?0:Math.PI);
    const yaw=i*Math.PI,tiltAxis=V(Math.sin(direction),0,-Math.cos(direction));
    const q=multiply(rotationVector(scale(tiltAxis,tilt)),rotationVector(V(0,yaw,0)));
    const center=comHeight(p),tip=p.tipRadius??.0015,transverse=p.transverseInertia??(.5*p.inertia+p.mass*(p.height*.35)**2/12);
    const t:PhysicsTop={profile:{...p},x:side*.105,y:0,z:side*.053,vx:Math.cos(direction)*(.45+power*1.45),vy:-.12,vz:Math.sin(direction)*(.45+power*1.45),orientation:q,angularMomentum:V(),angularVelocity:V(),bodyInertia:V(transverse,p.inertia,transverse),centerOfMassHeight:center,tipRadius:tip,omega:p.spin*(170+power*440),phase:yaw,tilt,tiltVelocity:0,lock:0,railCooldown:0,eliminated:null,rail:{engaged:false,travel:0,contactPoint:null,tangent:null,lastContactTick:-1,lastReleaseTick:-1,dashCount:0,speedBefore:0,spinBefore:0,energyBefore:0}};
    const tipR=rotate(q,V(0,-center+tip,0));t.y=bowlHeightAt(t.x+tipR.x,t.z+tipR.z)-tipR.y+tip+.001;
    t.angularMomentum=inertia(t,scale(bodyAxis(t),t.omega));syncDerived(t);return t;
  }) as [PhysicsTop,PhysicsTop];
  return{tick:0,tops,events:[],result:null};
}

/** Torque-free midpoint quaternion update: world L is fixed; ω follows changing R I⁻¹ Rᵀ. */
export function integrateFree(t:Top,dt:number,gravity=true,drag=true):void{
  if(gravity)t.vy-=G*dt;
  if(drag)t.angularMomentum=scale(t.angularMomentum,Math.exp(-Math.max(0,t.profile.drag)*dt));
  if(Math.abs(t.bodyInertia.x-t.bodyInertia.z)<1e-15){
    // Exact torque-free symmetric-top propagator. World L and kinetic energy are conserved.
    const transverse=t.bodyInertia.x,axis=bodyAxis(t),axialMomentum=dot(t.angularMomentum,axis);
    const worldTurn=rotationVector(scale(t.angularMomentum,dt/transverse));
    const bodyTurn=rotationVector(V(0,axialMomentum*(1/t.bodyInertia.y-1/transverse)*dt,0));
    t.orientation=normalized(multiply(multiply(worldTurn,t.orientation),bodyTurn));
  }else{
    // Implicit Lie midpoint for a supplied triaxial tensor; bounded adaptive substeps remain required.
    let midpoint=inverseInertia(t,t.angularMomentum);
    for(let iteration=0;iteration<8;iteration++){
      const qmid=normalized(multiply(rotationVector(scale(midpoint,dt/2)),t.orientation));
      midpoint=inverseInertia(t,t.angularMomentum,qmid);
    }
    t.orientation=normalized(multiply(rotationVector(scale(midpoint,dt)),t.orientation));
  }
  t.x+=t.vx*dt;t.y+=t.vy*dt;t.z+=t.vz*dt;
  const oldTilt=t.tilt;syncDerived(t);t.tiltVelocity=(t.tilt-oldTilt)/dt;t.phase+=t.omega*dt;
}

function floorContact(t:Top,local:Vec3,sphereRadius:number,patchRadius:number,mu:number):number{
  let r=rotate(t.orientation,local),world=add(position(t),r),normal=bowlNormalAt(world.x,world.z);
  r=sub(r,scale(normal,sphereRadius));world=add(position(t),r);
  const penetration=bowlHeightAt(world.x,world.z)-world.y;
  if(penetration<-.00008)return 0;
  if(penetration>0){const correction=Math.min(penetration,.004);t.x+=normal.x*correction;t.y+=normal.y*correction;t.z+=normal.z*correction;}
  const vn=dot(pointVelocity(t,r),normal);if(vn>=0)return 0;
  const jn=-(1+(vn<-.8?.08:0))*vn/contactMass(t,r,normal);
  applyImpulse(t,scale(normal,jn),r);
  const cv=pointVelocity(t,r),tangentV=sub(cv,scale(normal,dot(cv,normal))),speed=norm(tangentV);
  if(speed>1e-9){const tangent=scale(tangentV,1/speed),jt=Math.min(speed/contactMass(t,r,tangent),mu*jn);applyImpulse(t,scale(tangent,-jt),r);}
  // Finite contact patch torsion. Flat tip uses physical rim contacts, not a synthetic propulsion force.
  if(patchRadius>0)angularFriction(t,normal,mu*jn*patchRadius);
  const omegaTangent=sub(t.angularVelocity,scale(normal,dot(t.angularVelocity,normal)));
  if(norm(omegaTangent)>1e-9)angularFriction(t,unit(omegaTangent),jn*(t.profile.rollingDrag??.000015));
  return jn;
}
export function resolveFloor(t:Top):number{
  const p=t.profile,mu=clamp(p.tipFriction??p.grip,0,1.5),shape=p.tipShape??'taper',tip=t.tipRadius;
  let impulse=0;
  if(shape==='flat'){
    // Rim points are a finite planar patch. Orientation itself decides which ones touch.
    for(let i=0;i<4;i++){const a=i*Math.PI/2;impulse+=floorContact(t,V(tip*Math.cos(a),-t.centerOfMassHeight,tip*Math.sin(a)),0,tip*.12,mu);}
    impulse+=floorContact(t,V(0,-t.centerOfMassHeight,0),0,tip*.3,mu);
  }else impulse+=floorContact(t,V(0,-t.centerOfMassHeight+tip,0),tip,tip*(shape==='needle'?.15:shape==='ball'?.12:.45),mu);
  // The metal body can scrape the floor when tilted. Contact torque causes wobble/fall naturally.
  if(t.tilt>.22){const vertices=getBladeVertices(p,12);for(const vertex of vertices)impulse+=floorContact(t,vertex,0,.0005,.28);
    const ratchet=getRatchetGeometry(p);for(let i=0;i<8;i++){const a=i*Math.PI/4;impulse+=floorContact(t,V(ratchet.radius*Math.cos(a),ratchet.centerHeight-t.centerOfMassHeight-ratchet.halfThickness,ratchet.radius*Math.sin(a)),0,.0003,.25);}
    impulse+=floorContact(t,V(0,p.height*.82-t.centerOfMassHeight+.01,0),0,.0005,.28);
  }
  syncDerived(t);return impulse;
}

/** Blade collision shape is a ring of overlapping rounded lobes, rigidly transformed in full 3D. */
interface CollisionNode{point:Vec3;radius:number;kind:'blade'|'ratchet'}
function collisionNodes(t:Top):CollisionNode[]{
  const sampleRadius=.0045;
  const nodes:CollisionNode[]=getBladeOutline(t.profile,24).map(v=>{
    const d=Math.hypot(v.x,v.z),s=(d-sampleRadius)/d;
    return{point:add(position(t),rotate(t.orientation,V(v.x*s,bladeCenterHeightAt(t.profile,Math.atan2(v.z,v.x)),v.z*s))),radius:sampleRadius,kind:'blade'};
  });
  const ratchet=getRatchetGeometry(t.profile);
  for(let i=0;i<16;i++){const a=i*Math.PI/8,r=ratchet.radius-ratchet.halfThickness;nodes.push({point:add(position(t),rotate(t.orientation,V(r*Math.cos(a),ratchet.centerHeight-t.centerOfMassHeight,r*Math.sin(a)))),radius:ratchet.halfThickness,kind:'ratchet'});}
  return nodes;
}
/** Detent potential E=.5*k*theta². Only dissipated contact work may enter this internal coordinate. */
export function applyRatchetWork(t:Top,angularImpulse:number,availableDissipation:number):number{
  const release=angularImpulse*t.profile.spin;if(release<=0||availableDissipation<=0)return 0;
  const ratchet=getRatchetGeometry(t.profile),relativeInertia=.5*(t.profile.mass*.12)*ratchet.radius**2;
  const stiffness=t.profile.lockStiffness??.014,releaseAngle=t.profile.lockReleaseAngle??.24,remaining=Math.max(0,.5*stiffness*(releaseAngle*releaseAngle-t.lock*t.lock));
  const work=Math.min(availableDissipation,release*release/(2*relativeInertia),remaining);
  t.lock=Math.sqrt(t.lock*t.lock+2*work/stiffness);return work;
}
export function contactRadius(t:Top,angle:number):number{const direction=inverseRotate(t.orientation,V(Math.cos(angle),0,Math.sin(angle)));const a=Math.atan2(direction.z,direction.x);return bladeRadiusAt(t.profile,a);}
export function resolveContact(a:Top,b:Top):number{
  const delta=sub(position(b),position(a));
  if(norm(delta)>a.profile.radius*(1+a.profile.contactLobeDepth)+b.profile.radius*(1+b.profile.contactLobeDepth)+.012)return 0;
  const shapeA=collisionNodes(a),shapeB=collisionNodes(b);
  let distance=Infinity,reach=0,deepest=0,nodeA:CollisionNode|null=null,nodeB:CollisionNode|null=null;
  for(const x of shapeA)for(const y of shapeB){const d=norm(sub(y.point,x.point)),overlap=x.radius+y.radius-d;if(overlap>deepest){deepest=overlap;distance=d;reach=x.radius+y.radius;nodeA=x;nodeB=y;}}
  if(!nodeA||!nodeB)return 0;const pa=nodeA.point,pb=nodeB.point,energyBefore=kineticEnergy(a)+kineticEnergy(b);
  const n=unit(sub(pb,pa),unit(delta,V(1,0,0))),contact=scale(add(pa,pb),.5);
  const ra=sub(contact,position(a)),rb=sub(contact,position(b)),invA=1/a.profile.mass,invB=1/b.profile.mass;
  const correction=(reach-distance)*.8;
  a.x-=n.x*correction*invA/(invA+invB);a.y-=n.y*correction*invA/(invA+invB);a.z-=n.z*correction*invA/(invA+invB);
  b.x+=n.x*correction*invB/(invA+invB);b.y+=n.y*correction*invB/(invA+invB);b.z+=n.z*correction*invB/(invA+invB);
  const relative=sub(pointVelocity(b,rb),pointVelocity(a,ra)),vn=dot(relative,n);
  if(vn>=0)return 0;
  const jn=-(1+clamp(Math.min(a.profile.restitution,b.profile.restitution),0,1))*vn/(contactMass(a,ra,n)+contactMass(b,rb,n));
  let impulse=scale(n,jn);applyImpulse(a,scale(impulse,-1),ra);applyImpulse(b,impulse,rb);
  const after=sub(pointVelocity(b,rb),pointVelocity(a,ra)),vt=sub(after,scale(n,dot(after,n))),speed=norm(vt);
  if(speed>1e-9){const tangent=scale(vt,1/speed),jt=Math.min(speed/(contactMass(a,ra,tangent)+contactMass(b,rb,tangent)),.25*jn),friction=scale(tangent,-jt);applyImpulse(a,scale(friction,-1),ra);applyImpulse(b,friction,rb);impulse=add(impulse,friction);}
  let dissipated=Math.max(0,energyBefore-kineticEnergy(a)-kineticEnergy(b));
  // Blade impacts do not become generic burst damage. Only actual exposed lower-ratchet contacts load the detent.
  if(nodeA.kind==='ratchet'){const work=applyRatchetWork(a,-dot(cross(ra,scale(impulse,-1)),bodyAxis(a)),nodeB.kind==='ratchet'?dissipated/2:dissipated);dissipated-=work;}
  if(nodeB.kind==='ratchet')applyRatchetWork(b,-dot(cross(rb,impulse),bodyAxis(b)),dissipated);
  return jn;
}

interface RailContact{point:Vec3;normal:Vec3;tangent:Vec3;distance:number;signedDistance:number;gearCenter:Vec3}
function nearestRail(t:Top):RailContact{
  const gearCenter=add(position(t),rotate(t.orientation,V(0,t.profile.gearHeight-t.centerOfMassHeight,0)));
  let best:RailContact={point:RAIL[0],normal:V(1,0,0),tangent:V(0,0,1),distance:Infinity,signedDistance:Infinity,gearCenter};
  for(let i=0;i<RAIL.length;i++){
    const a=RAIL[i],b=RAIL[(i+1)%RAIL.length],dx=b.x-a.x,dz=b.z-a.z,u=clamp(((gearCenter.x-a.x)*dx+(gearCenter.z-a.z)*dz)/(dx*dx+dz*dz),0,1);
    const point=V(a.x+dx*u,a.y+(b.y-a.y)*u,a.z+dz*u),diff=V(gearCenter.x-point.x,0,gearCenter.z-point.z),distance=norm(diff);
    if(distance<best.distance){const tangent=unit(V(dx,0,dz)),inward=V(-tangent.z,0,tangent.x);best={point,normal:inward,tangent,distance,signedDistance:dot(diff,inward),gearCenter};}
  }
  return best;
}
function eligibleAt(t:Top,c:RailContact):boolean{
  const p=t.profile,axis=bodyAxis(t);
  return p.railEligible&&Math.acos(clamp(axis.y,-1,1))<=STADIUM.railMaxTilt&&Math.abs(c.gearCenter.y-c.point.y)<.0045
    &&c.signedDistance<=p.gearRadius+.0005&&c.signedDistance>=-.0015&&Math.abs(t.omega)>30;
}
export function railEligible(t:Top):boolean{if(Math.hypot(t.x,t.z)<.14)return false;return eligibleAt(t,nearestRail(t));}
/** Energy-dissipating gear constraint at the actual transformed bit pitch contact. */
export function engageRail(t:Top,nx:number,nz:number):number{
  const normal=unit(V(nx,0,nz)),gearOffset=rotate(t.orientation,V(0,t.profile.gearHeight-t.centerOfMassHeight,0));
  const r=add(gearOffset,scale(normal,t.profile.gearRadius)),tangent=V(-normal.z,0,normal.x);
  const slip=dot(pointVelocity(t,r),tangent),j=-slip/contactMass(t,r,tangent)*clamp(t.profile.railGrip,0,1);
  applyImpulse(t,scale(tangent,j),r);return Math.abs(j);
}
function resolveRail(t:Top,battle:Battle,index:number,eventTick:number,dt:number,meshAllowed=true):void{
  if(Math.hypot(t.x,t.z)<.14&&!t.rail.engaged)return;
  const c=nearestRail(t),eligible=meshAllowed&&eligibleAt(t,c),before=totalEnergy(t),spinBefore=t.omega,velocityBefore=velocity(t),speedBefore=Math.hypot(t.vx,t.vz);
  if(eligible){
    const outward=scale(c.normal,-1),gearOffset=sub(c.gearCenter,position(t)),r=add(gearOffset,scale(outward,t.profile.gearRadius));
    const penetration=t.profile.gearRadius-c.signedDistance;
    if(penetration>0){t.x+=c.normal.x*penetration;t.z+=c.normal.z*penetration;}
    const vn=dot(pointVelocity(t,r),c.normal);if(vn<0)applyImpulse(t,scale(c.normal,-vn/contactMass(t,r,c.normal)),r);
    const j=engageRail(t,outward.x,outward.z);
    if(!t.rail.engaged){t.rail.engaged=true;t.rail.travel=0;t.rail.speedBefore=speedBefore;t.rail.spinBefore=spinBefore;t.rail.energyBefore=before;battle.events.push({tick:eventTick,kind:'rail-engage',top:index,intensity:j,position:position(t),energyBefore:before,energyAfter:totalEnergy(t),spinBefore,spinAfter:t.omega,velocityBefore,velocityAfter:velocity(t)});}
    t.rail.travel+=Math.hypot(t.vx,t.vz)*dt;t.rail.lastContactTick=eventTick;t.rail.contactPoint=c.point;t.rail.tangent=c.tangent;
  }else if(t.rail.engaged && (!meshAllowed || (eventTick-t.rail.lastContactTick)*STEP>.006)){
    t.rail.engaged=false;t.rail.lastReleaseTick=eventTick;t.railCooldown=0;
    battle.events.push({tick:eventTick,kind:'rail-release',top:index,position:position(t),velocity:velocity(t),energyBefore:t.rail.energyBefore,energyAfter:totalEnergy(t),spinBefore:t.rail.spinBefore,spinAfter:t.omega,travel:t.rail.travel});
    const radial=(t.x*t.vx+t.z*t.vz)/Math.max(.001,Math.hypot(t.x,t.z));
    const pathMiss=Math.abs(t.x*t.vz-t.z*t.vx)/Math.max(.001,Math.hypot(t.vx,t.vz));
    if(t.rail.travel>.03&&radial<-.8&&pathMiss<.12&&Math.hypot(t.vx,t.vz)>Math.max(.8,t.rail.speedBefore+.15)&&Math.abs(t.omega)<Math.abs(t.rail.spinBefore)){t.rail.dashCount++;battle.events.push({tick:eventTick,kind:'dash',top:index,intensity:Math.hypot(t.vx,t.vz),position:position(t),velocity:velocity(t),travel:t.rail.travel,spinBefore:t.rail.spinBefore,spinAfter:t.omega});}
  }
}

function eliminated(t:PhysicsTop,finish:Finish,tick:number){if(t.eliminated)return;t.eliminated=t.pendingFinish??finish;t.finishTick=t.pocketEnteredTick??tick;}
function staticCoverContact(t:Top,nearest:Vec3,envelope:number,restitution:number):void{
  const difference=sub(position(t),nearest),distance=norm(difference);if(distance>=envelope)return;
  const normal=unit(difference,V(0,t.vy>0?-1:1,0)),penetration=envelope-distance;
  t.x+=normal.x*penetration;t.y+=normal.y*penetration;t.z+=normal.z*penetration;
  const r=scale(normal,-envelope),vn=dot(pointVelocity(t,r),normal);if(vn<0)applyImpulse(t,scale(normal,-(1+restitution)*vn/contactMass(t,r,normal)),r);
}
function pocketSideContacts(t:Top,envelope:number):void{
  for(const p of STADIUM.pockets){
    const outward=V(Math.cos(p.angle),0,Math.sin(p.angle)),tangent=V(-outward.z,0,outward.x),center=position(t);
    const along=dot(center,outward),across=dot(center,tangent),width=STADIUM.radius*Math.sin(p.halfWidth),mouth=STADIUM.radius-.006;
    if(along<mouth-envelope||along>STADIUM.pocketOuterRadius+envelope)continue;
    for(const side of [-1,1]){
      const nearest=add(scale(outward,clamp(along,mouth,STADIUM.pocketOuterRadius)),scale(tangent,side*width));
      const difference=V(t.x-nearest.x,0,t.z-nearest.z),distance=norm(difference);
      if(distance>=envelope)continue;
      const normal=unit(difference,scale(tangent,-side)),penetration=envelope-distance;
      t.x+=normal.x*penetration;t.z+=normal.z*penetration;
      const r=scale(normal,-envelope),vn=dot(pointVelocity(t,r),normal);if(vn<0)applyImpulse(t,scale(normal,-1.2*vn/contactMass(t,r,normal)),r);
    }
  }
}
function stadium(t:PhysicsTop,battle:Battle,index:number,dt:number,eventTick:number){
  const envelope=t.profile.radius*(1+t.profile.contactLobeDepth);
  pocketSideContacts(t,envelope);
  const radius=Math.hypot(t.x,t.z);
  if(t.pendingFinish&&radius+envelope<STADIUM.radius){delete t.pendingFinish;delete t.pocketEnteredTick;delete t.pocketAngle;t.pocketRestTime=0;}
  let pocket=t.pocketAngle===undefined?undefined:STADIUM.pockets.find(p=>p.angle===t.pocketAngle);
  if(pocket){
    const along=t.x*Math.cos(pocket.angle)+t.z*Math.sin(pocket.angle);
    if(along+envelope<STADIUM.radius){delete t.pendingFinish;delete t.pocketEnteredTick;delete t.pocketAngle;t.pocketRestTime=0;pocket=undefined;}
  }
  if(!pocket){
    pocket=STADIUM.pockets.find(p=>{const along=t.x*Math.cos(p.angle)+t.z*Math.sin(p.angle),across=-t.x*Math.sin(p.angle)+t.z*Math.cos(p.angle);return along>STADIUM.radius-envelope&&Math.abs(across)<STADIUM.radius*Math.sin(p.halfWidth);});
    if(pocket)t.pocketAngle=pocket.angle;
  }
  if(pocket){
    const outward=V(Math.cos(pocket.angle),0,Math.sin(pocket.angle)),along=t.x*outward.x+t.z*outward.z,across=-t.x*outward.z+t.z*outward.x,width=STADIUM.radius*Math.sin(pocket.halfWidth);
    if(along-envelope>STADIUM.radius&&Math.abs(across)+envelope<=width+.0001&&!t.pendingFinish){t.pendingFinish=pocket.finish;t.pocketEnteredTick=eventTick;t.pocketRestTime=0;}
    // A physical pocket has an outer back wall. Changing azimuth never warps a body to the bowl rim.
    if(along+envelope>STADIUM.pocketOuterRadius){const correction=along+envelope-STADIUM.pocketOuterRadius;t.x-=outward.x*correction;t.z-=outward.z*correction;const normal=scale(outward,-1),r=scale(outward,envelope),vn=dot(pointVelocity(t,r),normal);if(vn<0)applyImpulse(t,scale(normal,-1.25*vn/contactMass(t,r,normal)),r);}
  }else{
    // Finite cylindrical cover: nearest-point contact also handles its top/bottom edges without radial warps.
    const radial=unit(V(t.x,0,t.z),V(1,0,0));
    const nearest=V(radial.x*STADIUM.coverRadius,clamp(t.y,STADIUM.bowlDepth,STADIUM.coverRoofHeight),radial.z*STADIUM.coverRadius);
    staticCoverContact(t,nearest,envelope,.35);
  }
  if(t.pendingFinish){t.pocketRestTime=(t.pocketRestTime??0)+(Math.hypot(t.vx,t.vz)<.06?dt:0);if((t.pocketRestTime??0)>.12||t.rotationStopped)eliminated(t,t.pendingFinish,t.pocketEnteredTick??eventTick);}
  // Finite annular roof: the opening edge has a diagonal/radial normal, not an artificial vertical snap.
  const roofRadius=clamp(Math.hypot(t.x,t.z),STADIUM.launchOpeningRadius,STADIUM.coverRadius),radial=unit(V(t.x,0,t.z),V(1,0,0));
  staticCoverContact(t,V(radial.x*roofRadius,STADIUM.coverRoofHeight,radial.z*roofRadius),envelope,.15);
  resolveRail(t,battle,index,eventTick,dt);
}
function resultFor(b:Battle):BattleResult|null{
  const tops=b.tops as [PhysicsTop,PhysicsTop];if(!tops[0].eliminated&&!tops[1].eliminated)return null;
  const candidates=tops.map((top,i)=>({top,i})).filter(({top})=>top.eliminated),earliest=Math.min(...candidates.map(({top})=>top.finishTick??b.tick));
  if(tops.some(t=>!t.eliminated&&t.pendingFinish&&(t.pocketEnteredTick??Infinity)<=earliest))return null;
  const first=candidates.filter(({top})=>(top.finishTick??b.tick)===earliest);
  if(first.length===2)return{winner:null,finish:'draw',points:0};const loser=first[0],finish=loser.top.eliminated!;return{winner:loser.i===0?1:0,finish,points:points[finish]};
}
export function stepBattle(b:Battle,dt=STEP):Battle{
  if(!Number.isFinite(dt)||dt<=0||dt>STEP+1e-10)throw new Error('Use fixed steps <= STEP');if(b.result)return b;
  b.tick++;
  // Bound rotation of each contact feature to 0.12 rad and translation to 1.5 mm.
  const fastest=Math.max(...b.tops.map(t=>norm(t.angularVelocity))),speed=Math.max(...b.tops.map(t=>norm(velocity(t))));
  const substeps=Math.min(64,Math.max(4,Math.ceil(fastest*dt/.12),Math.ceil(speed*dt/.0015))),h=dt/substeps;
  for(let i=0;i<substeps&&!b.result;i++){
    const tick=b.tick-1+(i+1)/substeps,tops=b.tops as [PhysicsTop,PhysicsTop];
    for(const t of tops)if(!t.eliminated){syncDerived(t);if(t.omega*t.profile.spin<=0)t.rotationStopped=true;t.railCooldown=Math.max(0,t.railCooldown-h);t.lock*=Math.exp(-.25*h);integrateFree(t,h);resolveFloor(t);}
    if(!tops[0].eliminated&&!tops[1].eliminated){const j=resolveContact(tops[0],tops[1]);if(j>0)b.events.push({tick,kind:'collision',intensity:j,position:scale(add(position(tops[0]),position(tops[1])),.5)});}
    for(let n=0;n<2;n++){
      const t=tops[n];if(t.eliminated)continue;
      if(t.lock>=(t.profile.lockReleaseAngle??.24)-1e-12)eliminated(t,'burst',tick);
      if(!t.eliminated)stadium(t,b,n,h,tick);
      if(t.omega*t.profile.spin<=0)t.rotationStopped=true;
      if(!t.eliminated&&t.rotationStopped)eliminated(t,t.pendingFinish??'spin',t.pocketEnteredTick??tick);
      if(t.eliminated)b.events.push({tick,kind:'finish',top:n,finish:t.eliminated});
      if(Math.hypot(t.x,t.z)>STADIUM.pocketOuterRadius+.06)b.result={winner:null,finish:'draw',points:0};
    }
    b.result=b.result??resultFor(b);
  }
  if(b.events.length>192)b.events.splice(0,b.events.length-192);return b;
}
