import type {Adventure} from './adventure';
import {BEACONS} from '../content/adventure-world';
import {skyContext} from './skybound/context';
import {local} from './skybound/orientation';
import {PART_HALF} from './skybound/types';
export function beaconTravel(game:Adventure,id:string):string{
 const b=BEACONS.find(b=>'beacon:'+b.id===id),s=game.state,sim=game.sim,p=sim.player;
 if(!b||(s.resources.find(n=>n.id===b.id)?.ready??0)<1e9)throw Error('灯した道標だけに移動できます');
 if(!p.grounded||game.attack>0||game.dodge>0||s.downed||sim.companions.isRiding(game.owner)||sim.skybound.isRiding(game.owner)||s.meadows?.riding)throw Error('安全な地面に立ち、搭乗や動作を終えてください');
 if(s.enemies.some(e=>e.health>0&&Math.hypot(e.x-p.x,e.y-p.y,e.z-p.z)<12))throw Error('敵が近くにいます。距離を取ってから移動してください');
 const ctx=skyContext(sim),base=s.resources.find(n=>n.id===b.id)!;
 for(const [dx,dz]of [[0,1.6],[1.6,0],[-1.6,0],[0,-1.6],[2.4,2.4],[-2.4,2.4]]){
  const x=base.x+dx,z=base.z+dz,y=sim.groundAt(x,z,base.y);if(Math.abs(y-base.y)>2)continue;
  if(sim.targets.some(t=>t.adventure.owner!==game.owner&&Math.hypot(t.player.x-x,t.player.z-z)<.8&&Math.abs(t.player.y-y)<1.8)||s.enemies.some(e=>e.health>0&&Math.hypot(e.x-x,e.y-y,e.z-z)<8))continue;
  let blocked=false;for(const a of[-.28,0,.28])for(const c of[-.28,0,.28])for(const h of[.1,.8,1.55]){const point={x:x+a,y:y+h,z:z+c};if(ctx.solid(point)||ctx.occupied?.(point)||sim.skybound.state.parts.some(part=>{const v=local(point,part),half=PART_HALF[part.kind];return Math.abs(v.x)<=half.x&&Math.abs(v.y)<=half.y&&Math.abs(v.z)<=half.z;}))blocked=true;}
  if(blocked||sim.fluid.immersion({x,y,z},1.45)>.3)continue;
  sim.skybound.release(game.owner);game.traversal.stop();Object.assign(p,{x,y:y+.02,z,vy:0,grounded:true});return b.name+'へ移動しました。世界の時間は進み続けています';
 }
 throw Error('道標の周りに安全な到着場所がありません。仲間に入口を空けてもらってください');
}
