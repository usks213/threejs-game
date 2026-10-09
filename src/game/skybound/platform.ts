import type {Vec3} from '../../world/types';
import {insideBounds} from '../../world/types';
import {global,local,orientation,rotate} from './orientation';
import {skyPartOverlapsCapsule} from './assembly-contacts';
import {PART_HALF,type SkyContext,type SkyPart} from './types';
import {CHARACTER_RADIUS} from '../../physics/character-shape';

/** Foot height for an upright capsule tangent to the same oriented box used for
 * contact/rendering. A rounded foot needs extra height on a tilted plane. */
export function skySupportHeight(part:SkyPart,foot:Vec3,margin=.25):number|undefined{
 const h=PART_HALF[part.kind];let highest:number|undefined;
 for(const axis of ['x','y','z'] as const)for(const sign of [-1,1]){
  const direction={x:0,y:0,z:0};direction[axis]=sign;const normal=rotate(direction,orientation(part));if(normal.y<.65)continue;
  const y=part.position.y+(h[axis]-normal.x*(foot.x-part.position.x)-normal.z*(foot.z-part.position.z))/normal.y,p=local({x:foot.x,y,z:foot.z},part);
  if((['x','y','z'] as const).filter(a=>a!==axis).some(a=>Math.abs(p[a])>h[a]+margin))continue;
  const capsuleY=y+CHARACTER_RADIUS*(1/normal.y-1);
  highest=Math.max(highest??-Infinity,capsuleY);
 }return highest;
}
export interface DeckPassenger {id:string;part:number;local:Vec3;position:Vec3;height:number;supportOffset:number}
export function deckPassengers(parts:readonly SkyPart[],actors:SkyContext['actors'],excluded:ReadonlySet<string>):DeckPassenger[]{
 const result:DeckPassenger[]=[];
 for(const actor of actors){if(excluded.has(actor.id)||((actor.position as Vec3&{vy?:number}).vy??0)>0.1)continue;
  const support=parts.filter(part=>{const h=PART_HALF[part.kind];return Math.hypot(actor.position.x-part.position.x,actor.position.y-part.position.y,actor.position.z-part.position.z)<Math.hypot(h.x,h.y,h.z)+.3;}).map(part=>({part,y:skySupportHeight(part,actor.position)})).filter((v):v is {part:SkyPart;y:number}=>v.y!==undefined&&Math.abs(actor.position.y-v.y)<.13).sort((a,b)=>b.y-a.y||a.part.id-b.part.id)[0];
  if(support)result.push({id:actor.id,part:support.part.id,local:local(actor.position,support.part),position:actor.position,height:(actor.position as Vec3&{crouching?:boolean}).crouching?1:1.7,supportOffset:Math.max(0,actor.position.y-support.y)});
 }return result;
}
export function passengerPositions(passengers:readonly DeckPassenger[],poses:readonly SkyPart[]):{id:string;position:Vec3}[]{
 return passengers.map(p=>{const part=poses.find(part=>part.id===p.part)!,position=global(p.local,part),support=skySupportHeight(part,position);
  // Pitch/roll rotates the deck, not the upright character capsule. Recompute
  // its rounded-foot clearance rather than rotating a planar foot into the box.
  if(support!==undefined)position.y=support+p.supportOffset;
  return{id:p.id,position};});
}
/** Stop the deck before it carries a walker through a ceiling, wall, person or adjacent box. */
export function passengersClear(passengers:readonly DeckPassenger[],poses:readonly SkyPart[],all:readonly SkyPart[],context:SkyContext):boolean{
 if(!passengers.length)return true;
 const moving=new Set(poses.map(p=>p.id)),positions=passengerPositions(passengers,poses),obstacles=[...all.filter(p=>!moving.has(p.id)),...poses];
 for(const actor of positions){const foot=actor.position,passenger=passengers.find(p=>p.id===actor.id)!,height=passenger.height;if(skySupportHeight(poses.find(p=>p.id===passenger.part)!,foot)===undefined||!insideBounds(foot,context.bounds,.31)||foot.y+height>=context.bounds.maxY)return false;
  for(const y of Array.from({length:5},(_,i)=>.3+(height-.6)*i/4))for(const [x,z]of [[0,0],[.3,0],[-.3,0],[0,.3],[0,-.3],[.212,.212],[.212,-.212],[-.212,.212],[-.212,-.212]]){const point={x:foot.x+x,y:foot.y+y,z:foot.z+z};if(context.solid(point)||context.occupied?.(point))return false;}
  if(obstacles.some(part=>skyPartOverlapsCapsule(part,foot,.3,height)))return false;
  if(context.actors.some(other=>other.id!==actor.id&&(()=>{const p=positions.find(v=>v.id===other.id)?.position??other.position;return Math.hypot(foot.x-p.x,foot.z-p.z)<.6&&Math.abs(foot.y-p.y)<1.7;})()))return false;
 }return true;
}
export function carryPassengers(passengers:readonly DeckPassenger[],poses:readonly SkyPart[]):void{
 const positions=passengerPositions(passengers,poses);for(let i=0;i<passengers.length;i++)Object.assign(passengers[i].position,positions[i].position,{vy:0,grounded:true});
}
