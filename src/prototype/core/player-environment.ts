import {number,record} from '../../save/validation';
import {materialDefinition} from './materials';
import type {ElementSystem} from './elements';
import {key,type Vec3,type VoxelField} from './voxel';
import type {VoxelWater} from './water';

/** A capsule's exposure, not a destructible player voxel body or an inventory. */
export interface PlayerEnvironmentState {
 version:1;wet:number;burning:number;shock:number;shockCooldown:number;
 chargeContact:boolean;accumulator:number;
}
export type PlayerArmorMaterial=0|6|10;
export interface PlayerEnvironmentContext {
 position:Vec3;field:VoxelField;elements:ElementSystem;water:VoxelWater;
 armorMaterial?:PlayerArmorMaterial;rain?:boolean;
 regionalWater?:{min:Vec3;max:Vec3;surfaceY:number};
}
export interface PlayerEnvironmentResult {
 damage:number;fireDamage:number;shockDamage:number;ignited:boolean;extinguished:boolean;shocked:boolean;
 /** Diagnostic work bounds, including all fixed steps performed by this call. */
 contactRays:number;skyRays:number;
}
export const PLAYER_ENVIRONMENT_RULES={step:.1,maxDt:.5,maxContactRays:12,maxStates:256,radius:.27,height:1.65,fireReach:.32,touchReach:.06,wet:5,rainWet:2,burning:4,shock:.55,shockCooldown:1.8,fireDamagePerSecond:6} as const;
export function createPlayerEnvironmentState():PlayerEnvironmentState {return {version:1,wet:0,burning:0,shock:0,shockCooldown:0,chargeContact:false,accumulator:0};}
export function validPlayerEnvironmentState(value:unknown):value is PlayerEnvironmentState {
 if(!record(value)||Object.keys(value).length!==7||!Object.keys(value).every(k=>Object.hasOwn(createPlayerEnvironmentState(),k))||value.version!==1||typeof value.chargeContact!=='boolean')return false;
 return number(value.wet,0,PLAYER_ENVIRONMENT_RULES.wet)&&number(value.burning,0,PLAYER_ENVIRONMENT_RULES.burning)&&number(value.shock,0,PLAYER_ENVIRONMENT_RULES.shock)&&number(value.shockCooldown,0,PLAYER_ENVIRONMENT_RULES.shockCooldown)&&number(value.accumulator,0,PLAYER_ENVIRONMENT_RULES.step-Number.EPSILON);
}
/** Call only after validation at an external boundary; never share this DTO between actors. */
export const clonePlayerEnvironmentState=(value:PlayerEnvironmentState):PlayerEnvironmentState=>({...value});
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const decay=(value:number,dt:number)=>{const next=Math.max(0,value-dt);return next<1e-9?0:next;};
const result=():PlayerEnvironmentResult=>({damage:0,fireDamage:0,shockDamage:0,ignited:false,extinguished:false,shocked:false,contactRays:0,skyRays:0});
function touchingWater(context:PlayerEnvironmentContext){
 const {position:p,water:w,regionalWater:lake}=context,ankles=p.y+.08;
 if(lake&&p.x>lake.min.x&&p.x<lake.max.x&&p.z>lake.min.z&&p.z<lake.max.z&&ankles>=lake.min.y&&ankles<lake.surfaceY)return true;
 // The highest surface alone is insufficient: a player below a water-bearing
 // platform must not inherit the water from above it. Sample actual ankle volume.
 const x=Math.floor((p.x-w.origin.x)/w.size),y=Math.floor((ankles-w.origin.y)/w.size),z=Math.floor((p.z-w.origin.z)/w.size);
 if(x<0||y<0||z<0||x>=w.nx||y>=w.ny||z>=w.nz)return false;
 const i=w.index(x,y,z),amount=w.volume[i];
 return !w.blocked[i]&&amount>.02&&ankles<w.origin.y+(y+amount)*w.size;
}
function sampleContact(context:PlayerEnvironmentContext){
 const {position:p,field,elements}=context,rules=PLAYER_ENVIRONMENT_RULES;
 const candidates:{id:string;origin:Vec3;direction:Vec3;distance:number}[]=[];
 let visited=0;
 // The shared terrain system already limits its map to 256 states. Keep our own
 // bound too, so an invalid in-memory caller cannot turn this into a world scan.
 for(const [id,state] of elements.states){
  if(visited++>=rules.maxStates)break;
  if(state.fire<=0&&state.wet<=0&&state.charge<=0)continue;
  const origin={x:p.x,y:clamp(state.position.y,p.y+rules.radius,p.y+rules.height-rules.radius),z:p.z};
  const direction={x:state.position.x-origin.x,y:state.position.y-origin.y,z:state.position.z-origin.z},distance=Math.hypot(direction.x,direction.y,direction.z);
  if(distance<=rules.radius+rules.fireReach+field.size*Math.sqrt(3)/2)candidates.push({id,origin,direction,distance});
 }
 candidates.sort((a,b)=>a.distance-b.distance||(a.id<b.id?-1:a.id>b.id?1:0));
 let fire=false,wet=false,charge=0,rays=0;
 const seen=new Set<string>();
 for(const candidate of candidates){
  if(rays>=rules.maxContactRays)break;
  rays++;
  // Read the FIRST occupied surface. Truncating a ray before the source center
  // could miss a thin separating wall; matching an object name also permits
  // damage through opposite sides of the same wall, so neither is used here.
  const hit=field.ray(candidate.origin,candidate.direction,candidate.distance+field.size*.1);
  if(!hit)continue;
  const id=key(hit.cell.x,hit.cell.y,hit.cell.z);if(seen.has(id))continue;seen.add(id);
  const state=elements.states.get(id);if(!state)continue;
  const material=materialDefinition(hit.cell.material);
  if(hit.distance<=rules.radius+rules.fireReach&&material.combustible&&!(hit.cell.object&&elements.protectedObjects.has(hit.cell.object)))fire ||=state.fire>0&&state.wet<=0;
  if(hit.distance<=rules.radius+rules.touchReach){wet ||=state.wet>0;if(material.conductive)charge=Math.max(charge,clamp(state.charge,0,1));}
 }
 return {fire,wet,charge,rays};
}
/** Shared-rule environmental exposure for a living player. The owner applies the
 * returned HP damage and presentation feedback, and may slow movement while shock>0.
 *
 * There is intentionally no direct player-target/splash API and no player burn
 * propagation. Spells from either party member may still create shared hazardous
 * terrain; that terrain threatens BOTH players, including its caster. Water on an
 * actually touched surface, rain or immersion can extinguish either player.
 *
 * This never edits terrain, health, gear, progression or drops. Call once per actor
 * tick, do not copy the primary actor's state to a newly created companion, and
 * clear it on respawn. Absent optional legacy save fields should use a fresh DTO.
 */
export function stepPlayerEnvironment(state:PlayerEnvironmentState,dt:number,context:PlayerEnvironmentContext):PlayerEnvironmentResult {
 const out=result(),rules=PLAYER_ENVIRONMENT_RULES;
 if(!Number.isFinite(dt)||dt<=0)return out;
 state.accumulator+=Math.min(dt,rules.maxDt);
 while(state.accumulator>=rules.step-1e-9){
  state.accumulator=Math.max(0,state.accumulator-rules.step);if(state.accumulator<1e-9)state.accumulator=0;
  state.wet=decay(state.wet,rules.step);state.shock=decay(state.shock,rules.step);state.shockCooldown=decay(state.shockCooldown,rules.step);
  const contact=sampleContact(context);out.contactRays+=contact.rays;
  let rain=false;if(context.rain){out.skyRays++;rain=!context.field.ray({x:context.position.x,y:context.position.y+rules.height+.05,z:context.position.z},{x:0,y:1,z:0},24);}
  if(touchingWater(context)||contact.wet)state.wet=rules.wet;else if(rain)state.wet=Math.max(state.wet,rules.rainWet);
  const wasBurning=state.burning>0,armor=materialDefinition(context.armorMaterial??0);
  if(state.wet>0)state.burning=0;
  else if(contact.fire)state.burning=Math.max(state.burning,armor.combustible?rules.burning:armor.conductive?1.5:2);
  out.ignited ||=!wasBurning&&state.burning>0;out.extinguished ||=wasBurning&&state.burning===0;
  if(state.burning>0){out.fireDamage+=Math.min(rules.step,state.burning)*rules.fireDamagePerSecond;state.burning=decay(state.burning,rules.step);}
  // A continuous live contact is one pulse, however long an external caller
  // keeps it charged. The cooldown is longer than ElementSystem's 0.5s maximum
  // charge lifetime, so leaving and returning cannot farm a second hit per cast.
  if(contact.charge>0&&!state.chargeContact&&state.shockCooldown===0){
   out.shockDamage+=(12+(state.wet>0?12:0)+(armor.conductive?6:0))*contact.charge;
   state.shock=rules.shock;state.shockCooldown=rules.shockCooldown;out.shocked=true;
  }
  state.chargeContact=contact.charge>0;
 }
 out.damage=out.fireDamage+out.shockDamage;return out;
}
