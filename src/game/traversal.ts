import {DebugFlight} from './debug-flight';
import {canStand} from './crouch';
import {characterHeight} from '../physics/character-shape';
import {siteWalkingContext,siteSupport,siteClear} from './site-walking';
import {skyPartOverlapsCapsule} from './skybound/assembly-contacts';
import {skyContext} from './skybound/context';
import {local as partLocal} from './skybound/orientation';
import {PART_HALF} from './skybound/types';
import {foodEffect} from '../content/adventure-food';
import {adventureEnvironment} from '../environment/adventure';
import type { Adventure } from './adventure';
import type { PlayerInput } from '../simulation/protocol';
import type { Vec3 } from '../world/types';
export interface TraversalSnapshot { debugFlying?:boolean; debugFlightAvailable?:boolean; crouching?:boolean; gliding:boolean; climbing:boolean; swimming?:boolean; breath?:number; maxBreath?:number; warning?:string; grip?:'stone'|'wood'|'metal'|'ice'; hanging?:boolean }
export const WIND_COLUMNS=[{x:10,z:-15,radius:3,top:44},{x:39,z:20,radius:4,top:44},{x:-48,z:-52,radius:4,top:44},{x:66,z:-26,radius:4,top:44}] as const;
/** Actor-local movement intent; world collisions and stamina remain authoritative. */
export class Traversal {
 readonly debug:DebugFlight;
 gliding=false;climbing=false;
 private breath=12;private drownClock=0;private slipClock=0;private swimming=false;private warning:string|undefined;private grip:TraversalSnapshot['grip'];private hanging=false;private notice:string|undefined;private noticeTime=0;
 constructor(private readonly game:Adventure){this.debug=new DebugFlight(game);}
 action(kind:'glide'|'climb',id:string,aim:Vec3):string{
  if(this.debug.active)throw Error('先にデバッグ飛行を終了してください');
  if(id==='off'){this.stop();return '通常の移動に戻りました';}
  const p=this.game.sim.player;
  if(kind==='glide'&&id==='dive'){if(p.grounded)throw Error('空中で使ってください');this.stop();p.vy=Math.min(p.vy,-12);return '翼を閉じて急降下します。着地前に翼を開いてください';}
  if(kind==='glide'){
   if(!this.game.state.inventory.glider)throw Error('帆布の翼が必要です');
   if(p.grounded)throw Error('空中で翼を開いてください');
   this.gliding=!this.gliding;this.climbing=false;return this.gliding?'翼を開きました':'翼を閉じました';
  }
  if(Math.hypot(aim.x,aim.z)>.1)p.heading=Math.atan2(aim.x,aim.z);
  if(!this.wall())throw Error('登れる壁へ近づき、壁を向いてください');
  this.climbing=!this.climbing;this.gliding=false;return this.climbing?'移動入力で登り、入力を放すと掴まります。もう一度押すと放します':'壁から手を放しました';
 }
 private wall():boolean{
  const p=this.game.sim.player,ctx=siteWalkingContext(this.game.sim);
  for(let distance=.35;distance<=.76;distance+=.1){const at={x:p.x+Math.sin(p.heading)*distance,y:p.y+.9,z:p.z+Math.cos(p.heading)*distance};if(!ctx.solid(at))continue;const part=this.game.sim.skybound.state.parts.find(part=>{const q=partLocal(at,part),h=PART_HALF[part.kind];return Math.abs(q.x)<h.x&&Math.abs(q.y)<h.y&&Math.abs(q.z)<h.z;});this.grip=part?((part.frozen??0)>0?'ice':part.material):(ctx.material?.(at)??'stone');return true;}
  return false;
 }
 private mantle():boolean{
  const sim=this.game.sim,p=sim.player;if(this.game.state.stamina<5)return false;const x=p.x+Math.sin(p.heading)*.8,z=p.z+Math.cos(p.heading)*.8,y=siteSupport(sim,x,z,p.y+1)??sim.groundAt(x,z,p.y+1);
  if(y-p.y>1.3||y<p.y-.2)return false;const ctx=skyContext(sim);
  const clear=(at:Vec3)=>siteClear(sim,at)&&!sim.skybound.state.parts.some(part=>skyPartOverlapsCapsule(part,at,.3,1.7))&&!sim.targets.some(t=>t.adventure.owner!==this.game.owner&&Math.hypot(t.player.x-at.x,t.player.z-at.z)<.6&&Math.abs(t.player.y-at.y)<1.7);
  // Lift first and then cross the lip; every .1m sample must remain clear.
  const raised={x:p.x,y:Math.max(p.y,y+.02),z:p.z};
  for(let i=1,n=Math.max(1,Math.ceil((raised.y-p.y)/.1));i<=n;i++)if(!clear({...raised,y:p.y+(raised.y-p.y)*i/n}))return false;
  for(let i=1;i<=8;i++)if(!clear({x:p.x+(x-p.x)*i/8,y:raised.y,z:p.z+(z-p.z)*i/8}))return false;
  if((ctx.immersion?.({x,y:y+.02,z})??0)>.45)return false;
  Object.assign(p,{x,y:y+.02,z,vy:0,grounded:true});this.game.state.stamina-=5;return true;
 }
 beforeMove(input:PlayerInput,dt:number,authoritative=true):{handled:boolean;speed:number;wind?:{x:number;z:number}}{
  const state=this.game.state,p=this.game.sim.player;let blockedStand=false;if(this.game.sim.world.generator===4){if(state.meadows?.sneaking)p.crouching=true;else if(p.crouching){if(canStand(this.game))p.crouching=false;else blockedStand=true;}}
  const water=this.game.sim.fluid.immersion(p,characterHeight(p));this.swimming=water>.35;this.noticeTime=Math.max(0,this.noticeTime-dt);this.warning=blockedStand?'頭上が低いため、立てる場所までしゃがんで移動します':this.noticeTime>0?this.notice:undefined;
  if(this.game.sim.world.generator===4){const submerged=this.game.sim.fluid.immersion({x:p.x,y:p.y+characterHeight(p)-.25,z:p.z},.2)>.5;this.breath=Math.max(0,Math.min(12,this.breath+(submerged?-dt:dt*4)));
   if(state.health<=0){this.breath=12;this.drownClock=0;}else if(submerged&&this.breath<=0){this.drownClock+=dt;if(this.drownClock>=1){this.drownClock-=1;if(authoritative)this.game.hurtPlayer(5,'physical');}}else this.drownClock=0;
   if(submerged&&this.breath<=5)this.warning=`息が残り${Math.ceil(this.breath)}秒です。水面へ上がってください`;
  }
  if(this.debug.active&&state.health>0){this.debug.step(input,dt);return {handled:true,speed:0};}
  if(this.swimming&&state.stamina<=16)this.warning??='泳ぐ力が残りわずかです。動きを止めて浮くか、岸へ上がってください';
  if(state.health>0&&this.swimming&&input.jump&&Math.hypot(input.x,input.z)>.1){p.heading=Math.atan2(input.x,input.z);if(this.mantle()){this.stop();this.swimming=false;return{handled:true,speed:0};}}
  if(state.health<=0||state.stamina<=0||water>.35){this.stop();return {handled:false,speed:1};}
  if(this.climbing){
   if(!this.wall()){const mantled=this.mantle();this.climbing=false;return {handled:mantled,speed:mantled?0:1};}
   const wet=(state.meadows?.wet??0)>0,slippery=this.grip==='ice'||wet&&(this.grip==='metal'||this.grip==='stone');this.slipClock=slippery?this.slipClock+dt:0;
   const slipLimit=this.grip==='ice'?.8:this.grip==='metal'?1.5:3;if(slippery&&this.slipClock>Math.max(0,slipLimit-1))this.warning='滑りやすい壁です。間もなく手が離れます';
   if(state.stamina<=12)this.warning='掴まる力が残りわずかです。足場へ戻ってください';
   if(this.slipClock>slipLimit){this.stop();p.vy=Math.min(p.vy,-2);this.warning=this.notice='滑りやすい壁から手が離れました';this.noticeTime=2;return{handled:false,speed:1};}
   this.hanging=Math.hypot(input.x,input.z)<.1;const rate=this.grip==='metal'?1.6:this.grip==='ice'?2:1;
   const y=p.y+(this.hanging?0:1.6)*dt;
   const candidate={x:p.x,y,z:p.z},clear=siteClear(this.game.sim,candidate)&&!this.game.sim.skybound.state.parts.some(part=>skyPartOverlapsCapsule(part,candidate,.3,1.7));
   if(!clear){this.climbing=false;return {handled:false,speed:1};}
   p.y=y;p.vy=0;p.grounded=false;state.stamina=Math.max(0,state.stamina-(this.hanging?4:foodEffect(state,'endurance')?9.8:14)*dt*(wet?1.8:1)*rate);if(state.meadows)state.meadows.exerting=true;return {handled:true,speed:0};
  }
  if(this.gliding){
   if(p.grounded){this.gliding=false;return {handled:false,speed:1};}
   const wind=WIND_COLUMNS.find(w=>Math.hypot(p.x-w.x,p.z-w.z)<w.radius&&p.y<w.top);
   p.vy=wind?4.5:Math.max(p.vy,-.4);state.stamina=Math.max(0,state.stamina-(wind?2:foodEffect(state,'endurance')?3.5:5)*dt);if(state.meadows)state.meadows.exerting=true;const breeze=adventureEnvironment(state.seconds,p).wind;return {handled:false,speed:1.5,wind:wind?undefined:breeze};
  }
  return {handled:false,speed:1};
 }
 snapshot():TraversalSnapshot{return {debugFlying:this.debug.active,debugFlightAvailable:this.game.sim.debugFlightAllowed&&this.game.owner==='host'&&this.game.sim.world.generator===4,crouching:!!this.game.sim.player.crouching,gliding:this.gliding,climbing:this.climbing,swimming:this.swimming,breath:this.breath,maxBreath:12,warning:this.warning,grip:this.climbing?this.grip:undefined,hanging:this.climbing&&this.hanging};}
 stop():void{this.debug.clear();this.gliding=false;this.climbing=false;this.hanging=false;this.slipClock=0;}
}
