import type { SkyboundSnapshot } from '../game/skybound/types';
import type { Vec3 } from '../world/types';
/** Renew only a currently observed hold. Never acquire a part or replay a hold. */
export class HeldPartHeartbeat {
 private last = -Infinity;
 next(parts:SkyboundSnapshot['parts'],owner:string,tick:number,player:Vec3,now:number,active:boolean):number|undefined {
  if(!active||!Number.isFinite(now)||now-this.last<1000)return;
  const part=parts.find(part=>part.lease?.owner===owner&&part.lease.expiresTick>tick&&!part.recalling&&Math.hypot(part.position.x-player.x,part.position.y-player.y,part.position.z-player.z)<=7);
  if(!part)return;
  this.last=now;return part.id;
 }
}
