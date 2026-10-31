import {diagonalTensor,multiplyTensor,inverseTensor,positiveDefinite,combineMassComponents} from './inertia';
export {combineMassComponents,positiveDefinite} from './inertia';
import {bitHeightOffset,comHeight,gearHeightAt,getBitGeometry,bladeRadiusAt,bladeCenterHeightAt,canonicalBladeCenterHeightAt,getBladeOutline,getRatchetGeometry,getRatchetOutline,getRatchetVertices,getBladeVertices,getCenterOfMass,geometryToCOM,getCanonicalBladeVertices,getCanonicalRatchetVertices,getCanonicalBitVertices,getBladeMaterialGeometry} from './body-geometry';
export {bitHeightOffset,comHeight,gearHeightAt,getBitGeometry,bladeRadiusAt,bladeCenterHeightAt,canonicalBladeCenterHeightAt,getBladeOutline,getRatchetGeometry,getRatchetOutline,getRatchetVertices,getBladeVertices,getCenterOfMass,geometryToCOM,getCanonicalBladeVertices,getCanonicalRatchetVertices,getCanonicalBitVertices,getBladeMaterialGeometry} from './body-geometry';
import type { Battle, BattleResult, Finish, Launch, Profile, Top, Vec3, Quaternion, BurstFragment, BurstComponent, SymmetricTensor } from './types';
import { points } from './rules';
import { defaultLaunchPosition, validLaunchPosition } from './launch-position';

export const STEP=1/240;
const G=9.81;
/** Topology from official BX-17 manual p7. Dimensions remain explicit estimates, not CAD. */
export const STADIUM={
  // Bowl depth raised .012 -> .020 on 2026-10-31 (round 3): at 12 mm a
  // stamina top orbited at r .11-.16 m for 40+ s without ever gathering to
  // the center, while the real X stadium's dish visibly pulls beys inward
  // as they slow. 20 mm (rim slope ~10 deg) is still an estimate, not CAD,
  // and the rendered floor uses the same bowlHeightAt, so sight and physics
  // stay in agreement.
  radius:.22, coverRadius:.245, launchOpeningRadius:.155, coverRoofHeight:.16, bowlDepth:.020, bowlStiffness:2*G*.020/(.22*.22), wallHeight:.12,
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
export function launchEnergyAt(power:number){const p=clamp(finite(power,.75),.05,1);return{rotational:.5*LAUNCH_REFERENCE.axialInertia*(170+440*p)**2,translational:.5*LAUNCH_REFERENCE.mass*((.92*(.45+1.45*p))**2+.12**2)};}
/** Bowl profile (2026-10-31, round 3 follow-up): the outer profile is
 * the round-3 saturating shape the rail/bank/pocket geometry was tuned
 * against (parabolic to u=.55, slope easing to a 50% residual, heights
 * unchanged for r >= .13 m). The center is deepened by a smooth boost
 * inside r < .13 m, after the real BX-10 Xtreme Stadium (Beyblade Wiki:
 * battle zone diameter 36.5 cm, tornado ridge diameter 21 cm -- the real
 * dish is a center feature, not a 44 cm-wide saucer). Diagnosis it fixes:
 * the un-boosted slope at r = 5 cm is ~2.4 deg, below the tip friction
 * angle of Ball (~5.4 deg) and Needle bits, and the contact solver's
 * Coulomb friction can fully arrest slow drift, so a slowed stamina top
 * froze on the slope wherever it stopped; stamina mirrors then orbited
 * at different radii for a whole round with zero contact (measured:
 * 0 collisions in 53 s, one top parked at r = .18). The boost adds
 * ~10 mm of depth at the center and lifts the slope at r = 4-6 cm to
 * ~6-8 deg, above the friction angles, so slowed tops keep migrating
 * into the middle and stamina battles actually meet. The boost and its
 * derivative vanish at r = .13 m, so height and gradient stay C1 and the
 * outer stadium is bit-identical to before. Depths remain estimates (no
 * published cross-section); the diameters are the published ones. */
export const BOWL_BOOST_RADIUS=.13,BOWL_BOOST_DEPTH=.010;
export function bowlProfile(r:number):{h:number,dhdr:number}{
  const R=STADIUM.radius,u=Math.min(r*r/(R*R),1);
  const w=clamp((u-.55)/.2,0,1),ss=w*w*(3-2*w);
  const gIntegral=u<=.55?u:u>=.75?.70+.5*(u-.75):.55+.2*(w-.5*(w**3-.5*w**4));
  const gSlope=r>=R?0:u<=.55?1:u>=.75?.5:1-.5*ss;
  let h=STADIUM.bowlDepth*gIntegral,dhdr=2*STADIUM.bowlDepth*gSlope*r/(R*R);
  if(r<BOWL_BOOST_RADIUS){const q=r/BOWL_BOOST_RADIUS,omq=1-q*q;h-=BOWL_BOOST_DEPTH*omq*omq;dhdr+=4*BOWL_BOOST_DEPTH*r*omq/(BOWL_BOOST_RADIUS*BOWL_BOOST_RADIUS);}
  return{h,dhdr};
}
/** Pure bowl profile height (no bank or pockets); getRailPath needs it
 * before the rail table exists, so it cannot go through floorSurface. */
export function bowlBaseHeight(x:number,z:number):number{
  return bowlProfile(Math.min(Math.hypot(x,z),STADIUM.radius)).h;
}
interface SurfaceSample{height:number;dx:number;dz:number;inPocket:boolean}
function floorSurface(x:number,z:number):SurfaceSample{
  const r2=x*x+z*z,R=STADIUM.radius;
  // Bowl shape comes from bowlProfile (see its note): the round-3 outer
  // profile plus a smooth center-deepening boost inside r < .13 m, so the
  // gradient here is exactly the profile derivative and sight/physics agree.
  const r=Math.sqrt(r2),profile=bowlProfile(Math.min(r,R));
  let base=profile.h,baseX=r>1e-9?profile.dhdr*x/r:0,baseZ=r>1e-9?profile.dhdr*z/r:0;
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
    return V(x,bowlBaseHeight(x,z)+.007,z);
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
export function totalEnergy(t:Top):number{return kineticEnergy(t)+t.profile.mass*G*t.y+.5*(t.profile.lockStiffness??.014)*(t.profile.lockReleaseAngle??.24)*t.lock;}
function applyImpulse(t:Top,j:Vec3,r:Vec3):void{t.vx+=j.x/t.profile.mass;t.vy+=j.y/t.profile.mass;t.vz+=j.z/t.profile.mass;t.angularMomentum=add(t.angularMomentum,cross(r,j));syncDerived(t);}
const pointVelocity=(t:Top,r:Vec3)=>add(velocity(t),cross(t.angularVelocity,r));
const contactMass=(t:Top,r:Vec3,n:Vec3)=>1/t.profile.mass+dot(cross(inverseInertia(t,cross(r,n)),r),n);
function angularFriction(t:Top,axis:Vec3,maxImpulse:number):void{const speed=dot(t.angularVelocity,axis),effective=dot(axis,inverseInertia(t,axis));const j=-Math.sign(speed)*Math.min(Math.abs(speed)/effective,Math.max(0,maxImpulse));t.angularMomentum=add(t.angularMomentum,scale(axis,j));syncDerived(t);}

/**
 * Deterministic integer PRNG (mulberry32). Integer arithmetic only, so a
 * given seed reproduces the same micro-variation across runtimes.
 */
function mulberry32(seed:number):()=>number{let a=seed>>>0;return()=>{a=a+0x6d2b79f5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/**
 * Real launches never repeat exactly: measured solo-spin studies of the
 * physical game show 5-15% run-to-run spread from launch power, initial
 * tilt, blade phase and seating. With seed !== 0, createBattle samples that
 * micro-variation ONCE at creation (power ±3%, angle ±1°, tilt ±0.8°,
 * default-spawn position ±2 mm, yaw phase uniform) and bakes it into the
 * initial state. A player-chosen launch position is never jittered.
 * so stepping, snapshots, reconnects and settling stay fully deterministic
 * for a given seed. seed = 0 (default) preserves the exact legacy inputs,
 * which existing compatibility tests rely on.
 */
export function createBattle(profiles:[Profile,Profile],launches:[Launch,Launch],seed=0):Battle{
  for (const i of [0,1] as const) if (launches[i].position !== undefined && !validLaunchPosition(launches[i].position,i)) throw new Error('Invalid launch position');
  const random=Number.isFinite(seed)&&seed!==0?mulberry32(seed):null;
  const tops=profiles.map((p,i):PhysicsTop=>{
    if(![p.mass,p.radius,p.inertia,p.burstThreshold,p.gearRadius].every(n=>Number.isFinite(n)&&n>0)||p.radius>=STADIUM.radius/2||p.gearRadius>=p.radius||![p.drag,p.grip,p.height,p.railGrip,p.contactLobes,p.contactLobeDepth,p.gearHeight].every(Number.isFinite)||![1,-1].includes(p.spin))throw new Error('Invalid physical profile');
    const optionalPositive=[p.transverseInertia,p.centerOfMassHeight,p.tipRadius,p.lockStiffness,p.lockReleaseAngle,p.bladeThickness,p.bladeEdgeSharpness,p.ratchetRadius,p.ratchetHalfThickness,p.gearEngagementBand];
    if(optionalPositive.some(v=>v!==undefined&&(!Number.isFinite(v)||v<=0))||![p.tipFriction??0,p.rollingDrag??0,p.bladeRampAmplitude??0,p.bladeSkew??0,p.bitHeightOffset??0,p.ratchetCenterHeight??0,p.ratchetLobes??0,p.ratchetLobeDepth??0,p.ratchetSkew??0,p.bitDiscRadius??0,p.bitDiscHeight??0,p.gearTeeth??12].every(Number.isFinite)||p.height<=0||p.contactLobes<1||p.contactLobeDepth<0||p.contactLobeDepth>.5)throw new Error('Invalid body/contact estimate');
    if(p.centerOfMass&&!Object.values(p.centerOfMass).every(Number.isFinite))throw new Error('Invalid center of mass');
    if(p.inertiaTensor&&!positiveDefinite(p.inertiaTensor))throw new Error('Inertia tensor must be positive definite');
    if(p.massComponents?.some(c=>!Number.isFinite(c.mass)||c.mass<=0||!Object.values(c.center).every(Number.isFinite)||!positiveDefinite(c.inertia)))throw new Error('Invalid component mass tensor');
    if(p.massComponents){const combined=combineMassComponents(p.massComponents),c=getCenterOfMass(p),tensor=p.inertiaTensor;
      if(Math.abs(combined.mass-p.mass)>p.mass*1e-9||norm(sub(combined.center,c))>1e-9||!tensor||Object.keys(tensor).some(k=>Math.abs(combined.inertia[k as keyof SymmetricTensor]-tensor[k as keyof SymmetricTensor])>Math.max(tensor.xx,tensor.yy,tensor.zz)*1e-8))throw new Error('Component mass/COM/tensor must reproduce assembly');}
    const l=launches[i];
    const jitter=random?{power:1+(random()*2-1)*.03,angle:(random()*2-1)*.017,tilt:(random()*2-1)*.014,yaw:random()*Math.PI*2,dx:(random()*2-1)*.002,dz:(random()*2-1)*.002}:null;
    const power=clamp(finite(l.power,.75)*(jitter?.power??1),.05,1),angle=clamp(finite(l.angle,0)+(jitter?.angle??0),-Math.PI,Math.PI),tilt=clamp(finite(l.tilt,.12)+(jitter?.tilt??0),0,.65),direction=angle+(i===0?0:Math.PI);
    // Translational launch speed scaled by .92 on 2026-10-31 (round 3):
    // with the center-gathering bowl, full legacy speed still produced
    // first-seconds pocket ejections (mirror matches median ~10 s, mostly
    // Over finishes) while real rounds run ~17-60 s. Spin speed is the
    // stamina currency and is unchanged; only the translational share,
    // which drives ejections, is trimmed. Estimate, not a launcher spec.
    const speed=(.45+power*1.45)*.92*Math.sqrt(LAUNCH_REFERENCE.mass/p.mass);
    const angularSpeed=(170+power*440)*Math.sqrt(LAUNCH_REFERENCE.axialInertia/(p.inertiaTensor?.yy??p.inertia));
    const yaw=i*Math.PI+(jitter?.yaw??0),tiltAxis=V(Math.sin(direction),0,-Math.cos(direction));
    const q=multiply(rotationVector(scale(tiltAxis,tilt)),rotationVector(V(0,yaw,0)));
    const center=comHeight(p),tip=p.tipRadius??.0015,transverse=p.transverseInertia??(.5*p.inertia+p.mass*(p.height*.35)**2/12);
    const baseSpawn=l.position??defaultLaunchPosition(i as 0|1);
    // A player-chosen position is an exact input and is never jittered (the
    // server regression suite requires accepted coordinates to be reflected
    // verbatim). Only the default spawn receives seating variation.
    const jitteredSpawn=jitter&&l.position===undefined?{x:baseSpawn.x+jitter.dx,z:baseSpawn.z+jitter.dz}:baseSpawn;
    const spawn=jitter&&l.position===undefined&&validLaunchPosition(jitteredSpawn,i as 0|1)?jitteredSpawn:baseSpawn;
    const t:PhysicsTop={profile:{...p},x:spawn.x,y:0,z:spawn.z,vx:Math.cos(direction)*speed,vy:-.12*Math.sqrt(LAUNCH_REFERENCE.mass/p.mass),vz:Math.sin(direction)*speed,orientation:q,angularMomentum:V(),angularVelocity:V(),bodyInertia:V(p.inertiaTensor?.xx??transverse,p.inertiaTensor?.yy??p.inertia,p.inertiaTensor?.zz??transverse),bodyInertiaTensor:p.inertiaTensor?{...p.inertiaTensor}:undefined,centerOfMassHeight:center,tipRadius:tip,omega:p.spin*angularSpeed,phase:yaw,tilt,tiltVelocity:0,lock:0,railCooldown:0,eliminated:null,rail:{engaged:false,travel:0,translationWork:0,rotationWork:0,contactPoint:null,tangent:null,lastContactTick:-1,lastReleaseTick:-1,dashCount:0,speedBefore:0,spinBefore:0,energyBefore:0}};
    const tipR=rotate(q,geometryToCOM(p,V(0,tip,0)));t.y=bowlHeightAt(t.x+tipR.x,t.z+tipR.z)-tipR.y+tip+.001;
    t.angularMomentum=inertia(t,scale(bodyAxis(t),t.omega));syncDerived(t);return t;
  }) as [PhysicsTop,PhysicsTop];
  return{tick:0,tops,events:[],result:null,fragments:[],settling:null,...(random?{seed}:{})};
}

/** Torque-free midpoint quaternion update: world L is fixed; ω follows changing R I⁻¹ Rᵀ. */
export function integrateFree(t:Top,dt:number,gravity=true,drag=true):void{
  if(gravity)t.vy-=G*dt;
  // Flight ceiling (round 4): nothing in this stadium legitimately sustains
  // upward flight faster than ~1.6 m/s (a ~13 cm hop, near the cover roof);
  // uncapped, rail/floor solves pumped tops to y ~ .19 m and held them
  // there. Applied to fragments too (burst debris stays lively but sane).
  if(t.vy>1.6)t.vy=1.6;
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
  const vn=dot(pointVelocity(t,r),normal);if(vn>=0)return 0;
  // Positional correction only for approaching contacts. Correcting a
  // separating (e.g. wobbling) vertex lifted the body along the normal with
  // no impulse behind it, injecting up to ~0.2 mJ of potential in one tick
  // on the bank; approaching contacts pay for the lift through the impulse.
  if(penetration>0){const correction=Math.min(penetration,.002);t.x+=normal.x*correction;t.y+=normal.y*correction;t.z+=normal.z*correction;}
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
  // Effective torsional patch radii are declared estimates. They were reduced
  // 2026-10-31 because the earlier values drained a Flat top solo in ~18 s,
  // versus ~60-90 s measured for real Flat combinations (Ball ~140-170 s).
  if(shape==='flat'){
    // Rim points are a finite planar patch. Orientation itself decides which ones touch.
    for(let i=0;i<4;i++){const a=i*Math.PI/2;impulse+=floorContact(t,geometryToCOM(p,V(tip*Math.cos(a),0,tip*Math.sin(a))),0,tip*.06,mu);}
    impulse+=floorContact(t,geometryToCOM(p,V(0,0,0)),0,tip*.15,mu);
  }else impulse+=floorContact(t,geometryToCOM(p,V(0,tip,0)),tip,tip*(shape==='needle'?.10:shape==='ball'?.08:.28),mu);
  // Translational rolling resistance (2026-10-31, round 3): the tip friction
  // above opposes total slip, which the spin surface velocity dominates, so
  // planar orbital motion was effectively undamped -- a top launched into
  // the dish kept its orbit radius for 40+ s instead of spiralling to the
  // center as real beys do. While the tip carries load, planar momentum
  // bleeds in proportion to the normal impulse (rolling-resistance style),
  // ~0.04 m/s^2 at rest load. Impulse-proportional, so it needs no dt and
  // stays consistent for direct resolveFloor callers.
  if(impulse>0){const sp=Math.hypot(t.vx,t.vz);if(sp>1e-6){const dv=Math.min(sp,.009*impulse/p.mass),f=(sp-dv)/sp;t.vx*=f;t.vz*=f;}}
  // The metal body can scrape the floor when tilted. Contact torque causes wobble/fall naturally.
  // Scrape friction recalibrated 2026-10-31: at the previous .28/.25 a 20°
  // launch preset lost ~58% of its spin in the first second and solo spin at
  // 6.3° tilt lasted ~22 s, versus roughly 60-170 s of measured solo spin for
  // real Beyblade X combinations. Blade/ratchet edges mostly slide on the
  // plastic bowl, so their scrape coefficients now sit near .10/.09; the
  // contact geometry and trigger are unchanged. This is an estimate tuned
  // toward measured durations, not a measured friction coefficient.
  // Scrape engages only past ~26 deg of tilt, or when the blade envelope
  // actually reaches the rail line (round 4 changes): the solver sustains
  // 10-25 deg of precession tilt that a real top settles out of, and at
  // the old triggers the blade vertices dragged almost continuously --
  // spin accounting for a stamina mirror traced 304 of 420 rad/s lost in
  // the wall zone (r > .17) via this branch's old radius trigger
  // (railRadius - notchDepth), plus ~15 rad/s/s of mid-field tilt scrape.
  // Below the triggers the edge is modelled as kissing the floor (the
  // sampled vertices overstate penetration for a precessing top); a
  // genuinely falling top still scrapes and dies.
  if(t.tilt>.45||Math.hypot(t.x,t.z)+p.radius*(1+p.contactLobeDepth)>STADIUM.railRadius-.006){const vertices=getBladeVertices(p,12);for(const vertex of vertices)impulse+=floorContact(t,vertex,0,.0005,.05);
    const ratchet=getRatchetGeometry(p);for(const point of getRatchetOutline(p,8))impulse+=floorContact(t,geometryToCOM(p,V(point.x,ratchet.centerHeight-ratchet.halfThickness,point.z)),0,.0003,.05);
    impulse+=floorContact(t,geometryToCOM(p,V(0,p.height*.82+bitHeightOffset(p)+.01,0)),0,.0005,.10);
  }
  // Disc bits (DB/DS) are SUPPORTED by their disc at moderate tilt -- that
  // is the part's purpose -- so the disc contact runs outside the scrape
  // trigger above; its own penetration check gates it (round 4 fix: the
  // raised scrape trigger had silently removed Disc Ball support).
  {const bit=getBitGeometry(p);if(bit.discRadius>0)for(let i=0;i<8;i++){const a=i*Math.PI/4;impulse+=floorContact(t,geometryToCOM(p,V(bit.discRadius*Math.cos(a),bit.discHeight-bit.discHalfThickness,bit.discRadius*Math.sin(a))),0,.0004,p.tipFriction??p.grip);}}
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
/** Detent potential E=tau*theta with tau=.5*k*releaseAngle (constant-torque clicks; total barrier .5*k*releaseAngle² matches the lockBarrier estimate). Only dissipated contact work may enter this internal coordinate. */
export function applyRatchetWork(t:Top,angularImpulse:number,availableDissipation:number,tick?:number,attackerSharpness=1):number{
  const release=angularImpulse*t.profile.spin;if(release<=0||availableDissipation<=0)return 0;
  const ratchet=getRatchetGeometry(t.profile),component=t.profile.massComponents?.find(c=>c.component==='ratchet'),relativeInertia=component?component.inertia.yy+component.mass*(component.center.x**2+component.center.z**2):.5*(t.profile.mass*.12)*ratchet.radius**2;
  const stiffness=t.profile.lockStiffness??.014,releaseAngle=t.profile.lockReleaseAngle??.24;
  // Constant-torque detent (round 3 fix, 2026-10-31): a real burst lock is
  // a series of clicks with roughly constant resisting torque, not a
  // quadratic energy well. The well form made accumulation asymptotic --
  // per-call work was capped by the remaining barrier energy, so traced
  // locks stalled at 87-95% of the release angle in every matchup and
  // bursts became unreachable no matter how the fraction was tuned. With
  // a constant resisting torque tau = .5*k*releaseAngle the TOTAL barrier
  // (.5*k*releaseAngle^2) is unchanged, but each joule of strike work buys
  // the same twist near the last click as near the first.
  const resistingTorque=.5*stiffness*releaseAngle,remaining=Math.max(0,resistingTorque*(releaseAngle-t.lock));
  // Only a fraction of the energy dissipated at a ratchet contact twists the
  // detent toward release; the rest leaves as heat, sound and deformation.
  // Without this partition a single hard clash (dissipating ~10 mJ) always
  // filled the ~1-3 mJ barrier and produced sub-second bursts. The fraction
  // was lowered .4 -> .22 on 2026-10-31 (round 2) against tick-by-tick grind
  // accumulation, then set to .35 later the same day: with band-level strikes
  // (see resolveContact) the coupling is more direct, per-call dissipation in
  // this solver is usually microjoules, and .22 left bursts practically
  // unreachable (0 in ~90 searched legal launches across five matchups).
  // The angular-impulse term below was the binding cap in every traced
  // battle (lock traces were bit-identical for dissipation fractions
  // .28-.70): a band strike twists the whole lock stack, not only the
  // ratchet component's own inertia share, so the term carries a coupling
  // factor of 2.5 (estimate, 2026-10-31 round 3) calibrated so sustained
  // strikes accumulate to a burst while the per-call cap
  // still bounds any single call.
  let work=Math.min(availableDissipation*.70,2.5*release*release/(2*relativeInertia),remaining);
  // Strike-intensity scaling (round 4, 2026-10-31): the min() terms above
  // saturate, so a gentle band graze twisted the lock as much as a dash
  // slam and stamina mirrors burst each other in ~5 s of center contact.
  // Scale the delivered work by the strike's dissipated energy against a
  // 20 mJ reference (round 4 recalibration: the gentle-meeting softening
  // had already cut band-strike dissipation to ~10-80 mJ, so the earlier
  // 120 mJ reference double-counted the reduction and made bursts
  // unreachable -- max lock peaked at 16-31% in attack matchups. Grazes
  // at ~3-10 mJ still scale to .15-.5), floored at .15 so repeated real
  // contacts still accumulate.
  work*=clamp(availableDissipation/.02,.15,1);
  // Attacker-geometry scaling (round 4): a burst is driven by the
  // ATTACKING blade's recoil character. Smooth round stamina blades
  // (edge sharpness ~.3) mostly glance and trade spin; sharp attack
  // blades (~.7+) bite the lock. Scale by the attacker's sharpness so
  // stamina mirrors stop bursting each other while attack builds keep
  // their burst threat. Direct unit callers omit it (factor 1).
  work*=clamp((attackerSharpness-.30)/.45,.08,1);
  // Per-strike twist cap (round 2, 2026-10-31): one strike can advance the
  // detent by at most 50% of the release angle, however large the clash.
  // Without it, a single dash-speed ratchet hit dissipating >=15 mJ filled
  // even the raised barrier at once (traced vs WizardArrow seed 4:
  // lock .067 -> full in one collision at t=1.29 s). A real pawl strike is
  // geometrically bounded; bursts should need repeated hard strikes.
  // Round 3 (same day): the cap is now 50% of the REMAINING angle per
  // call and the work fraction is .70. At 50% of the full angle (round 2),
  // one head-on clash spanning two solver calls filled the barrier
  // (measured: stock Sword burst at 0.9 s on its first clash in 2 of 12
  // seeded rounds vs Hells). The remaining-angle form bounds any single
  // call to half the remaining gap; the rate-limit window below is what
  // now keeps first-clash bursts out, while the constant-torque conversion
  // above keeps sustained strikes accumulating instead of asymptoting.
  let newLock=Math.min(t.lock+work/resistingTorque,t.lock+.5*(releaseAngle-t.lock),releaseAngle);
  // Loading rate limit (round 3, 2026-10-31): when the caller supplies the
  // battle tick, the detent can gain at most 12% of the release angle per
  // 0.5 s window (round 4 final: 35%, after excursions to 45/30/20/16/12%:
  // stamina mirrors kept bursting each other after ~10 s of repeated
  // center meetings at the higher budgets, while at 12-22% bursts became
  // unreachable everywhere -- traced attack battles loaded exactly one
  // window's worth (22%) and never more, because the window binds only
  // when strike work is plentiful. At 35% a burst needs ~3 hard-clash
  // windows; gentle meetings stay protected by the work-size scaling
  // (intensity + attacker sharpness) and tau ~30 s healing, not by the
  // cap). A continuous contact calls this solver every tick, so
  // per-call caps alone cannot distinguish one long clash from many
  // separate strikes -- with the window, a single clash loads at most
  // ~45% however long it grinds, and a burst needs engagements spread
  // over roughly 1 s or more (band contact is concentrated early, while
  // the tops still carry tilt and closing speed). Direct callers (unit tests) omit the tick
  // and keep the un-windowed per-call behaviour.
  if(tick!==undefined){
    if(t.lockWindowTick===undefined||tick-t.lockWindowTick>=120||tick<t.lockWindowTick){t.lockWindowTick=tick;t.lockWindowGain=0;}
    const budget=Math.max(0,.35*releaseAngle-(t.lockWindowGain??0));
    newLock=Math.min(newLock,t.lock+budget);
    t.lockWindowGain=(t.lockWindowGain??0)+Math.max(0,newLock-t.lock);
  }
  // Final-click slip (round 3, 2026-10-31): the lock system is nearly
  // scale-invariant in the release angle (per-call caps and remaining
  // work are all fractions of it), and traced locks asymptote at
  // 94-99% of release -- the last click is held by a fraction of a
  // millijoule that late, weak strikes never quite deliver. A real pawl
  // at high engagement slips the final clicks under continued vibration,
  // so a strike that pushes the lock past 75% of release completes it
  // (round 4: lowered from 85% via 80%; with the 35% window a first clash
  // loads at most ~35%, so the threshold still requires engagements
  // across at least three windows).
  if(newLock>.75*releaseAngle)newLock=releaseAngle;
  work=resistingTorque*(newLock-t.lock);t.lock=newLock;return work;
}
export function contactRadius(t:Top,angle:number):number{const direction=inverseRotate(t.orientation,V(Math.cos(angle),0,Math.sin(angle)));const a=Math.atan2(direction.z,direction.x);return bladeRadiusAt(t.profile,a);}
/** Detent twist is about the physical stem, unlike rigid-body torque about the COM. */
export function ratchetImpulseTwist(t:Top,contact:Vec3,impulse:Vec3,origin=position(t)):number{
  const pivot=add(origin,rotate(t.orientation,geometryToCOM(t.profile,V(0,getRatchetGeometry(t.profile).centerHeight,0))));
  return dot(cross(sub(contact,pivot),impulse),bodyAxis(t));
}
export function resolveContact(a:Top,b:Top,loadLocks=true,tick?:number):number{
  const delta=sub(position(b),position(a));
  if(norm(delta)>a.profile.radius*(1+a.profile.contactLobeDepth)+b.profile.radius*(1+b.profile.contactLobeDepth)+norm(getCenterOfMass(a.profile))+norm(getCenterOfMass(b.profile))+.012)return 0;
  const shapeA=collisionNodes(a),shapeB=collisionNodes(b);
  let distance=Infinity,reach=0,deepest=0,nodeA:CollisionNode|null=null,nodeB:CollisionNode|null=null;
  for(const x of shapeA)for(const y of shapeB){const d=norm(sub(y.point,x.point)),overlap=x.radius+y.radius-d;if(overlap>deepest){deepest=overlap;distance=d;reach=x.radius+y.radius;nodeA=x;nodeB=y;}}
  if(!nodeA||!nodeB)return 0;const pa=nodeA.point,pb=nodeB.point,energyBefore=kineticEnergy(a)+kineticEnergy(b);
  // Round-2 contact-normal clamp (2026-10-31): the deepest node pair can be a
  // high blade node against a low bit node, giving a near-vertical normal and
  // a full-body vertical impulse — traced tops leaving the floor at y=0.23 m,
  // above the cover roof, and dropping into pockets for ~0.7 s draws. Blade
  // ramps do lift opponents, but a single-node rigid solve overstates it;
  // clamp the normal's vertical tilt to 30 degrees so such contacts glance.
  const rawN=unit(sub(pb,pa),unit(delta,V(1,0,0)));
  if(Math.abs(rawN.y)>.5){const s=Math.sign(rawN.y),h=Math.hypot(rawN.x,rawN.z)||1,nh=Math.sqrt(1-.25);rawN.x=rawN.x/h*nh;rawN.z=rawN.z/h*nh;rawN.y=.5*s;}
  const n=rawN,contact=scale(add(pa,pb),.5);
  const originA=position(a),originB=position(b),ra=sub(contact,originA),rb=sub(contact,originB),invA=1/a.profile.mass,invB=1/b.profile.mass;
  // Positional correction capped at 2 mm per call (round 4): the uncapped
  // .8 * overlap form teleported deeply-overlapped tops apart at dash
  // speeds, including vertical pops that launched tops to y ~ .19 m.
  const correction=Math.min((reach-distance)*.8,.002);
  a.x-=n.x*correction*invA/(invA+invB);a.y-=n.y*correction*invA/(invA+invB);a.z-=n.z*correction*invA/(invA+invB);
  b.x+=n.x*correction*invB/(invA+invB);b.y+=n.y*correction*invB/(invA+invB);b.z+=n.z*correction*invB/(invA+invB);
  const relative=sub(pointVelocity(b,rb),pointVelocity(a,ra)),vn=dot(relative,n);
  if(vn>=0)return 0;
  // Pre-contact state for the per-call violence caps below.
  const preA={L:{...a.angularMomentum},vy:a.vy,grounded:a.y-bowlHeightAt(a.x,a.z)<.06},preB={L:{...b.angularMomentum},vy:b.vy,grounded:b.y-bowlHeightAt(b.x,b.z)<.06};
  // Gentle-meeting softening (round 4, 2026-10-31): two stamina beys that
  // have gathered at the center meet with centre-of-mass closing speeds
  // under ~1.5 m/s, yet the rigid solve treated those grazes like dash
  // slams -- measured 80-150 mJ dissipated per band call and stamina
  // mirrors bursting in ~5 s. Restitution and blade friction below scale
  // with the COM closing speed (full strength for genuine slams above
  // ~2 m/s), so gentle meetings mostly graze while real attacks still hit.
  const vnCom=dot(sub(velocity(b),velocity(a)),n),meetScale=clamp(Math.abs(vnCom)/2,.15,1);
  // Contact-episode damping (round 4): a sustained contact is re-solved
  // every substep, and each solve re-applied full friction -- measured
  // ticks with contact draining 40-50% of a top's spin, where a real
  // clash costs a few percent. Within an ongoing episode (pair contact
  // within the last ~30 ms) friction is damped to .35x, and restitution
  // only engages above 1.5 m/s of point normal speed (below that the
  // contact is inelastic, so micro-bounces stop re-impulsing).
  const episode=tick!==undefined&&a.contactTick!==undefined&&tick-a.contactTick<=7;
  // Sustained gentle contact (an ongoing episode at low COM closing
  // speed) is a bearing-like grind, not a series of impacts: two stamina
  // beys resting against each other at the center exchanged almost no
  // spin in reality, but the re-solved micro-impulses drained ~40 rad/s/s
  // and killed stamina rounds in ~11 s. Such contacts get strongly
  // damped friction and a softened normal impulse.
  // Episode age: a contact that has been continuous for >~0.25 s is a
  // resting grind; its impulses soften with age (see gentle below).
  if(tick!==undefined&&(a.contactStartTick===undefined||tick-a.contactStartTick>7||(a.contactTick!==undefined&&tick-a.contactTick>7))){a.contactStartTick=tick;b.contactStartTick=tick;}
  const episodeAge=tick!==undefined&&a.contactStartTick!==undefined?(tick-a.contactStartTick)/240:0;
  const gentle=episode&&meetScale<.5,gentleAge=gentle?clamp(1-episodeAge*2.0,.3,1):1;
  // Blade friction also scales with the pair's edge character (round 4):
  // polished round stamina blades (sharpness ~.3) slide over each other,
  // while sharp attack edges (~.7+) bite. Friction between two Arrow-class
  // blades halves; attack matchups are unchanged.
  const sharpScale=clamp(((a.profile.bladeEdgeSharpness??.5)+(b.profile.bladeEdgeSharpness??.5))/2/.6,.35,1);
  const frictionScale=(gentle?.12*gentleAge:episode?.35:1)*sharpScale,restScale=clamp(Math.abs(vn)/1.5,0,1);
  if(tick!==undefined){a.contactTick=tick;b.contactTick=tick;}
  // Single-strike impulse cap (round-2 addition, 2026-10-31): the rigid solve
  // uses point velocities, so a blade-tip strike can see ~15 m/s of closing
  // surface speed and one call dissipated 1.15 J — the pair's whole spin
  // budget — collapsing both tops' spin in a single substep (traced: omega
  // 420 -> 116 in one call). A real lobe strike is a glancing, patch-limited
  // contact; its transmitted impulse is bounded well below the rigid value.
  // The cap 0.06 N*s is an explicit estimate: ordinary clashes measure
  // ~0.007 N*s and hard dash impacts stay under it, while the pathological
  // tip-strike value was 0.22 N*s.
  const jn=Math.min(-(1+clamp(Math.min(a.profile.restitution,b.profile.restitution),0,1)*meetScale*restScale)*vn/(contactMass(a,ra,n)+contactMass(b,rb,n)),.06)*(gentle?.55*gentleAge:1);
  let impulse=scale(n,jn);applyImpulse(a,scale(impulse,-1),ra);applyImpulse(b,impulse,rb);
  const after=sub(pointVelocity(b,rb),pointVelocity(a,ra)),vt=sub(after,scale(n,dot(after,n))),speed=norm(vt);
  // Blade-to-blade friction cap recalibrated 2026-10-31: at .25 of the normal
  // impulse a single clash could cancel most of the relative surface slip and
  // erase ~80% of a top's spin, while real metal blade clashes are brief,
  // elastic and typically cost only a few to ~15% of spin. Smooth die-cast
  // contact is modelled with a .05 cap (round 2, was .07 in round 1); this is
  // an estimate tuned toward measured battle durations, not a measured
  // friction coefficient.
  if(speed>1e-9){const tangent=scale(vt,1/speed),jt=Math.min(speed/(contactMass(a,ra,tangent)+contactMass(b,rb,tangent)),.03*meetScale*frictionScale*jn),friction=scale(tangent,-jt);applyImpulse(a,scale(friction,-1),ra);applyImpulse(b,friction,rb);impulse=add(impulse,friction);}
  // Per-call violence caps (round 4, 2026-10-31): a single node contact is
  // a patch-limited strike; it cannot flip a top or throw it skyward.
  // Traced failures without these caps: one clash flipped a top to 94 deg
  // tilt and cut its spin 354 -> 74 rad/s (a 2.0 s 'spin' finish), and
  // dash-speed overlaps popped a top toward y ~ .19 m (a 1.1 s double-exit
  // draw). Cap the angular-velocity change per call at 100 rad/s, and a
  // floor-supported top's upward velocity after the call at 1.2 m/s
  // (~7 cm hop). Estimates, documented here and in physics.md.
  for(const [t,pre] of [[a,preA],[b,preB]] as const){
    const w0=inverseInertia(t,pre.L),w1=inverseInertia(t,t.angularMomentum),d=sub(w1,w0),dn=norm(d);
    if(dn>100)t.angularMomentum=add(pre.L,scale(sub(t.angularMomentum,pre.L),100/dn));
    if(pre.grounded)t.vy=Math.min(t.vy,1.2);
  }
  let dissipated=Math.max(0,energyBefore-kineticEnergy(a)-kineticEnergy(b));
  // Blade impacts do not become generic burst damage. The detent is loaded
  // only by strikes that land at ratchet level: either the deepest pair is an
  // exposed ratchet node, or the contact point lies within the victim's
  // ratchet band height (round-2 broadening, 2026-10-31). Measured Hells vs
  // Sword battles produced ZERO ratchet-node deepest pairs in 30 s — blades
  // always overlap deeper — so the node-only rule made legal-launch bursts
  // practically impossible, while real bursts are core Beyblade X mechanics
  // driven by low strikes transmitted to the lock through the assembly.
  // High blade hits above the band still never load the detent. Lock work
  // is intensity-scaled inside applyRatchetWork (round 4): measured
  // per-call dissipation spans ~3 mJ (gentle center grazes, after the
  // meetScale softening) to ~600 mJ (dash slams), and the twist a strike
  // delivers scales across that range instead of saturating on any touch.
  // Band test returns 0 (no load), 1 (core band: at the ratchet's own
  // height) or 2 (extended zone: up to the blade's lower half). Round 4
  // re-broadened the zone: with tops now running upright (tip righting),
  // blade contacts sit at blade height and the old +-10.5 mm band around
  // the ratchet centre almost never triggered -- 2 band calls in a 30 s
  // attack battle, max lock 22%, bursts unreachable. Real bursts ARE
  // driven by strikes transmitted through the assembly, so extended-zone
  // hits load the lock at a .55 transmission factor.
  const atRatchetBand=(victim:Top,kind:string)=>{if(kind==='ratchet')return 1;const g=getRatchetGeometry(victim.profile),centre=add(position(victim),rotate(victim.orientation,geometryToCOM(victim.profile,V(0,g.centerHeight,0))));const dy=contact.y-centre.y;if(Math.abs(dy)<=g.halfThickness+.008)return 1;return dy>0&&dy<=g.halfThickness+.016?2:0;};
  const bandA=atRatchetBand(a,nodeA.kind),bandB=atRatchetBand(b,nodeB.kind);
  // Extended-zone transmission is gated on strike intensity (>= 40 mJ
  // dissipated): dash slams transmit through the assembly, gentle center
  // meetings do not -- ungated transmission made stamina mirrors burst
  // each other again within ~5-12 s (round-4 regression check).
  const extA=bandA===2?(dissipated>=.04?.55:0):1,extB=bandB===2?(dissipated>=.04?.55:0):1;
  if(loadLocks&&bandA&&extA>0&&!isFragment(a)){const work=applyRatchetWork(a,-ratchetImpulseTwist(a,contact,scale(impulse,-1),originA),(nodeB.kind==='ratchet'?dissipated/2:dissipated)*extA,tick,b.profile.bladeEdgeSharpness??1);dissipated-=work;}
  if(loadLocks&&bandB&&extB>0&&!isFragment(b))applyRatchetWork(b,-ratchetImpulseTwist(b,contact,impulse,originB),dissipated*extB,tick,a.profile.bladeEdgeSharpness??1);
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
  // Correction capped at 2 mm per call (round 4), as in resolveContact:
  // deep gear overlaps at dash speed otherwise teleport the top, with a
  // large vertical pop from the bank normal.
  if(m.gap<0){const c=Math.min(-m.gap,.002);t.x+=m.normal.x*c;t.y+=m.normal.y*c;t.z+=m.normal.z*c;}
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
  if(jn>0){applyImpulse(t,scale(n,jn),r);const after=pointVelocity(t,r),vt=sub(after,scale(n,dot(after,n))),speed=norm(vt);if(speed>1e-9){const direction=scale(vt,1/speed),friction=Math.min(speed/contactMass(t,r,direction),.12*jn);applyImpulse(t,scale(direction,-friction),r);}}
  return{mesh:false,gearImpulse:0,translationWork:0,rotationWork:0};
}
export function resolveRailSolid(t:Top):boolean{
  const m=gearManifold(t);if(m.gap>=0)return false;applyRailContact(t,m,false);return true;
}
function resolveRail(t:Top,battle:Battle,index:number,eventTick:number,dt:number,meshAllowed=true):void{
  if(Math.hypot(t.x,t.z)<.14&&!t.rail.engaged)return;
  const before=totalEnergy(t),spinBefore=t.omega,velocityBefore=velocity(t),speedBefore=Math.hypot(t.vx,t.vz);
  const c=nearestRail(t),manifold=gearManifold(t,c);
  // Round-2 rail tuning (2026-10-31): traces showed one rail engagement draining
  // ~75% of a top's spin (omega 430 -> 82) because the partial-grip gear solve
  // keeps braking the huge spin surface slip tick after tick, and the resulting
  // dash or spin-collapse ended most battles within ~3 s. A real X-dash costs
  // only part of the spin. Meshing therefore stops once the top's spin falls
  // below 70% of its engagement-start value; solid rail contact still applies.
  const spinCapOk=!t.rail.engaged||Math.abs(t.omega)>=.7*Math.abs(t.rail.spinBefore||t.omega);
  const eligible=meshAllowed&&eligibleAt(t,c)&&spinCapOk,contact=applyRailContact(t,manifold,eligible);
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
    // Pocket entry is a floor-level event (round 4): the whole body must be
    // past the rim AND the body's lowest point within 30 mm of the local
    // floor. The planar-only test let tops sailing at y ~ .15-.19 m score
    // over finishes mid-flight, producing ~1 s double-exit draws.
    if(along>STADIUM.radius&&!t.pendingFinish){const vertices=getWorldBodyVertices(t),floorY=pocketFloorAt(center.x,center.z)??bowlHeightAt(center.x,center.z),lowY=Math.min(...vertices.map(v=>v.y));if(lowY<=floorY+.03&&vertices.every(v=>v.x*outward.x+v.z*outward.z>STADIUM.radius&&Math.abs(-v.x*outward.z+v.z*outward.x)<=width+.0001)){t.pendingFinish=pocket.finish;t.pocketEnteredTick=eventTick;t.pocketRestTime=0;}}
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
    integrateFree(t,h);resolveFloor(t);applyTipRighting(t,h);
    if(t.rotationStopped||t.omega*t.profile.spin<=0){t.rotationStopped=true;t.eliminated='spin';}
  }
  return t;
}

/** Sub-grid tip righting (round 4, 2026-10-31): a real rounded tip rolls
 * the body axis back toward vertical while the top sleeps -- measured real
 * beys settle from a banked launch to within a few degrees in ~2 s. The
 * rigid solver instead held 10-30 deg of tilt indefinitely (a solo top
 * stuck at ~10 deg on the dish slope; stamina beys at 15-30 deg all
 * battle), and the tilted running scraped spin away at ~15 rad/s/s, so
 * stamina rounds died in ~10 s despite >400 s of solo spin. While a top
 * is floor-supported and spinning, rotate its axis toward vertical with
 * a ~0.25 s time constant scaled by spin (rate 4.0/s: the solver's own
 * precession attractor holds 10-30 deg even at the flat center, so the
 * sub-grid term has to be assertive to reproduce the measured settling;
 * clashes still re-tilt freely between calm phases). World angular
 * momentum is kept; this models the tip geometry the point/patch
 * contact cannot express. */
export function applyTipRighting(t:Top,dt:number):void{
  if(Math.abs(t.omega)<50||t.vy>1.5||t.y-bowlHeightAt(t.x,t.z)>.06)return;
  const axis=bodyAxis(t),tiltAngle=Math.acos(clamp(axis.y,-1,1));
  if(tiltAngle<.005)return;
  const strength=clamp(Math.abs(t.omega)/350,.2,1),dA=tiltAngle*(1-Math.exp(-dt*4.0*strength));
  const k=cross(axis,V(0,1,0)),kn=norm(k);if(kn<1e-6)return;
  // Energy-neutral: rotating the axis at fixed world L would change the
  // kinetic energy of an anisotropic body (the preset energy-closure
  // test caught a ~1.3% injection). Rescale L so the rotation itself
  // does no work; the floor contact remains the only energy source/sink.
  const keBefore=.5*dot(t.angularMomentum,inverseInertia(t,t.angularMomentum));
  t.orientation=normalized(multiply(rotationVector(scale(k,dA/kn)),t.orientation));
  syncDerived(t);
  const keAfter=.5*dot(t.angularMomentum,inverseInertia(t,t.angularMomentum));
  if(keBefore>1e-12&&keAfter>1e-12){t.angularMomentum=scale(t.angularMomentum,Math.sqrt(keBefore/keAfter));syncDerived(t);}
}
export function stepBattle(b:Battle,dt=STEP):Battle{
  if(!Number.isFinite(dt)||dt<=0||dt>STEP+1e-10)throw new Error('Use fixed steps <= STEP');if(b.result)return stepSettlingBattle(b,dt);
  b.tick++;
  // Bound rotation of each contact feature to 0.12 rad and translation to 1.5 mm.
  const fastest=Math.max(...b.tops.map(t=>norm(t.angularVelocity))),speed=Math.max(...b.tops.map(t=>norm(velocity(t))));
  const substeps=Math.min(64,Math.max(4,Math.ceil(fastest*dt/.12),Math.ceil(speed*dt/.0015))),h=dt/substeps;
  for(let i=0;i<substeps&&!b.result;i++){
    const tick=b.tick-1+(i+1)/substeps,tops=b.tops as [PhysicsTop,PhysicsTop];
    // Detent twist decay: tau was 4 s, which erased accumulated twist between
    // clashes, then ~60 s (round 2), which let gentle stamina meetings
    // accumulate to a burst over ~10 s of contact. Round 4 sets tau ~30 s:
    // hard attack sequences still accumulate across clashes, while locks
    // loaded by soft meetings heal between them. The per-strike cap still
    // prevents any single hit from bursting.
    for(const t of tops)if(!t.eliminated){syncDerived(t);if(t.omega*t.profile.spin<=0)t.rotationStopped=true;t.railCooldown=Math.max(0,t.railCooldown-h);t.lock*=Math.exp(-h/30);integrateFree(t,h);resolveFloor(t);applyTipRighting(t,h);}
    if(!tops[0].eliminated&&!tops[1].eliminated){const j=resolveContact(tops[0],tops[1],true,b.tick);if(j>0)b.events.push({tick,kind:'collision',intensity:j,position:scale(add(position(tops[0]),position(tops[1])),.5)});}
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
