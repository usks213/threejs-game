import {distance,wallRay} from './world';
import type {Input,Snapshot} from './types';

/** One focus contract for E and touch. Container reach matches server pickup reach. */
export function dungeonTarget(snapshot:Snapshot,input:Pick<Input,'yaw'|'pitch'>):string|null {
 const own=snapshot.actors.find(actor=>actor.id===snapshot.you);
 if(!own||snapshot.phase!=='raid'||own.status!=='alive')return null;
 const eye={...own.position,y:own.position.y+1.3};
 const targets=[...snapshot.doors,...snapshot.containers,...snapshot.exits].filter(target=>{
  const range='items'in target?2.5:2.6;
  if(distance(own.position,target.position)>range)return false;
  return !wallRay(eye,{...target.position,y:target.position.y+1.3},snapshot.seed,snapshot.doors.filter(door=>door.id!==target.id));
 });
 let best:string|null=null,score=-Infinity;
 for(const target of targets){
  const dx=target.position.x-own.position.x,dz=target.position.z-own.position.z,d=Math.max(.001,Math.hypot(dx,dz));
  const dot=(-Math.sin(input.yaw)*dx-Math.cos(input.yaw)*dz)/d,rank=dot*3-d*.25;
  if(dot<-.15)continue;
  if(rank>score){best=target.id;score=rank;}
 }
 return best;
}
