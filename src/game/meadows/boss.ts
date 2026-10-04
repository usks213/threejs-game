import type { Adventure } from '../adventure';
import type { EnemyState } from '../types';
import type { Vec3 } from '../../world/types';
import { reconcileCreature } from './obstacles';

export const STAG_ATTACKS = {
 antler: { range:4.5, trigger:4, arc:25*Math.PI/180, damage:20, windup:1.2, cooldown:5, element:'physical' },
 beam: { range:20, trigger:15, arc:45*Math.PI/180, damage:15, windup:2, cooldown:25, element:'lightning' },
 stomp: { range:10, trigger:6, arc:Math.PI*2, damage:15, windup:2.5, cooldown:40, element:'lightning' },
} as const;
export type StagAttack = keyof typeof STAG_ATTACKS;
export function inStagAttack(e:EnemyState,p:Vec3,kind:StagAttack):boolean{
 const a=STAG_ATTACKS[kind],dx=p.x-e.x,dz=p.z-e.z,d=Math.hypot(dx,dz);
 if(d>a.range||Math.abs(p.y-e.y)>3)return false;
 return kind==='stomp'||d<.01||(dx*Math.sin(e.attackYaw??0)+dz*Math.cos(e.attackYaw??0))/d>=Math.cos(a.arc/2);
}
/** Each move has its own timer. Aim locks when the tell begins so sidestepping works. */
export function stepStag(game:Adventure,e:EnemyState,dt:number):void{
 const sim=game.sim,s=game.state,actors=sim.targets.length?sim.targets:[{player:sim.player,adventure:game}];
 const target=actors.filter(a=>a.adventure.state.health>0).sort((a,b)=>Math.hypot(a.player.x-e.x,a.player.z-e.z)-Math.hypot(b.player.x-e.x,b.player.z-e.z))[0];
 if(!target)return;
 e.attackFlash=Math.max(0,(e.attackFlash??0)-dt);e.attackReady??={};
 const p=target.player,d=Math.hypot(p.x-e.x,p.z-e.z);e.cooldown=Math.max(0,e.cooldown-dt);
 if(e.windup>0){
  e.windup=Math.max(0,e.windup-dt);if(e.windup>0)return;
  const kind=(e.attackKind??'antler') as StagAttack,a=STAG_ATTACKS[kind];
  for(const actor of actors)if(inStagAttack(e,actor.player,kind))actor.adventure.hurtPlayer(a.damage,a.element,actor.player,e);
  e.attackFlash=.65;e.cooldown=1.5;e.attackReady[kind]=s.seconds+a.cooldown;
  return;
 }
 if(e.cooldown<=0){
  // Prefer the area move when crowded; otherwise rotate between available moves.
  const order:StagAttack[]=d<4?['stomp','antler','beam']:['beam','stomp','antler'];
  const kind=order.find(k=>d<STAG_ATTACKS[k].trigger&&(e.attackReady![k]??0)<=s.seconds);
  if(kind){e.attackKind=kind;e.attackYaw=Math.atan2(p.x-e.x,p.z-e.z);e.heading=e.attackYaw;e.windup=STAG_ATTACKS[kind].windup;return;}
 }
 if(d>2.8&&d<40){const previous={x:e.x,y:e.y,z:e.z};e.x+=(p.x-e.x)/d*2.6*dt;e.z+=(p.z-e.z)/d*2.6*dt;e.heading=Math.atan2(p.x-e.x,p.z-e.z);reconcileCreature(sim,e,previous);}
 const water=sim.fluid.immersion(e,2.4),flow=sim.fluid.current(e,2.4);
 if(water>0){const previous={x:e.x,y:e.y,z:e.z};e.x+=flow.x*water*.3*dt;e.z+=flow.z*water*.3*dt;reconcileCreature(sim,e,previous);}
}
