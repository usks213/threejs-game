import type {PlayerState} from '../../src/simulation/protocol';
import {finiteVec,type Vec3} from '../../src/world/types';

export interface CoopRecoveryAim {
 epoch:number;
 draws:number;
 health:number;
 player:PlayerState;
 target:Vec3|null;
}
/** A resumed renderer can aim between the old camera and a newly respawned
 * actor. Observe two distinct real draws before treating that view as settled.
 * This only gates the test click; the authority must still accept the edit. */
export function settledRecoveryAim(previous:CoopRecoveryAim,current:CoopRecoveryAim):boolean {
 if(![previous.epoch,current.epoch,previous.draws,current.draws].every(value=>Number.isSafeInteger(value)&&value>=0))return false;
 if(previous.epoch!==current.epoch||current.draws<=previous.draws)return false;
 if(![previous.health,current.health].every(health=>Number.isFinite(health)&&health>0)||!previous.player?.grounded||!current.player?.grounded)return false;
 if(!previous.target||!current.target||![previous.target,current.target,previous.player,current.player].every(finiteVec))return false;
 const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
 return distance(previous.player,current.player)<.03&&distance(previous.target,current.target)<.03;
}
