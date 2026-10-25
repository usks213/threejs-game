import {diagonalTensor,multiplyTensor,inverseTensor,positiveDefinite,combineMassComponents} from './inertia';
export {combineMassComponents,positiveDefinite} from './inertia';
import {bitHeightOffset,comHeight,gearHeightAt,getBitGeometry,bladeRadiusAt,bladeCenterHeightAt,canonicalBladeCenterHeightAt,getBladeOutline,getRatchetGeometry,getRatchetOutline,getRatchetVertices,getBladeVertices,getCenterOfMass,geometryToCOM,getCanonicalBladeVertices,getCanonicalRatchetVertices,getCanonicalBitVertices,getBladeMaterialGeometry} from './body-geometry';
export {bitHeightOffset,comHeight,gearHeightAt,getBitGeometry,bladeRadiusAt,bladeCenterHeightAt,canonicalBladeCenterHeightAt,getBladeOutline,getRatchetGeometry,getRatchetOutline,getRatchetVertices,getBladeVertices,getCenterOfMass,geometryToCOM,getCanonicalBladeVertices,getCanonicalRatchetVertices,getCanonicalBitVertices,getBladeMaterialGeometry} from './body-geometry';
import type { Battle, BattleResult, Finish, Launch, Profile, Top, Vec3, Quaternion, BurstFragment, BurstComponent, SymmetricTensor } from './types';
import { points } from './rules';

export const STEP=1/240;
const G=9.81;
/** Topology from official BX-17 manual p7. Dimensions remain explicit estimates, not CAD. */
export const STADIUM={
  radius:.22, coverRadius:.245, launchOpeningRadius:.155, coverRoofHeight:.16, bowlDepth:.012, bowlStiffness:2*G*.012/(.22*.22), wallHeight:.12,
  railRadius:.201,railHeightMin:.002,railHeightMax:.013,railMaxTilt:.65,
  railNotchDepth:.037,railNotchHalfAngle:.24,bankTransitionWidth:.006,bankHeight:.007,bankSlope:.25,bankOuterSlopeStart:.028,pocketOuterRadius:.325,pocketEntryRadius:.22,pocketRampLength:.03,pocketFloorHeight:-.006,
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
/** Estimated delivered work at a reference launcher setting; not an OEM launcher calibration. */
export const LAUNCH_REFERENCE={mass:.035,axialInertia:.55*.035*.024**2};
export function launchEnergyAt(power:number){const p=clamp(finite(power,.75),.05,1);return{rotational:.5*LAUNCH_REFERENCE.axialInertia*(170+440*p)**2,translational:.5*LAUNCH_REFERENCE.mass*((.45+1.45*p)**2+.12**2)};}
interface SurfaceSample{height:number;dx:number;dz:number;inPocket:boolean}
function floorSurface(x:number,z:number):SurfaceSample{
  const r2=x*x+z*z,R=STADIUM.radius,inside=r2<R*R,slope=inside?2*STADIUM.bowlDepth/(R*R):0;
  let base=STADIUM.bowlDepth*Math.min(r2/(R*R),1),baseX=slope*x,baseZ=slope*z;
  // Molded backing shoulder: a continuous surface behind, not a free-standing rail above a flat lane.
  if(r2>(STADIUM.railRadius-STADIUM.railNotchDepth)**2&&Math.sqrt(r2)>getRailRadiusAt(Math.atan2(z,x))){
    const c=nearestRailPlanar(x,z),d=-c.signedDistance;
    if(d>0){const u=clamp(d/STADIUM.bankTransitionWidth,0,1),blend=u*u*(3-2*u),derivative=6*u*(1-u)/STADIUM.bankTransitionWidth;
      const outer=Math.max(0,d-STADIUM.bankOuterSlopeStart),outerU=clamp(outer/STADIUM.bankTransitionWidth,0,1),outerBlend=outerU*outerU*(3-2*outerU),outerDerivative=6*outerU*(1-outerU)/STADIUM.bankTransitionWidth;
      const rise=blend*STADIUM.bankHeight+STADIUM.bankSlope*outer*outerBlend,gradient=derivative*STADIUM.bankHeight+STADIUM.bankSlope*(outerBlend+outer*outerDerivative);
      base+=rise;baseX-=c.normal.x*gradient;baseZ-=c.normal.z*gradient;}
  }
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
  return{height:base+difference*blend,dx:baseX*(1-blend)+difference*blendX,dz:baseZ*(1-blend)+difference*blendZ,inPocket:blend>0};
}
/** Continuous estimated lip/ramp surface: return motion meets a physical inclined normal, never an 18mm height teleport. */
export function pocketFloorAt(x:number,z:number):number|null{const sample=floorSurface(x,z);return sample.inPocket?sample.height:null;}
export function bowlHeightAt(x:number,z:number):number{return floorSurface(x,z).height;}
export function bowlNormalAt(x:number,z:number):Vec3{const sample=floorSurface(x,z);return unit(V(-sample.dx,1,-sample.dz));}
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
    return V(x,STADIUM.bowlDepth*Math.min((x*x+z*z)/(STADIUM.radius**2),1)+.007,z);
  });
}
const RAIL=getRailPath(),RAIL_ANGLES=RAIL.map(p=>Math.atan2(p.z,p.x));

export const bodyTensor=(t:Top):SymmetricTensor=>t.bodyInertiaTensor??diagonalTensor(t.bodyInertia.x,t.bodyInertia.y,t.bodyInertia.z);
export function inverseInertia(t:Top,v:Vec3,q=t.orientation):Vec3{return rotate(q,multiplyTensor(inverseTensor(bodyTensor(t)),inverseRotate(q,v)));}
function inertia(t:Top,v:Vec3):Vec3{return rotate(t.orientation,multiplyTensor(bodyTensor(t),inverseRotate(t.orientation,v)));}
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
    const optionalPositive=[p.transverseInertia,p.centerOfMassHeight,p.tipRadius,p.lockStiffness,p.lockReleaseAngle,p.bladeThickness,p.bladeEdgeSharpness,p.ratchetRadius,p.ratchetHalfThickness,p.gearEngagementBand];
    if(optionalPositive.some(v=>v!==undefined&&(!Number.isFinite(v)||v<=0))||![p.tipFriction??0,p.rollingDrag??0,p.bladeRampAmplitude??0,p.bladeSkew??0,p.bitHeightOffset??0,p.ratchetCenterHeight??0,p.ratchetLobes??0,p.ratchetLobeDepth??0,p.ratchetSkew??0,p.bitDiscRadius??0,p.bitDiscHeight??0,p.gearTeeth??12].every(Number.isFinite)||p.height<=0||p.contactLobes<1||p.contactLobeDepth<0||p.contactLobeDepth>.5)throw new Error('Invalid body/contact estimate');
    if(p.centerOfMass&&!Object.values(p.centerOfMass).every(Number.isFinite))throw new Error('Invalid center of mass');
    if(p.inertiaTensor&&!positiveDefinite(p.inertiaTensor))throw new Error('Inertia tensor must be positive definite');
    if(p.massComponents?.some(c=>!Number.isFinite(c.mass)||c.mass<=0||!Object.values(c.center).every(Number.isFinite)||!positiveDefinite(c.inertia)))throw new Error('Invalid component mass tensor');
    if(p.massComponents){const combined=combineMassComponents(p.massComponents),c=getCenterOfMass(p),tensor=p.inertiaTensor;
      if(Math.abs(combined.mass-p.mass)>p.mass*1e-9||norm(sub(combined.center,c))>1e-9||!tensor||Object.keys(tensor).some(k=>Math.abs(combined.inertia[k as keyof SymmetricTensor]-tensor[k as keyof SymmetricTensor])>Math.max(tensor.xx,tensor.yy,tensor.zz)*1e-8))throw new Error('Component mass/COM/tensor must reproduce assembly');}
    const l=launches[i],power=clamp(finite(l.power,.75),.05,1),angle=clamp(finite(l.angle,0),-Math.PI,Math.PI),tilt=clamp(finite(l.tilt,.12),0,.65),side=i===0?-1:1,direction=angle+(i===0?0:Math.PI);
    const speed=(.45+power*1.45)*Math.sqrt(LAUNCH_REFERENCE.mass/p.mass);
    const angularSpeed=(170+power*440)*Math.sqrt(LAUNCH_REFERENCE.axialInertia/(p.inertiaTensor?.yy??p.inertia));
    const yaw=i*Math.PI,tiltAxis=V(Math.sin(direction),0,-Math.cos(direction));
    const q=multiply(rotationVector(scale(tiltAxis,tilt)),rotationVector(V(0,yaw,0)));
    const center=comHeight(p),tip=p.tipRadius??.0015,transverse=p.transverseInertia??(.5*p.inertia+p.mass*(p.height*.35)**2/12);
    const t:PhysicsTop={profile:{...p},x:side*.105,y:0,z:side*.053,vx:Math.cos(direction)*speed,vy:-.12*Math.sqrt(LAUNCH_REFERENCE.mass/p.mass),vz:Math.sin(direction)*speed,orientation:q,angularMomentum:V(),angularVelocity:V(),bodyInertia:V(p.inertiaTensor?.xx??transverse,p.inertiaTensor?.yy??p.inertia,p.inertiaTensor?.zz??transverse),bodyInertiaTensor:p.inertiaTensor?{...p.inertiaTensor}:undefined,centerOfMassHeight:center,tipRadius:tip,omega:p.spin*angularSpeed,phase:yaw,tilt,tiltVelocity:0,lock:0,railCooldown:0,eliminated:null,rail:{engaged:false,travel:0,translationWork:0,rotationWork:0,contactPoint:null,tangent:null,lastContactTick:-1,lastReleaseTick:-1,dashCount:0,speedBefore:0,spinBefore:0,energyBefore:0}};
    const tipR=rotate(q,geometryToCOM(p,V(0,tip,0)));t.y=bowlHeightAt(t.x+tipR.x,t.z+tipR.z)-tipR.y+tip+.001;
    t.angularMomentum=inertia(t,scale(bodyAxis(t),t.omega));syncDerived(t);return t;
  }) as [PhysicsTop,PhysicsTop];
  return{tick:0,tops,events:[],result:null,fragments:[],settling:null};
}

/** Torque-free midpoint quaternion update: world L is fixed; ω follows changing R I⁻¹ Rᵀ. */
export function integrateFree(t:Top,dt:number,gravity=true,drag=true):void{
  if(gravity)t.vy-=G*dt;
  if(drag)t.angularMomentum=scale(t.angularMomentum,Math.exp(-Math.max(0,t.profile.drag)*dt));
  const tensor=bodyTensor(t),tensorScale=Math.max(tensor.xx,tensor.yy,tensor.zz),symmetric=Math.abs(tensor.xx-tensor.zz)<=tensorScale*1e-12&&Math.max(Math.abs(tensor.xy),Math.abs(tensor.xz),Math.abs(tensor.yz))<=tensorScale*1e-12;
  if(symmetric){
    // Exact torque-free symmetric-top propagator. World L and kinetic energy are conserved.
    const transverse=tensor.xx,axis=bodyAxis(t),axialMomentum=dot(t.angularMomentum,axis);
    const worldTurn=rotationVector(scale(t.angularMomentum,dt/transverse));
    const bodyTurn=rotationVector(V(0,axialMomentum*(1/tensor.yy-1/transverse)*dt,0));
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
  // Height-field vertical gap becomes signed normal distance on the local tangent plane.
  const penetration=(bowlHeightAt(world.x,world.z)-world.y)*normal.y;
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
    for(let i=0;i<4;i++){const a=i*Math.PI/2;impulse+=floorContact(t,geometryToCOM(p,V(tip*Math.cos(a),0,tip*Math.sin(a))),0,tip*.12,mu);}
    impulse+=floorContact(t,geometryToCOM(p,V(0,0,0)),0,tip*.3,mu);
  }else impulse+=floorContact(t,geometryToCOM(p,V(0,tip,0)),tip,tip*(shape==='needle'?.15:shape==='ball'?.12:.45),mu);
  // The metal body can scrape the floor when tilted. Contact torque causes wobble/fall naturally.
  if(t.tilt>.22||Math.hypot(t.x,t.z)+p.radius*(1+p.contactLobeDepth)>STADIUM.railRadius-STADIUM.railNotchDepth){const vertices=getBladeVertices(p,12);for(const vertex of vertices)impulse+=floorContact(t,vertex,0,.0005,.28);
    const ratchet=getRatchetGeometry(p);for(const point of getRatchetOutline(p,8))impulse+=floorContact(t,geometryToCOM(p,V(point.x,ratchet.centerHeight-ratchet.halfThickness,point.z)),0,.0003,.25);
    const bit=getBitGeometry(p);if(bit.discRadius>0)for(let i=0;i<8;i++){const a=i*Math.PI/4;impulse+=floorContact(t,geometryToCOM(p,V(bit.discRadius*Math.cos(a),bit.discHeight-bit.discHalfThickness,bit.discRadius*Math.sin(a))),0,.0004,p.tipFriction??p.grip);}
    impulse+=floorContact(t,geometryToCOM(p,V(0,p.height*.82+bitHeightOffset(p)+.01,0)),0,.0005,.28);
  }
  syncDerived(t);return impulse;
}

/** Blade collision shape is a ring of overlapping rounded lobes, rigidly transformed in full 3D. */
interface CollisionNode{point:Vec3;radius:number;kind:'blade'|'ratchet'|'bit'}
function collisionNodes(t:Top):CollisionNode[]{
  if(isFragment(t))return fragmentContactNodes(t);
  const sharp=['single-sword','sword','uppercut','broad-wing'].includes(t.profile.bladeStyle??'');
  // Smaller rounded edge nodes preserve pointed/stepped silhouettes; they remain a sampled approximation.
  const sampleRadius=Math.min((t.profile.bladeThickness??.009)/2,sharp?.0015:Infinity);
  const nodes:CollisionNode[]=getBladeOutline(t.profile,sharp?48:24).flatMap(v=>{
    const d=Math.hypot(v.x,v.z),s=(d-sampleRadius)/d;
    const center=bladeCenterHeightAt(t.profile,Math.atan2(v.z,v.x)),offset=(t.profile.bladeThickness??.009)/2-sampleRadius;
    return(sharp?[-offset,offset]:[0]).map(y=>({point:add(position(t),rotate(t.orientation,geometryToCOM(t.profile,V(v.x*s,center+y+comHeight(t.profile),v.z*s)))),radius:sampleRadius,kind:'blade' as const}));
  });
  const ratchet=getRatchetGeometry(t.profile);
  for(const point of getRatchetOutline(t.profile,16)){const radius=Math.hypot(point.x,point.z),scale=(radius-ratchet.halfThickness)/radius;nodes.push({point:add(position(t),rotate(t.orientation,geometryToCOM(t.profile,V(point.x*scale,ratchet.centerHeight,point.z*scale)))),radius:ratchet.halfThickness,kind:'ratchet'});}
  const bit=getBitGeometry(t.profile);
  if(bit.discRadius>0)for(let i=0;i<16;i++){const a=i*Math.PI/8,r=bit.discRadius-bit.discHalfThickness;nodes.push({point:add(position(t),rotate(t.orientation,geometryToCOM(t.profile,V(r*Math.cos(a),bit.discHeight,r*Math.sin(a))))),radius:bit.discHalfThickness,kind:'bit'});}
  return nodes;
}
/** Detent potential E=.5*k*theta². Only dissipated contact work may enter this internal coordinate. */
export function applyRatchetWork(t:Top,angularImpulse:number,availableDissipation:number):number{
  const release=angularImpulse*t.profile.spin;if(release<=0||availableDissipation<=0)return 0;
  const ratchet=getRatchetGeometry(t.profile),component=t.profile.massComponents?.find(c=>c.component==='ratchet'),relativeInertia=component?component.inertia.yy+component.mass*(component.center.x**2+component.center.z**2):.5*(t.profile.mass*.12)*ratchet.radius**2;
  const stiffness=t.profile.lockStiffness??.014,releaseAngle=t.profile.lockReleaseAngle??.24,remaining=Math.max(0,.5*stiffness*(releaseAngle*releaseAngle-t.lock*t.lock));
  const work=Math.min(availableDissipation,release*release/(2*relativeInertia),remaining);
  t.lock=Math.sqrt(t.lock*t.lock+2*work/stiffness);return work;
}
export function contactRadius(t:Top,angle:number):number{const direction=inverseRotate(t.orientation,V(Math.cos(angle),0,Math.sin(angle)));const a=Math.atan2(direction.z,direction.x);return bladeRadiusAt(t.profile,a);}
/** Detent twist is about the physical stem, unlike rigid-body torque about the COM. */
export function ratchetImpulseTwist(t:Top,contact:Vec3,impulse:Vec3,origin=position(t)):number{
  const pivot=add(origin,rotate(t.orientation,geometryToCOM(t.profile,V(0,getRatchetGeometry(t.profile).centerHeight,0))));
  return dot(cross(sub(contact,pivot),impulse),bodyAxis(t));
}
export function resolveContact(a:Top,b:Top,loadLocks=true):number{
  const delta=sub(position(b),position(a));
  if(norm(delta)>a.profile.radius*(1+a.profile.contactLobeDepth)+b.profile.radius*(1+b.profile.contactLobeDepth)+norm(getCenterOfMass(a.profile))+norm(getCenterOfMass(b.profile))+.012)return 0;
  const shapeA=collisionNodes(a),shapeB=collisionNodes(b);
  let distance=Infinity,reach=0,deepest=0,nodeA:CollisionNode|null=null,nodeB:CollisionNode|null=null;
  for(const x of shapeA)for(const y of shapeB){const d=norm(sub(y.point,x.point)),overlap=x.radius+y.radius-d;if(overlap>deepest){deepest=overlap;distance=d;reach=x.radius+y.radius;nodeA=x;nodeB=y;}}
  if(!nodeA||!nodeB)return 0;const pa=nodeA.point,pb=nodeB.point,energyBefore=kineticEnergy(a)+kineticEnergy(b);
  const n=unit(sub(pb,pa),unit(delta,V(1,0,0))),contact=scale(add(pa,pb),.5);
  const originA=position(a),originB=position(b),ra=sub(contact,originA),rb=sub(contact,originB),invA=1/a.profile.mass,invB=1/b.profile.mass;
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
  if(loadLocks&&nodeA.kind==='ratchet'&&!isFragment(a)){const work=applyRatchetWork(a,-ratchetImpulseTwist(a,contact,scale(impulse,-1),originA),nodeB.kind==='ratchet'?dissipated/2:dissipated);dissipated-=work;}
  if(loadLocks&&nodeB.kind==='ratchet'&&!isFragment(b))applyRatchetWork(b,-ratchetImpulseTwist(b,contact,impulse,originB),dissipated);
  return jn;
}

interface RailContact{point:Vec3;normal:Vec3;tangent:Vec3;distance:number;signedDistance:number;gearCenter:Vec3}
function railSegmentAt(angle:number):number{
  const a=Math.atan2(Math.sin(angle),Math.cos(angle));let lo=0,hi=RAIL_ANGLES.length;
  while(lo<hi){const m=(lo+hi)>>>1;if(RAIL_ANGLES[m]<=a)lo=m+1;else hi=m;}
  return(lo-1+RAIL.length)%RAIL.length;
}
/** Exact radial intersection of the star-shaped polygonal tooth line, with logarithmic lookup. */
export function getRailRadiusAt(angle:number):number{
  const i=railSegmentAt(angle),a=RAIL[i],b=RAIL[(i+1)%RAIL.length],x=Math.cos(angle),z=Math.sin(angle),dx=b.x-a.x,dz=b.z-a.z;
  return(a.x*dz-a.z*dx)/(x*dz-z*dx);
}
export function getBankSampleRadii(angle:number,offsets=[0,.0015,.003,.0045,.006]):number[]{
  const at=getRailRadiusAt(angle),radii:number[]=[];
  for(const target of offsets){if(target===0){radii.push(at);continue;}let lo=at,hi=STADIUM.coverRadius;for(let i=0;i<20;i++){const mid=(lo+hi)/2,gap=-nearestRailPlanar(Math.cos(angle)*mid,Math.sin(angle)*mid).signedDistance;if(gap<target)lo=mid;else hi=mid;}radii.push((lo+hi)/2);}
  return radii;
}
function nearestRailPlanar(x:number,z:number):Omit<RailContact,'gearCenter'>{
  const angle=Math.atan2(z,x),outside=Math.hypot(x,z)>getRailRadiusAt(angle),simple=outside&&Math.abs(angleDifference(angle,-Math.PI/2))>STADIUM.railNotchHalfAngle;
  let bestIndex=0,bestU=0,distance2=Infinity;const start=simple?railSegmentAt(angle):0,end=simple?start+1:RAIL.length;
  for(let i=start;i<end;i++){const a=RAIL[i],b=RAIL[(i+1)%RAIL.length],dx=b.x-a.x,dz=b.z-a.z,u=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1),ex=x-a.x-dx*u,ez=z-a.z-dz*u,d=ex*ex+ez*ez;if(d<distance2){distance2=d;bestIndex=i;bestU=u;}}
  const a=RAIL[bestIndex],b=RAIL[(bestIndex+1)%RAIL.length],point=V(a.x+(b.x-a.x)*bestU,a.y+(b.y-a.y)*bestU,a.z+(b.z-a.z)*bestU),tangent=unit(V(b.x-a.x,0,b.z-a.z)),distance=Math.sqrt(distance2);
  // The path is star-shaped; ray intersection disambiguates concave segment endpoints.
  const sign=outside?-1:1;
  const normal=distance>1e-10?scale(V(x-point.x,0,z-point.z),sign/distance):V(-tangent.z,0,tangent.x);
  return{point,normal,tangent,distance,signedDistance:sign*distance};
}
function nearestRail(t:Top):RailContact{
  const gearCenter=add(position(t),rotate(t.orientation,geometryToCOM(t.profile,V(0,gearHeightAt(t.profile),0))));
  return{...nearestRailPlanar(gearCenter.x,gearCenter.z),gearCenter};
}
interface GearManifold {rail:RailContact;point:Vec3;normal:Vec3;gap:number;side:boolean;localY:number;r:Vec3;normalSpeed:number}
function gearManifold(t:Top,c=nearestRail(t)):GearManifold{
  const half=t.profile.gearEngagementBand??.0045,point=V(c.point.x,clamp(c.gearCenter.y,c.point.y-.001,c.point.y+.001),c.point.z);
  const local=inverseRotate(t.orientation,sub(point,c.gearCenter)),radial=Math.hypot(local.x,local.z),radialGap=radial-t.profile.gearRadius,axialGap=Math.abs(local.y)-half,side=radialGap>=axialGap;
  const localNormal=side?V(-local.x/Math.max(radial,1e-12),0,-local.z/Math.max(radial,1e-12)):V(0,-Math.sign(local.y||1),0),normal=rotate(t.orientation,localNormal),r=sub(point,position(t));
  return{rail:c,point,normal,gap:Math.max(radialGap,axialGap),side,localY:local.y,r,normalSpeed:dot(pointVelocity(t,r),normal)};
}
function eligibleAt(t:Top,c:RailContact):boolean{
  const p=t.profile,m=gearManifold(t,c);
  return p.railEligible&&t.tilt<=STADIUM.railMaxTilt&&Math.abs(t.omega)>30&&c.signedDistance>=0
    &&m.side&&Math.abs(m.localY)<=(p.gearEngagementBand??.0045)&&m.gap<=.00005&&m.normalSpeed<=.00001;
}
export function railEligible(t:Top):boolean{if(Math.hypot(t.x,t.z)<.14)return false;return eligibleAt(t,nearestRail(t));}
export function getRailContactState(t:Top){const m=gearManifold(t);return{point:m.point,normal:m.normal,gap:m.gap,side:m.side,inside:m.rail.signedDistance>=0,normalSpeed:m.normalSpeed,meshEligible:eligibleAt(t,m.rail)};}
/** Energy-dissipating gear constraint at the actual transformed bit pitch contact. */
export function engageRail(t:Top,nx:number,nz:number):number{
  const normal=unit(V(nx,0,nz)),gearOffset=rotate(t.orientation,geometryToCOM(t.profile,V(0,gearHeightAt(t.profile),0)));
  const r=add(gearOffset,scale(normal,t.profile.gearRadius)),tangent=V(-normal.z,0,normal.x);
  const slip=dot(pointVelocity(t,r),tangent),j=-slip/contactMass(t,r,tangent)*clamp(t.profile.railGrip,0,1);
  applyImpulse(t,scale(tangent,j),r);return Math.abs(j);
}
/** Solid finite gear/rail contact is independent of whether teeth can mesh.
 * Closest rail-strip point is tested against the transformed finite gear cylinder.
 * The cylinder's nearest exit face handles top/bottom re-entry without a sideways snap.
 */
function applyRailContact(t:Top,m:GearManifold,meshRequested:boolean):{mesh:boolean;gearImpulse:number;translationWork:number;rotationWork:number}{
  if(m.gap>.00005)return{mesh:false,gearImpulse:0,translationWork:0,rotationWork:0};
  if(m.gap<0){t.x-=m.normal.x*m.gap;t.y-=m.normal.y*m.gap;t.z-=m.normal.z*m.gap;}
  const n=m.normal,r=m.r,v=pointVelocity(t,r),vn=dot(v,n),knn=contactMass(t,r,n);let jn=Math.max(0,-vn/knn),jt=0;
  const tangent=unit(sub(m.rail.tangent,scale(n,dot(m.rail.tangent,n))));
  if(meshRequested){
    // Projected 2×2 contact solve. Tangential gearing and normal support share the SAME contact arm.
    // The compensating normal impulse is never tensile; reducing jt preserves unilateral contact.
    const knt=dot(n,cross(inverseInertia(t,cross(r,tangent)),r))+dot(n,tangent)/t.profile.mass;
    const ktt=contactMass(t,r,tangent),effective=ktt-knt*knt/knn,vt=dot(v,tangent)+knt*jn;
    jt=-vt/effective*clamp(t.profile.railGrip,0,1);
    let normalCorrection=-knt*jt/knn;
    if(jn+normalCorrection<0){const fraction=jn/(-normalCorrection);jt*=fraction;normalCorrection=-jn;}
    const translationBefore=.5*t.profile.mass*dot(velocity(t),velocity(t)),rotationBefore=kineticEnergy(t)-translationBefore;
    jn+=normalCorrection;applyImpulse(t,add(scale(n,jn),scale(tangent,jt)),r);
    const translationAfter=.5*t.profile.mass*dot(velocity(t),velocity(t)),rotationAfter=kineticEnergy(t)-translationAfter;
    // Geometric rolling contact persists even when matched velocity needs zero impulse.
    return{mesh:true,gearImpulse:Math.abs(jt),translationWork:translationAfter-translationBefore,rotationWork:rotationAfter-rotationBefore};
  }
  if(jn>0){applyImpulse(t,scale(n,jn),r);const after=pointVelocity(t,r),vt=sub(after,scale(n,dot(after,n))),speed=norm(vt);if(speed>1e-9){const direction=scale(vt,1/speed),friction=Math.min(speed/contactMass(t,r,direction),.25*jn);applyImpulse(t,scale(direction,-friction),r);}}
  return{mesh:false,gearImpulse:0,translationWork:0,rotationWork:0};
}
export function resolveRailSolid(t:Top):boolean{
  const m=gearManifold(t);if(m.gap>=0)return false;applyRailContact(t,m,false);return true;
}
function resolveRail(t:Top,battle:Battle,index:number,eventTick:number,dt:number,meshAllowed=true):void{
  if(Math.hypot(t.x,t.z)<.14&&!t.rail.engaged)return;
  const before=totalEnergy(t),spinBefore=t.omega,velocityBefore=velocity(t),speedBefore=Math.hypot(t.vx,t.vz);
  const c=nearestRail(t),manifold=gearManifold(t,c),eligible=meshAllowed&&eligibleAt(t,c),contact=applyRailContact(t,manifold,eligible);
  if(contact.mesh){
    const j=contact.gearImpulse;
    if(!t.rail.engaged){t.rail.engaged=true;t.rail.travel=0;t.rail.translationWork=0;t.rail.rotationWork=0;t.rail.speedBefore=speedBefore;t.rail.spinBefore=spinBefore;t.rail.energyBefore=before;battle.events.push({tick:eventTick,kind:'rail-engage',top:index,intensity:j,position:position(t),energyBefore:before,energyAfter:totalEnergy(t),spinBefore,spinAfter:t.omega,velocityBefore,velocityAfter:velocity(t)});}
    t.rail.translationWork=(t.rail.translationWork??0)+contact.translationWork;t.rail.rotationWork=(t.rail.rotationWork??0)+contact.rotationWork;
    t.rail.travel+=Math.hypot(t.vx,t.vz)*dt;t.rail.lastContactTick=eventTick;t.rail.contactPoint=c.point;t.rail.tangent=c.tangent;
  }else if(t.rail.engaged){
    t.rail.engaged=false;t.rail.lastReleaseTick=eventTick;t.railCooldown=0;
    battle.events.push({tick:eventTick,kind:'rail-release',top:index,position:position(t),velocity:velocity(t),energyBefore:t.rail.energyBefore,energyAfter:totalEnergy(t),spinBefore:t.rail.spinBefore,spinAfter:t.omega,travel:t.rail.travel,translationWork:t.rail.translationWork,rotationWork:t.rail.rotationWork});
    const radial=(t.x*t.vx+t.z*t.vz)/Math.max(.001,Math.hypot(t.x,t.z));
    const pathMiss=Math.abs(t.x*t.vz-t.z*t.vx)/Math.max(.001,Math.hypot(t.vx,t.vz));
    // One tooth pitch is a documented event proxy, not a tooth-phase simulation. Signed NET work
    // must show rotation→translation transfer; inward deflection alone never manufactures a dash.
    const pitch=2*Math.PI*t.profile.gearRadius/(t.profile.gearTeeth??12);
    if(t.rail.travel>=pitch&&radial<-.8&&pathMiss<.12&&Math.hypot(t.vx,t.vz)>.8&&(t.rail.translationWork??0)>1e-6&&(t.rail.rotationWork??0)<-1e-6){t.rail.dashCount++;battle.events.push({tick:eventTick,kind:'dash',top:index,intensity:Math.hypot(t.vx,t.vz),position:position(t),velocity:velocity(t),travel:t.rail.travel,spinBefore:t.rail.spinBefore,spinAfter:t.omega,translationWork:t.rail.translationWork,rotationWork:t.rail.rotationWork});}
  }
}

function eliminated(t:PhysicsTop,finish:Finish,tick:number){if(t.eliminated)return;t.eliminated=t.pendingFinish??finish;t.finishTick=t.pocketEnteredTick??tick;}
/** Sampled complete rigid-body support geometry in world space, used for whole-body pocket entry. */
export function getWorldBodyVertices(t:Top,samples=24):Vec3[]{
  const local=isFragment(t)?getFragmentVertices(t,samples):[...getCanonicalBladeVertices(t.profile,samples),...getCanonicalRatchetVertices(t.profile,samples),...getCanonicalBitVertices(t.profile,samples)].map(v=>geometryToCOM(t.profile,v));
  return local.map(v=>add(position(t),rotate(t.orientation,v)));
}
/** Bounding cover contacts are centred on the physical geometry, not a displaced mass centre. */
function coverCenter(t:Top):Vec3{
  const p=isFragment(t)?t.assemblyProfile:t.profile;
  const y=isFragment(t)&&t.component==='ratchet'?getRatchetGeometry(p).centerHeight:isFragment(t)&&t.component==='bit'?getBitGeometry(p).gearHeight:p.height*.82+bitHeightOffset(p);
  let local=geometryToCOM(p,V(0,y,0));if(isFragment(t))local=sub(local,t.componentLocalCenter);
  return add(position(t),rotate(t.orientation,local));
}
function staticCoverContact(t:Top,nearest:Vec3,envelope:number,restitution:number):void{
  const center=coverCenter(t),difference=sub(center,nearest),distance=norm(difference);if(distance>=envelope)return;
  const normal=unit(difference,V(0,t.vy>0?-1:1,0)),penetration=envelope-distance;
  t.x+=normal.x*penetration;t.y+=normal.y*penetration;t.z+=normal.z*penetration;
  const r=sub(sub(coverCenter(t),position(t)),scale(normal,envelope)),vn=dot(pointVelocity(t,r),normal);if(vn<0)applyImpulse(t,scale(normal,-(1+restitution)*vn/contactMass(t,r,normal)),r);
}
function pocketSideContacts(t:Top,envelope:number):void{
  for(const p of STADIUM.pockets){
    const outward=V(Math.cos(p.angle),0,Math.sin(p.angle)),tangent=V(-outward.z,0,outward.x),center=coverCenter(t);
    const along=dot(center,outward),across=dot(center,tangent),width=STADIUM.radius*Math.sin(p.halfWidth),mouth=STADIUM.radius-.006;
    if(along<mouth-envelope||along>STADIUM.pocketOuterRadius+envelope)continue;
    for(const side of [-1,1]){
      const nearest=add(scale(outward,clamp(along,mouth,STADIUM.pocketOuterRadius)),scale(tangent,side*width));
      const difference=V(center.x-nearest.x,0,center.z-nearest.z),distance=norm(difference);
      if(distance>=envelope)continue;
      const normal=unit(difference,scale(tangent,-side)),penetration=envelope-distance;
      t.x+=normal.x*penetration;t.z+=normal.z*penetration;
      const r=sub(sub(coverCenter(t),position(t)),scale(normal,envelope)),vn=dot(pointVelocity(t,r),normal);if(vn<0)applyImpulse(t,scale(normal,-1.2*vn/contactMass(t,r,normal)),r);
    }
  }
}
function stadium(t:PhysicsTop,battle:Battle,index:number,dt:number,eventTick:number){
  const envelope=t.profile.radius*(1+t.profile.contactLobeDepth);
  pocketSideContacts(t,envelope);
  const center=coverCenter(t),radius=Math.hypot(center.x,center.z);
  if(t.pendingFinish&&radius<STADIUM.radius&&getWorldBodyVertices(t).every(v=>Math.hypot(v.x,v.z)<STADIUM.radius)){delete t.pendingFinish;delete t.pocketEnteredTick;delete t.pocketAngle;t.pocketRestTime=0;}
  let pocket=t.pocketAngle===undefined?undefined:STADIUM.pockets.find(p=>p.angle===t.pocketAngle);
  if(pocket){
    const along=center.x*Math.cos(pocket.angle)+center.z*Math.sin(pocket.angle);
    if(along<STADIUM.radius&&getWorldBodyVertices(t).every(v=>v.x*Math.cos(pocket!.angle)+v.z*Math.sin(pocket!.angle)<STADIUM.radius)){delete t.pendingFinish;delete t.pocketEnteredTick;delete t.pocketAngle;t.pocketRestTime=0;pocket=undefined;}
  }
  if(!pocket){
    pocket=STADIUM.pockets.find(p=>{const along=center.x*Math.cos(p.angle)+center.z*Math.sin(p.angle),across=-center.x*Math.sin(p.angle)+center.z*Math.cos(p.angle);return along>STADIUM.radius-envelope&&Math.abs(across)<STADIUM.radius*Math.sin(p.halfWidth);});
    if(pocket)t.pocketAngle=pocket.angle;
  }
  if(pocket){
    const outward=V(Math.cos(pocket.angle),0,Math.sin(pocket.angle)),along=center.x*outward.x+center.z*outward.z,across=-center.x*outward.z+center.z*outward.x,width=STADIUM.radius*Math.sin(pocket.halfWidth);
    if(along>STADIUM.radius&&!t.pendingFinish&&getWorldBodyVertices(t).every(v=>v.x*outward.x+v.z*outward.z>STADIUM.radius&&Math.abs(-v.x*outward.z+v.z*outward.x)<=width+.0001)){t.pendingFinish=pocket.finish;t.pocketEnteredTick=eventTick;t.pocketRestTime=0;}
    // A physical pocket has an outer back wall. Changing azimuth never warps a body to the bowl rim.
    if(along+envelope>STADIUM.pocketOuterRadius){const correction=along+envelope-STADIUM.pocketOuterRadius;t.x-=outward.x*correction;t.z-=outward.z*correction;const normal=scale(outward,-1),r=add(sub(coverCenter(t),position(t)),scale(outward,envelope)),vn=dot(pointVelocity(t,r),normal);if(vn<0)applyImpulse(t,scale(normal,-1.25*vn/contactMass(t,r,normal)),r);}
  }else{
    // Finite cylindrical cover: nearest-point contact also handles its top/bottom edges without radial warps.
    const radial=unit(V(center.x,0,center.z),V(1,0,0));
    const nearest=V(radial.x*STADIUM.coverRadius,clamp(center.y,STADIUM.bowlDepth,STADIUM.coverRoofHeight),radial.z*STADIUM.coverRadius);
    staticCoverContact(t,nearest,envelope,.35);
  }
  if(t.pendingFinish){t.pocketRestTime=(t.pocketRestTime??0)+(Math.hypot(t.vx,t.vz)<.06?dt:0);if((t.pocketRestTime??0)>.12||t.rotationStopped)eliminated(t,t.pendingFinish,t.pocketEnteredTick??eventTick);}
  // Finite annular roof: the opening edge has a diagonal/radial normal, not an artificial vertical snap.
  const roofRadius=clamp(Math.hypot(center.x,center.z),STADIUM.launchOpeningRadius,STADIUM.coverRadius),radial=unit(V(center.x,0,center.z),V(1,0,0));
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
/** Controlled single-body floor experiment. No opponent, rail/cover, score, or Battle.result is involved.
 * Uses the same adaptive rigid-body integration and floor contacts as a match. For spin-down comparisons,
 * initialise each body at the same explicit position/orientation and delivered launch work; report this
 * floor-only fixture separately from full-stadium orbit or matchup results.
 */
export function stepIsolatedTop(top:Top,dt=STEP):Top{
  if(!Number.isFinite(dt)||dt<=0||dt>STEP+1e-10)throw new Error('Use fixed steps <= STEP');
  if(top.eliminated)return top;
  const t=top as PhysicsTop,fastest=norm(t.angularVelocity),speed=norm(velocity(t));
  const substeps=Math.min(64,Math.max(4,Math.ceil(fastest*dt/.12),Math.ceil(speed*dt/.0015))),h=dt/substeps;
  for(let i=0;i<substeps&&!t.eliminated;i++){
    syncDerived(t);if(t.omega*t.profile.spin<=0)t.rotationStopped=true;
    t.railCooldown=Math.max(0,t.railCooldown-h);t.lock*=Math.exp(-.25*h);
    integrateFree(t,h);resolveFloor(t);
    if(t.rotationStopped||t.omega*t.profile.spin<=0){t.rotationStopped=true;t.eliminated='spin';}
  }
  return t;
}

export function stepBattle(b:Battle,dt=STEP):Battle{
  if(!Number.isFinite(dt)||dt<=0||dt>STEP+1e-10)throw new Error('Use fixed steps <= STEP');if(b.result)return stepSettlingBattle(b,dt);
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
      if(t.lock>=(t.profile.lockReleaseAngle??.24)-1e-12){splitBurstTop(b,n as 0|1,tick);eliminated(t,'burst',tick);}
      if(!t.eliminated)stadium(t,b,n,h,tick);
      if(t.omega*t.profile.spin<=0)t.rotationStopped=true;
      if(!t.eliminated&&t.rotationStopped)eliminated(t,t.pendingFinish??'spin',t.pocketEnteredTick??tick);
      if(t.eliminated)b.events.push({tick,kind:'finish',top:n,finish:t.eliminated});
      if(Math.hypot(t.x,t.z)>STADIUM.pocketOuterRadius+.06)b.result={winner:null,finish:'draw',points:0};
    }
    b.result=b.result??resultFor(b);
    if(b.result&&!b.settling)b.settling={elapsed:0,remaining:SETTLING_SECONDS};
  }
  if(b.events.length>192)b.events.splice(0,b.events.length-192);return b;
}

export const SETTLING_SECONDS=2.5;
const isFragment=(t:Top):t is BurstFragment=>'componentLocalCenter' in t;
/** Shared physical component geometry, relative to its own estimated COM. */
export function getFragmentVertices(fragment:BurstFragment,samples=24):Vec3[]{
  const p=fragment.assemblyProfile,center=fragment.componentLocalCenter;
  const vertices=fragment.component==='blade'?getCanonicalBladeVertices(p,samples):fragment.component==='ratchet'?getCanonicalRatchetVertices(p,samples):getCanonicalBitVertices(p,samples);
  return vertices.map(v=>sub(geometryToCOM(p,v),center));
}
function fragmentContactNodes(fragment:BurstFragment):CollisionNode[]{
  // Small rounded samples approximate each released shell, never an invisible whole-top sphere.
  return getFragmentVertices(fragment,12).map(local=>({point:add(position(fragment),rotate(fragment.orientation,local)),radius:.0005,kind:fragment.component}));
}
/** Momentum-exact rigid-body partition. No random impulse; stored detent work is dissipated.
 * New profiles use their source geometry-integrated component COMs/tensors unchanged. Legacy diagonal
 * fixtures alone use a compatibility partition; no complete-top inertia is duplicated across pieces.
 */
export function splitBurstTop(b:Battle,index:0|1,eventTick=b.tick):BurstFragment[]{
  const top=b.tops[index];if(top.profile.burstSeparationSupported===false)return [];if(top.separated)return (b.fragments??[]).filter(f=>f.sourceTop===index);
  const p=top.profile,kinds:BurstComponent[]=['blade','ratchet','bit'];
  const estimates=p.componentMasses??{blade:p.mass*.77,ratchet:p.mass*.16,bit:p.mass*.07};
  const sum=kinds.reduce((s,k)=>s+estimates[k],0),masses=kinds.map(k=>p.mass*estimates[k]/sum);
  const nominal=[p.height*.82+bitHeightOffset(p)-top.centerOfMassHeight,getRatchetGeometry(p).centerHeight-top.centerOfMassHeight,.005+bitHeightOffset(p)-top.centerOfMassHeight];
  const mean=nominal.reduce((s,y,i)=>s+y*masses[i],0)/p.mass;
  let offsets=nominal.map(y=>y-mean),parallel=offsets.reduce((s,y,i)=>s+masses[i]*y*y,0);
  // Uncalibrated custom tensors can be incompatible with geometric COM spacing. Preserve positive
  // inertias and the original assembly tensor by shortening only the estimated mass-centre spacing.
  const available=Math.min(top.bodyInertia.x,top.bodyInertia.z)*.8;
  if(parallel>available){const factor=Math.sqrt(available/parallel);offsets=offsets.map(y=>y*factor);parallel=available;}
  const weights=p.componentAxialWeights??{blade:masses[0]*p.radius*p.radius,ratchet:masses[1]*getRatchetGeometry(p).radius**2,bit:masses[2]*p.gearRadius**2};
  const weightSum=kinds.reduce((s,k)=>s+weights[k],0),before=totalEnergy(top);
  const components=p.massComponents??kinds.map((component,i)=>({component,mass:masses[i],center:add(getCenterOfMass(p),V(0,offsets[i],0)),inertia:{xx:(bodyTensor(top).xx-parallel)*weights[component]/weightSum,yy:bodyTensor(top).yy*weights[component]/weightSum,zz:(bodyTensor(top).zz-parallel)*weights[component]/weightSum,xy:bodyTensor(top).xy*weights[component]/weightSum,xz:bodyTensor(top).xz*weights[component]/weightSum,yz:bodyTensor(top).yz*weights[component]/weightSum}}));
  const fragments=components.map((part):BurstFragment=>{
    const component=part.component,localCenter=geometryToCOM(p,part.center),r=rotate(top.orientation,localCenter),world=add(position(top),r),v=add(velocity(top),cross(top.angularVelocity,r)),tensor=part.inertia;
    const fragment:BurstFragment={...structuredClone(top),id:`${index}:${component}`,sourceTop:index,component,assemblyProfile:{...p},componentLocalCenter:localCenter,centerOfMassHeight:part.center.y,
      x:world.x,y:world.y,z:world.z,vx:v.x,vy:v.y,vz:v.z,profile:{...p,mass:part.mass,inertia:tensor.yy,transverseInertia:tensor.xx,centerOfMass:part.center,inertiaTensor:tensor,massComponents:undefined,railEligible:false},bodyInertia:V(tensor.xx,tensor.yy,tensor.zz),bodyInertiaTensor:{...tensor},
      angularMomentum:V(),lock:0,eliminated:null,separated:false,rail:{...top.rail,engaged:false,contactPoint:null,tangent:null}};
    fragment.angularMomentum=inertia(fragment,top.angularVelocity);syncDerived(fragment);return fragment;
  });
  top.separated=true;top.rail.engaged=false;top.lock=0;b.fragments??=[];b.fragments.push(...fragments);
  b.events.push({tick:eventTick,kind:'burst-split',top:index,position:position(top),energyBefore:before,energyAfter:fragments.reduce((s,f)=>s+totalEnergy(f),0)});
  return fragments;
}
function resolveFragmentFloor(fragment:BurstFragment):void{
  for(const vertex of getFragmentVertices(fragment,12))floorContact(fragment,vertex,0,.00015,fragment.component==='bit'?(fragment.profile.tipFriction??.25):.28);
}
function settlingBoundary(t:Top):void{
  const envelope=isFragment(t)?Math.max(...getFragmentVertices(t,12).map(v=>Math.hypot(v.x,v.z))):t.profile.radius*(1+t.profile.contactLobeDepth);
  pocketSideContacts(t,envelope);
  const center=coverCenter(t);
  const pocket=STADIUM.pockets.find(p=>center.x*Math.cos(p.angle)+center.z*Math.sin(p.angle)>STADIUM.radius-envelope&&Math.abs(-center.x*Math.sin(p.angle)+center.z*Math.cos(p.angle))<STADIUM.radius*Math.sin(p.halfWidth));
  const radial=unit(V(center.x,0,center.z),V(1,0,0));
  if(!pocket)staticCoverContact(t,V(radial.x*STADIUM.coverRadius,clamp(center.y,STADIUM.bowlDepth,STADIUM.coverRoofHeight),radial.z*STADIUM.coverRadius),envelope,.2);
  else{
    const normal=V(-Math.cos(pocket.angle),0,-Math.sin(pocket.angle)),along=-center.x*normal.x-center.z*normal.z,penetration=along+envelope-STADIUM.pocketOuterRadius;
    if(penetration>0){t.x+=normal.x*penetration;t.z+=normal.z*penetration;const r=sub(sub(coverCenter(t),position(t)),scale(normal,envelope)),vn=dot(pointVelocity(t,r),normal);if(vn<0)applyImpulse(t,scale(normal,-vn/contactMass(t,r,normal)),r);}
  }
  const roofRadius=clamp(Math.hypot(center.x,center.z),STADIUM.launchOpeningRadius,STADIUM.coverRadius);
  staticCoverContact(t,V(radial.x*roofRadius,STADIUM.coverRoofHeight,radial.z*roofRadius),envelope,.1);
}
/** Unscored observation after the first finish. Result/finish events are never recalculated. */
export function stepSettlingBattle(b:Battle,dt=STEP):Battle{
  if(!Number.isFinite(dt)||dt<=0||dt>STEP+1e-10)throw new Error('Use fixed steps <= STEP');
  if(!b.result||!b.settling||b.settling.remaining<=0)return b;
  const duration=Math.min(dt,b.settling.remaining),bodies:Top[]=[...b.tops.filter(t=>!t.separated),...(b.fragments??[])];
  const fastest=Math.max(0,...bodies.map(t=>norm(t.angularVelocity))),speed=Math.max(0,...bodies.map(t=>norm(velocity(t))));
  const substeps=Math.min(64,Math.max(4,Math.ceil(fastest*duration/.12),Math.ceil(speed*duration/.0015))),h=duration/substeps;
  b.tick++;
  for(let i=0;i<substeps;i++){
    for(const body of bodies){integrateFree(body,h);if(isFragment(body))resolveFragmentFloor(body);else resolveFloor(body);settlingBoundary(body);}
    for(let a=0;a<bodies.length;a++)for(let c=a+1;c<bodies.length;c++)resolveContact(bodies[a],bodies[c],false);
  }
  b.settling.elapsed=Math.min(SETTLING_SECONDS,b.settling.elapsed+duration);b.settling.remaining=Math.max(0,SETTLING_SECONDS-b.settling.elapsed);
  if(b.settling.remaining<1e-10)b.settling.remaining=0;
  return b;
}
