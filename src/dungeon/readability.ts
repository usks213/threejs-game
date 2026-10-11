import {meleeDefinition} from '../prototype/core/motion';
import {wallRay} from './world';
import type {Input,Snapshot} from './types';

type VisibleActor=Snapshot['actors'][number];
/** Aim information is presentation only. Never reveal a target behind a closed door. */
export function focusedOpponent(snapshot:Snapshot,look:Pick<Input,'yaw'|'pitch'>):VisibleActor|null {
 const own=snapshot.actors.find(a=>a.id===snapshot.you);
 if(!own||own.status!=='alive')return null;
 const eye={...own.position,y:own.position.y+1.52},cp=Math.cos(look.pitch);
 const forward={x:-Math.sin(look.yaw)*cp,y:Math.sin(look.pitch),z:-Math.cos(look.yaw)*cp};
 let closest=8,best:VisibleActor|null=null;
 for(const actor of [...snapshot.actors,...snapshot.enemies]){
  if(actor.id===own.id||actor.status!=='alive')continue;
  const center={...actor.position,y:actor.position.y+1.35};
  const dx=center.x-eye.x,dy=center.y-eye.y,dz=center.z-eye.z,range=Math.hypot(dx,dy,dz);
  if(range<.001||range>closest)continue;
  const dot=(dx*forward.x+dy*forward.y+dz*forward.z)/range;
  // A body-width cone stays useful at sword distance without selecting off-screen enemies.
  if(dot<Math.cos(Math.min(.24,.12+.24/range)))continue;
  if(wallRay(eye,center,snapshot.seed,snapshot.doors))continue;
  closest=range;best=actor;
 }
 return best;
}
export function combatReadout(actor:VisibleActor,equipmentKnown=false){
 const archetype=actor.weapon==='greatsword'?'greatsword':actor.weapon==='dagger'?'dagger':'sword';
 const timing=meleeDefinition(actor.kind,archetype);
 const duration=actor.phase==='windup'?timing.windup:actor.phase==='strike'?timing.strike:actor.phase==='recover'?timing.recover:actor.phase==='heal'?1.2:0;
 const label=actor.phase==='windup'?'振りかぶり':actor.phase==='strike'?'攻撃':actor.phase==='recover'?'立て直し':actor.cast<0?'弓を引く':actor.cast>0?'詠唱':actor.phase==='heal'?'回復・準備':actor.guard>.5?(equipmentKnown?(actor.bag.some(item=>item.kind==='shield')?'防御中':'盾なし'):'防御の構え'):'準備完了';
 return {label,phase:actor.phase,progress:duration?Math.min(1,Math.max(0,actor.time/duration)):1};
}
/** Ignore joins, new raids and healing: only confirmed damage creates feedback. */
export function receivedDamage(previous:Snapshot|null,next:Snapshot|null){
 if(!previous||!next||previous.raid!==next.raid||previous.you!==next.you)return 0;
 const before=previous.actors.find(a=>a.id===previous.you),after=next.actors.find(a=>a.id===next.you);
 return before?.status==='alive'&&after?Math.max(0,before.hp-after.hp):0;
}
