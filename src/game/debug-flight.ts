import type {Adventure} from './adventure';
import type {PlayerInput} from '../simulation/protocol';
import type {Vec3} from '../world/types';
import {characterHeight} from '../physics/character-shape';
import {siteClear,siteSupport} from './site-walking';
import {safeSavedRespawn,safeStartRespawn} from './respawn-safety';

/** Temporary single-player inspection mode. Never serialized as a player ability. */
export class DebugFlight {
 active=false;
 private launch:Vec3|undefined;
 constructor(private readonly game:Adventure){}
 action(id:string):string {
  const sim=this.game.sim,p=sim.player;
  if(!sim.debugFlightAllowed||this.game.owner!=='host')throw Error('デバッグ飛行はひとりプレイ専用です。協力プレイでは使えません');
  if(id!=='on'&&id!=='off')throw Error('デバッグ飛行の操作が不正です');
  if(id==='off'){
   if(!this.active)return 'デバッグ飛行はOFFです';
   const landing=this.landing()??this.savedPosition();
   Object.assign(p,landing,{vy:0,grounded:false});this.clear();
   return 'デバッグ飛行を終了し、安全な足場へ戻りました';
  }
  if(this.active)return 'デバッグ飛行中です';
  if(this.game.state.health<=0)throw Error('復活を待ってください');
  if(sim.world.generator!==4)throw Error('デバッグ飛行は冒険ワールドで使えます');
  if(sim.companions.isRiding(this.game.owner)||sim.skybound.isRiding(this.game.owner)||this.game.state.meadows?.riding)throw Error('乗り物から降りてからデバッグ飛行を使ってください');
  const launch=this.landing()??safeStartRespawn(sim,this.game.owner);
  if(!launch)throw Error('安全な復帰先がありません。出発点の足場を確保してください');
  this.game.traversal.stop();this.launch=launch;this.active=true;p.vy=0;p.grounded=false;
  return 'デバッグ飛行 ON · スタミナ不要 · 移動＋上昇／下降。終了すると安全な足場へ戻ります';
 }
 step(input:PlayerInput,dt:number):void {
  const sim=this.game.sim,p=sim.player,b=sim.world.bounds;
  if(!sim.debugFlightAllowed||this.game.owner!=='host'||this.game.state.health<=0){this.clear();return;}
  const axis=(value:number|undefined)=>Number.isFinite(value)?Math.max(-1,Math.min(1,value!)):0;
  const x=axis(input.x),z=axis(input.z),length=Math.max(1,Math.hypot(x,z)),seconds=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
  const delta={x:x/length*5.1*seconds,y:axis(input.debugVertical)*4.5*seconds,z:z/length*5.1*seconds};
  const steps=Math.max(1,Math.ceil(Math.hypot(delta.x,delta.y,delta.z)/.08));
  // Swept, axis-separated contact keeps the glide-like movement outside terrain,
  // carved buildings, trees and moving sky parts rather than becoming noclip.
  for(let i=0;i<steps;i++)for(const key of ['y','x','z'] as const){
   if(!delta[key])continue;
   const next={x:p.x,y:p.y,z:p.z};next[key]+=delta[key]/steps;
   next.x=Math.max(b.minX+.4,Math.min(b.maxX-.4,next.x));next.z=Math.max(b.minZ+.4,Math.min(b.maxZ-.4,next.z));next.y=Math.max(b.minY+.2,Math.min(b.maxY-characterHeight(p)-.2,next.y));
   if(siteClear(sim,next))Object.assign(p,next);
  }
  if(x||z)p.heading=Math.atan2(x,z);p.vy=0;p.grounded=false;
  if(this.game.state.meadows)this.game.state.meadows.exerting=false;
 }
 /** Autosave keeps a validated launch position, never a stranded airborne save. */
 savedPosition():Vec3 {
  if(this.launch&&safeSavedRespawn(this.game.sim,this.launch,this.game.owner))return {...this.launch};
  const fallback=this.landing()??safeStartRespawn(this.game.sim,this.game.owner);
  if(!fallback)throw Error('デバッグ飛行中の安全な保存先がありません。安全な足場へ移動してください');
  return {...fallback};
 }
 private landing():Vec3|undefined {
  const sim=this.game.sim,p=sim.player;
  for(let y=p.y;y>=sim.world.bounds.minY+.4;y-=1){
   const support=siteSupport(sim,p.x,p.z,y);if(support===undefined||support>p.y+.1)continue;
   const point={x:p.x,y:support+.02,z:p.z};
   if(safeSavedRespawn(sim,point,this.game.owner))return point;
  }
  return undefined;
 }
 clear():void{this.active=false;this.launch=undefined;}
}
