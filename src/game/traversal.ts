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
export interface TraversalSnapshot { gliding:boolean; climbing:boolean }
export const WIND_COLUMNS=[{x:10,z:-15,radius:3,top:44},{x:39,z:20,radius:4,top:44},{x:-48,z:-52,radius:4,top:44},{x:66,z:-26,radius:4,top:44}] as const;
/** Actor-local movement intent; world collisions and stamina remain authoritative. */
export class Traversal {
 gliding=false;climbing=false;
 constructor(private readonly game:Adventure){}
 action(kind:'glide'|'climb',id:string,aim:Vec3):string{
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
  this.climbing=!this.climbing;this.gliding=false;return this.climbing?'壁を登ります。もう一度押すと放します':'壁から手を放しました';
 }
 private wall():boolean{
  const p=this.game.sim.player,ctx=siteWalkingContext(this.game.sim);
  for(let distance=.35;distance<=.76;distance+=.1)if(ctx.solid({x:p.x+Math.sin(p.heading)*distance,y:p.y+.9,z:p.z+Math.cos(p.heading)*distance}))return true;
  return false;
 }
 private mantle():boolean{
  const sim=this.game.sim,p=sim.player;if(this.game.state.stamina<5)return false;const x=p.x+Math.sin(p.heading)*.8,z=p.z+Math.cos(p.heading)*.8,y=siteSupport(sim,x,z,p.y+1)??sim.groundAt(x,z,p.y+1);
  if(y-p.y>1.3||y<p.y-.2)return false;const ctx=skyContext(sim);
  for(const dx of[-.28,0,.28])for(const dz of[-.28,0,.28])for(const h of[.1,.8,1.45]){const point={x:x+dx,y:y+h,z:z+dz};if(ctx.solid(point)||ctx.occupied?.(point)||sim.skybound.state.parts.some(part=>{const v=partLocal(point,part),half=PART_HALF[part.kind];return Math.abs(v.x)<half.x&&Math.abs(v.y)<half.y&&Math.abs(v.z)<half.z;}))return false;}
  if(sim.targets.some(t=>t.adventure.owner!==this.game.owner&&Math.hypot(t.player.x-x,t.player.z-z)<.7&&Math.abs(t.player.y-y)<1.5))return false;
  Object.assign(p,{x,y:y+.02,z,vy:0,grounded:true});this.game.state.stamina-=5;return true;
 }
 beforeMove(_input:PlayerInput,dt:number):{handled:boolean;speed:number;wind?:{x:number;z:number}}{
  const state=this.game.state,p=this.game.sim.player;
  if(state.health<=0||state.stamina<=0||this.game.sim.fluid.immersion(p,1.45)>.35){this.stop();return {handled:false,speed:1};}
  if(this.climbing){
   if(!this.wall()){const mantled=this.mantle();this.climbing=false;return {handled:mantled,speed:mantled?0:1};}
   const y=p.y+1.6*dt;
   const candidate={x:p.x,y,z:p.z},clear=siteClear(this.game.sim,candidate)&&!this.game.sim.skybound.state.parts.some(part=>skyPartOverlapsCapsule(part,candidate,.3,1.7));
   if(!clear){this.climbing=false;return {handled:false,speed:1};}
   p.y=y;p.vy=0;p.grounded=false;state.stamina=Math.max(0,state.stamina-(foodEffect(state,'endurance')?9.8:14)*dt*((state.meadows?.wet??0)>0?1.8:1));if(state.meadows)state.meadows.exerting=true;return {handled:true,speed:0};
  }
  if(this.gliding){
   if(p.grounded){this.gliding=false;return {handled:false,speed:1};}
   const wind=WIND_COLUMNS.find(w=>Math.hypot(p.x-w.x,p.z-w.z)<w.radius&&p.y<w.top);
   p.vy=wind?4.5:Math.max(p.vy,-.4);state.stamina=Math.max(0,state.stamina-(wind?2:foodEffect(state,'endurance')?3.5:5)*dt);if(state.meadows)state.meadows.exerting=true;const breeze=adventureEnvironment(state.seconds,p).wind;return {handled:false,speed:1.5,wind:wind?undefined:breeze};
  }
  return {handled:false,speed:1};
 }
 snapshot():TraversalSnapshot{return {gliding:this.gliding,climbing:this.climbing};}
 stop():void{this.gliding=false;this.climbing=false;}
}
