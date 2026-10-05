import {number,record} from '../../save/validation';
import {materialDefinition} from './materials';
import {capsule,ellipsoid,key,VoxelField,type Hit,type Vec3} from './voxel';
import {extractSurface} from './surface';
import type {Element,ElementSystem} from './elements';
import type {VoxelWater} from './water';
import type {HomesteadContext,HomesteadResult,HomesteadSystem} from './homestead';

export const HOMESTEAD_ANIMAL_ID='homestead-animal';
export const HOMESTEAD_ANIMAL_HOME=Object.freeze({x:-5.6,y:.25,z:2.5});
export const HOMESTEAD_ANIMAL_RULES=Object.freeze({step:1/60,maxDt:.5,roamRadius:1.35,interactionRange:2.75,gravity:12,maxSpeed:4,maxFallSpeed:8,wet:5,burning:4,fright:4,shock:.55,shockCooldown:1.8,contactStep:.1,maxContactRays:8});
/** Protected companion: the sampled body has no HP, durability, death or loot.
 * Movement/exposure is separate from the canonical feed/production ledger. */
export type HomesteadAnimalRecoveryReason='void'|'overlap';
export interface HomesteadAnimalState {
 version:1;position:Vec3;velocity:Vec3;yaw:number;grounded:boolean;
 wet:number;burning:number;fright:number;shock:number;shockCooldown:number;chargeContact:boolean;
 phase:number;accumulator:number;contactAccumulator:number;recovering:boolean;rescueWait:number;
 /** Absent on ordinary and legacy states. Overlap migration is distinct from a void fall. */
 recoveryReason?:HomesteadAnimalRecoveryReason;
}
export interface HomesteadAnimalContext {
 field:VoxelField;elements?:ElementSystem;water?:VoxelWater;rain?:boolean;wind?:Vec3;
 /** Player/enemy feet. The animal yields rather than displacing other actors. */
 blockers?:readonly Vec3[];
}
export interface HomesteadAnimalTickResult {recovered:boolean;contactRays:number;skyRays:number}
export interface HomesteadAnimalSurface {readonly positions:readonly number[];readonly normals:readonly number[];readonly materials:readonly number[]}
const r=HOMESTEAD_ANIMAL_RULES,home=HOMESTEAD_ANIMAL_HOME;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const decay=(n:number,dt:number)=>n<=dt+1e-9?0:n-dt;
const vector=(p:unknown,min:number,max:number):p is Vec3=>record(p)&&Object.keys(p).length===3&&number(p.x,min,max)&&number(p.y,min,max)&&number(p.z,min,max);
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const inYard=(p:Vec3)=>Math.hypot(p.x-home.x,p.z-home.z)<=r.roamRadius+1e-9;
export function createHomesteadAnimalState():HomesteadAnimalState {return {version:1,position:{...home,y:home.y+.25},velocity:{x:0,y:0,z:0},yaw:0,grounded:false,wet:0,burning:0,fright:0,shock:0,shockCooldown:0,chargeContact:false,phase:0,accumulator:0,contactAccumulator:0,recovering:false,rescueWait:0};}
export function validHomesteadAnimalState(value:unknown):value is HomesteadAnimalState {
 if(!record(value)||![16,17].includes(Object.keys(value).length)||!Object.keys(value).every(k=>k==='recoveryReason'||Object.hasOwn(createHomesteadAnimalState(),k))||value.version!==1)return false;
 if(Object.hasOwn(value,'recoveryReason')&&(!value.recovering||value.recoveryReason!=='void'&&value.recoveryReason!=='overlap'))return false;
 if(!vector(value.position,-12,12)||!inYard(value.position)||!number(value.position.y,-8,8)||!vector(value.velocity,-r.maxFallSpeed,r.maxFallSpeed)||value.velocity.y>r.maxSpeed||Math.hypot(value.velocity.x,value.velocity.z)>r.maxSpeed+1e-9)return false;
 if(!number(value.yaw,-Math.PI,Math.PI)||(!number(value.phase,0,36)||value.phase>=36)||!number(value.accumulator,0,r.step-Number.EPSILON)||!number(value.contactAccumulator,0,r.contactStep-Number.EPSILON)||!number(value.rescueWait,0,1))return false;
 for(const name of ['grounded','chargeContact','recovering'])if(typeof value[name]!=='boolean')return false;
 if(value.recovering&&(value.grounded||Math.hypot(value.velocity.x,value.velocity.y,value.velocity.z)>0))return false;
 if(value.recovering&&value.recoveryReason!=='overlap'&&value.position.y!==-8)return false;
 return number(value.wet,0,r.wet)&&number(value.burning,0,r.burning)&&number(value.fright,0,r.fright)&&number(value.shock,0,r.shock)&&number(value.shockCooldown,0,r.shockCooldown)&&!(value.wet>0&&value.burning>0);
}

/** This field never escapes the module. Its frozen extracted surface and ray
 * queries share the exact same sampled SDF; no terrain remeshing per actor tick. */
let body:VoxelField|undefined,surface:HomesteadAnimalSurface|undefined;
function animalBody(){
 if(body)return body;
 const field=new VoxelField(.0625);
 const orb=(p:Vec3,size:Vec3,material=10)=>field.shape({x:p.x-size.x,y:p.y-size.y,z:p.z-size.z},{x:p.x+size.x,y:p.y+size.y,z:p.z+size.z},ellipsoid(p,size),material,HOMESTEAD_ANIMAL_ID);
 const limb=(a:Vec3,b:Vec3,radius:number,material=10)=>field.shape({x:Math.min(a.x,b.x)-radius,y:Math.min(a.y,b.y)-radius,z:Math.min(a.z,b.z)-radius},{x:Math.max(a.x,b.x)+radius,y:Math.max(a.y,b.y)+radius,z:Math.max(a.z,b.z)+radius},capsule(a,b,radius),material,HOMESTEAD_ANIMAL_ID);
 orb({x:0,y:.59,z:.02},{x:.27,y:.30,z:.43});
 limb({x:0,y:.61,z:-.28},{x:0,y:.94,z:-.41},.18);
 orb({x:0,y:1.00,z:-.44},{x:.19,y:.20,z:.24});
 orb({x:0,y:.95,z:-.59},{x:.13,y:.10,z:.13},5);
 for(const x of [-.18,.18])for(const z of [-.24,.29]){limb({x,y:.08,z},{x,y:.53,z},.075);orb({x,y:.075,z:z-.02},{x:.083,y:.07,z:.11},5);}
 for(const x of [-1,1]){orb({x:x*.22,y:1.02,z:-.40},{x:.13,y:.063,z:.085});limb({x:x*.10,y:1.12,z:-.40},{x:x*.14,y:1.30,z:-.28},.045,3);}
 limb({x:0,y:.66,z:.39},{x:0,y:.78,z:.53},.055);
 for(const cell of field.cells.values())Object.freeze(cell);
 field.dirty.clear();body=field;return field;
}
function animalSurface(){if(!surface){const extracted=extractSurface(animalBody());surface=Object.freeze({positions:Object.freeze(extracted.positions),normals:Object.freeze(extracted.normals),materials:Object.freeze(extracted.materials)});}return surface;}
const waypoints=[{x:0,z:0},{x:.55,z:.45},{x:-.40,z:.65},{x:-.70,z:-.10},{x:.15,z:-.65},{x:.45,z:-.20}];

export class HomesteadAnimal {
 private reconciledState:HomesteadAnimalState|undefined;
 constructor(readonly homestead:HomesteadSystem){}
 get state(){return this.homestead.state.animal.physical??(this.homestead.state.animal.physical=createHomesteadAnimalState());}
 get position(){return this.state.position;}
 get yaw(){return this.state.yaw;}
 get visible(){return !this.state.recovering;}
 get bodySurface(){return animalSurface();}
 private local(p:Vec3){const s=this.state,x=p.x-s.position.x,z=p.z-s.position.z,c=Math.cos(s.yaw),sn=Math.sin(s.yaw);return {x:c*x-sn*z,y:p.y-s.position.y,z:sn*x+c*z};}
 private world(p:Vec3){const s=this.state,c=Math.cos(s.yaw),sn=Math.sin(s.yaw);return {x:s.position.x+c*p.x+sn*p.z,y:s.position.y+p.y,z:s.position.z-sn*p.x+c*p.z};}
 /** Hit points/normals are world-space; Cell coordinates belong to the protected
  * local body and must NEVER be passed to the terrain ElementSystem. */
 ray(origin:Vec3,direction:Vec3,range:number,terrain?:VoxelField):Hit|null {
  if(!this.visible||!vector(origin,-10000,10000)||!vector(direction,-10000,10000)||!number(range,0,100))return null;
  const q={x:this.position.x-origin.x,y:this.position.y+.65-origin.y,z:this.position.z-origin.z},length=Math.hypot(direction.x,direction.y,direction.z);if(length<1e-9)return null;const along=(q.x*direction.x+q.y*direction.y+q.z*direction.z)/length;if(along<-1.1||along>range+1.1||q.x*q.x+q.y*q.y+q.z*q.z-along*along>1.21)return null;
  const c=Math.cos(this.yaw),s=Math.sin(this.yaw),hit=animalBody().ray(this.local(origin),{x:c*direction.x-s*direction.z,y:direction.y,z:s*direction.x+c*direction.z},range);
  if(!hit)return null;if(terrain){const wall=terrain.ray(origin,direction,hit.distance);if(wall&&wall.distance<hit.distance-.005)return null;}
  return {...hit,point:this.world(hit.point),normal:{x:c*hit.normal.x+s*hit.normal.z,y:hit.normal.y,z:-s*hit.normal.x+c*hit.normal.z}};
 }
 visibleFrom(eye:Vec3,field:VoxelField){const target=this.world({x:0,y:.65,z:0}),direction={x:target.x-eye.x,y:target.y-eye.y,z:target.z-eye.z};return this.ray(eye,direction,distance(eye,target)+.1,field)!==null;}
 interact(context:HomesteadContext):HomesteadResult {const a=this.homestead.state.animal;return !a.tamed?this.homestead.tame(context):a.ready?this.homestead.claimAnimal(context):this.homestead.feed(context);}
 /** No currency, item, damage, or voxel edits. Caller first resolves a valid,
  * unobstructed target and pays the normal spell/action cost. */
 cast(element:Element,direction:Vec3):void {
  const s=this.state;if(!this.visible||!vector(direction,-10000,10000))return;
  if(element==='water'){s.wet=r.wet;s.burning=0;s.fright=Math.min(s.fright,.5);}
  else if(element==='fire'){if(!s.wet){s.burning=r.burning;s.fright=r.fright;this.impulse(direction,1.3);}}
  else if(element==='wind')this.impulse(direction,3);
  else if(element==='earth'){s.burning=0;s.fright=Math.max(s.fright,1);this.impulse(direction,.8);}
  else if(element==='lightning'&&!s.shockCooldown){s.shock=s.wet>0?r.shock:.2;s.shockCooldown=r.shockCooldown;s.fright=Math.max(s.fright,2);}
 }
 impulse(direction:Vec3,power:number){
  if(!vector(direction,-10000,10000)||!number(power,0,20))return;const length=Math.hypot(direction.x,direction.y,direction.z);if(length<1e-9)return;
  const v=this.state.velocity;v.x+=direction.x/length*power;v.z+=direction.z/length*power;v.y=clamp(v.y+direction.y/length*power,-r.maxFallSpeed,r.maxSpeed);this.limitVelocity();
 }
 private limitVelocity(){const v=this.state.velocity,length=Math.hypot(v.x,v.z);if(length>r.maxSpeed){v.x*=r.maxSpeed/length;v.z*=r.maxSpeed/length;}v.y=clamp(v.y,-r.maxFallSpeed,r.maxSpeed);}
 /** Conservative three-capsule envelope around the SDF body. Turning, impulses,
  * and movement use the same envelope; no centre-only rays through thin walls. */
 overlapsTerrain(field:VoxelField,position=this.position,yaw=this.yaw){const sin=Math.sin(yaw),cos=Math.cos(yaw);for(const z of [-.40,0,.27])if(field.overlaps({x:position.x+sin*z,y:position.y,z:position.z+cos*z},.30,1.36))return true;return false;}
 /** Tests another upright actor capsule against the same conservative animal
  * envelope used for terrain movement. It never displaces that actor. */
 overlaps(position:Vec3,radius=.27,height=1.65){
  if(!this.visible||!vector(position,-10000,10000)||!number(radius,.01,2)||!number(height,radius*2,10))return false;
  const p=this.position,sin=Math.sin(this.yaw),cos=Math.cos(this.yaw),lower=position.y+radius,upper=position.y+height-radius,dy=Math.max(0,p.y+.30-upper,lower-(p.y+1.06));
  for(const z of [-.40,0,.27])if(Math.hypot(position.x-p.x-sin*z,dy,position.z-p.z-cos*z)<radius+.30)return true;
  return false;
 }
 nudge(direction:Vec3,strength=.5){if(!this.visible||!number(strength,0,2))return;this.impulse(direction,strength);this.state.fright=Math.max(this.state.fright,.4);}
 private blocked(context:HomesteadAnimalContext,p:Vec3,yaw=this.yaw){
  if(this.overlapsTerrain(context.field,p,yaw))return true;
  return (context.blockers??[]).some(b=>Math.abs(b.y-p.y)<1.65&&Math.hypot(b.x-p.x,b.z-p.z)<.93);
 }
 private moveAxis(axis:'x'|'y'|'z',amount:number,context:HomesteadAnimalContext){
  if(Math.abs(amount)<1e-10)return false;const s=this.state,p=s.position,start=p[axis],candidate={...p,[axis]:start+amount};
  if(axis!=='y'&&!inYard(candidate)||axis==='y'&&candidate.y>8){s.velocity[axis]=0;return true;}
  if(!this.blocked(context,candidate)){p[axis]=candidate[axis];return false;}
  // Sweep steps are at most 0.067m horizontally and 0.134m vertically;
  // bisection converges onto the original sampled surface without penetration.
  let lo=0,hi=1;for(let i=0;i<7;i++){const t=(lo+hi)/2;if(this.blocked(context,{...p,[axis]:start+amount*t}))hi=t;else lo=t;}p[axis]=start+amount*lo;s.velocity[axis]=0;return true;
 }
 /** Call after terrain + home hydration and before first rendering. Tick also
  * calls it automatically. A new state identity is checked once, so an ordinary
  * enclosed animal never treats a blocked route as permission to teleport.
  * Returns true only if an invalid embedded placement was safely relocated. */
 reconcileTerrain(context:Pick<HomesteadAnimalContext,'field'|'blockers'>):boolean {
  const s=this.state;if(this.reconciledState===s)return false;this.reconciledState=s;
  if(!s.recovering&&this.overlapsTerrain(context.field)){
   s.recovering=true;s.recoveryReason='overlap';s.rescueWait=0;s.grounded=false;Object.assign(s.velocity,{x:0,y:0,z:0});
   return this.rescue(context);
  }
  return false;
 }
 private rescue(context:Pick<HomesteadAnimalContext,'field'|'blockers'>){
  const s=this.state;if(s.rescueWait>0)return false;s.rescueWait=1;
  // Only a void fall or an actually overlapping newly loaded/defaulted body
  // reaches here. Every candidate uses existing terrain; no build is removed.
  // Keep feet near courtyard height rather than teleporting onto a tall roof.
  const candidates=[{x:s.position.x-home.x,z:s.position.z-home.z},{x:0,z:0},...waypoints];
  for(const radius of [1.05,1.30])for(let i=0;i<8;i++){const angle=i*Math.PI/4;candidates.push({x:Math.cos(angle)*radius,z:Math.sin(angle)*radius});}
  for(const point of candidates){const origin={x:home.x+point.x,y:5,z:home.z+point.z},hit=context.field.ray(origin,{x:0,y:-1,z:0},6);if(!hit||hit.normal.y<.45||hit.point.y>home.y+1.25)continue;const candidate={x:origin.x,y:hit.point.y+.012,z:origin.z};if(!inYard(candidate)||this.blocked(context,candidate))continue;Object.assign(s.position,candidate);Object.assign(s.velocity,{x:0,y:0,z:0});s.grounded=true;s.recovering=false;delete s.recoveryReason;return true;}return false;
 }
 private exposure(context:HomesteadAnimalContext,out:HomesteadAnimalTickResult){
  const s=this.state,field=context.field;
  let wet=false,fire=false,charge=false;
  const water=context.water;if(water){const ankles=s.position.y+.08,x=Math.floor((s.position.x-water.origin.x)/water.size),y=Math.floor((ankles-water.origin.y)/water.size),z=Math.floor((s.position.z-water.origin.z)/water.size);if(x>=0&&y>=0&&z>=0&&x<water.nx&&y<water.ny&&z<water.nz){const i=water.index(x,y,z);wet=!water.blocked[i]&&water.volume[i]>.02&&ankles<water.origin.y+(y+water.volume[i])*water.size;}}
  if(context.rain){out.skyRays++;if(!field.ray({x:s.position.x,y:s.position.y+1.4,z:s.position.z},{x:0,y:1,z:0},24))s.wet=Math.max(s.wet,2);}
  if(context.elements){
   const candidates:{direction:Vec3;origin:Vec3;distance:number;id:string}[]=[];let visited=0;
   for(const [id,source] of context.elements.states){if(visited++>=256)break;if(source.fire<=0&&source.wet<=0&&source.charge<=0)continue;const local=this.local(source.position),origin=this.world({x:0,y:clamp(local.y,.3,1),z:clamp(local.z,-.38,.25)}),direction={x:source.position.x-origin.x,y:source.position.y-origin.y,z:source.position.z-origin.z},d=Math.hypot(direction.x,direction.y,direction.z);if(d<1)candidates.push({direction,origin,distance:d,id});}
   candidates.sort((a,b)=>a.distance-b.distance||(a.id<b.id?-1:1));const seen=new Set<string>();
   for(const candidate of candidates.slice(0,r.maxContactRays)){out.contactRays++;const hit=field.ray(candidate.origin,candidate.direction,candidate.distance+field.size*.1);if(!hit)continue;const id=key(hit.cell.x,hit.cell.y,hit.cell.z);if(seen.has(id))continue;seen.add(id);const source=context.elements.states.get(id);if(!source)continue;const material=materialDefinition(hit.cell.material);if(hit.distance<.68&&material.combustible&&!(hit.cell.object&&context.elements.protectedObjects.has(hit.cell.object)))fire ||=source.fire>0&&source.wet<=0;if(hit.distance<.37){wet ||=source.wet>0;charge ||=source.charge>0&&material.conductive;}}
  }
  if(wet)s.wet=r.wet;
  if(s.wet>0)s.burning=0;else if(fire){s.burning=r.burning;s.fright=r.fright;}
  if(charge&&!s.chargeContact&&!s.shockCooldown){s.shock=r.shock;s.shockCooldown=r.shockCooldown;s.fright=Math.max(s.fright,2);}s.chargeContact=charge;
 }
 tick(dt:number,context:HomesteadAnimalContext):HomesteadAnimalTickResult {
  const out:HomesteadAnimalTickResult={recovered:false,contactRays:0,skyRays:0};if(!Number.isFinite(dt)||dt<=0)return out;
  const s=this.state;out.recovered=this.reconcileTerrain(context);s.accumulator+=Math.min(dt,r.maxDt);
  while(s.accumulator>=r.step-1e-9){
   s.accumulator=Math.max(0,s.accumulator-r.step);if(s.accumulator<1e-9)s.accumulator=0;
   s.phase=(s.phase+r.step)%36;s.rescueWait=decay(s.rescueWait,r.step);
   for(const name of ['wet','burning','fright','shock','shockCooldown'] as const)s[name]=decay(s[name],r.step);
   if(s.recovering){out.recovered=this.rescue(context)||out.recovered;continue;}
   s.contactAccumulator+=r.step;if(s.contactAccumulator>=r.contactStep-1e-9){s.contactAccumulator=Math.max(0,s.contactAccumulator-r.contactStep);if(s.contactAccumulator<1e-9)s.contactAccumulator=0;this.exposure(context,out);}
   const waypoint=waypoints[Math.floor(s.phase/6)],dx=home.x+waypoint.x-s.position.x,dz=home.z+waypoint.z-s.position.z,length=Math.hypot(dx,dz),speed=s.shock>0?0:s.fright>0?1.25:length>.12?.45:0;
   // Fear returns toward home instead of running out of camp. Desired velocity
   // is approached with acceleration; wind remains physical momentum.
   const gx=s.fright>0?home.x-s.position.x:dx,gz=s.fright>0?home.z-s.position.z:dz,n=Math.hypot(gx,gz),vx=n>.1?gx/n*speed:0,vz=n>.1?gz/n*speed:0;
   if(s.grounded){s.velocity.x+=(vx-s.velocity.x)*Math.min(1,r.step*4);s.velocity.z+=(vz-s.velocity.z)*Math.min(1,r.step*4);}
   if(context.wind&&vector(context.wind,-20,20)){s.velocity.x+=context.wind.x*.055*r.step;s.velocity.z+=context.wind.z*.055*r.step;}
   s.velocity.y-=r.gravity*r.step;this.limitVelocity();
   const horizontal=Math.hypot(s.velocity.x,s.velocity.z);if(horizontal>.08){const desired=Math.atan2(-s.velocity.x,-s.velocity.z),delta=Math.atan2(Math.sin(desired-s.yaw),Math.cos(desired-s.yaw)),yaw=Math.atan2(Math.sin(s.yaw+clamp(delta,-2*r.step,2*r.step)),Math.cos(s.yaw+clamp(delta,-2*r.step,2*r.step)));if(!this.blocked(context,s.position,yaw))s.yaw=yaw;}
   this.moveAxis('x',s.velocity.x*r.step,context);this.moveAxis('z',s.velocity.z*r.step,context);const falling=s.velocity.y<0;s.grounded=this.moveAxis('y',s.velocity.y*r.step,context)&&falling;
   if(s.position.y< -8){s.position.y=-8;s.recovering=true;s.recoveryReason='void';s.grounded=false;Object.assign(s.velocity,{x:0,y:0,z:0});out.recovered=this.rescue(context)||out.recovered;}
  }
  return out;
 }
}
