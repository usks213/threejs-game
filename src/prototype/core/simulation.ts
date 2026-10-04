import { createArena, creatureVoxels, setDoor } from './world';
import { direction, type Vec3, type Hit } from './voxel';
import { VoxelWater } from './water';
export interface Controls {x:number;z:number;sprint:boolean;block:boolean;water:boolean}
export type Action='attack'|'heavy'|'dodge'|'jump'|'interact'|'heal'|'tool'|'sword'|'chisel';
export interface Event {kind:'swing'|'hit'|'hurt'|'parry'|'step'|'interact'|'water'|'break';text?:string}
export interface Enemy {id:number;position:Vec3;yaw:number;hp:number;vy:number;phase:'idle'|'windup'|'strike'|'recover'|'stagger'|'dead';time:number;hit:boolean}
export interface Target {hit:Hit;enemy?:Enemy;label:string;action:string}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export class CoreSimulation {
 readonly arena=createArena();readonly water=new VoxelWater(this.arena.field);readonly enemyShape=creatureVoxels();
 readonly player={position:{x:0,y:.25,z:6},yaw:0,pitch:0,hp:100,stamina:100,vy:0,grounded:true,flasks:1,tool:false,phase:'idle' as 'idle'|'windup'|'strike'|'recover'|'dodge',time:0,heavy:false,hit:false,blockTime:0,dodgeX:0,dodgeZ:0};
 readonly enemies:Enemy[]=[{id:0,position:{x:0,y:.25,z:-6},yaw:0,hp:100,vy:0,phase:'idle',time:0,hit:false},{id:1,position:{x:2,y:.25,z:-9},yaw:0,hp:100,vy:0,phase:'idle',time:0,hit:false}];
 readonly events:Event[]=[];seconds=0;waterOn=false;defeated=0;private fluidTime=0;private footTime=0;private regenDelay=0;
 look(dx:number,dy:number){this.player.yaw-=dx;this.player.pitch=clamp(this.player.pitch-dy,-Math.PI/2+.03,Math.PI/2-.03);}
 eye():Vec3{return {...this.player.position,y:this.player.position.y+1.52};}
 target(range=2.75):Target|null {
  const p=this.player,eye=this.eye(),d=direction(p.yaw,p.pitch);let hit=this.arena.field.ray(eye,d,range),enemy:Enemy|undefined;
  for(const e of this.enemies){if(e.hp<=0)continue;const c=Math.cos(e.yaw),s=Math.sin(e.yaw),rel={x:eye.x-e.position.x,y:eye.y-e.position.y,z:eye.z-e.position.z};
   const local={x:c*rel.x-s*rel.z,y:rel.y,z:s*rel.x+c*rel.z},dir={x:c*d.x-s*d.z,y:d.y,z:s*d.x+c*d.z};const h=this.enemyShape.ray(local,dir,range);
   if(h&&(!hit||h.distance<hit.distance)){hit={...h,point:{x:eye.x+d.x*h.distance,y:eye.y+d.y*h.distance,z:eye.z+d.z*h.distance}};enemy=e;}
  }
  if(!hit)return null;if(enemy)return {hit,enemy,label:'灰の番兵',action:''};
  const object=hit.cell.object?this.arena.objects.get(hit.cell.object):null;
  if(!object)return p.tool?{hit,label:'Voxelを削る',action:'斬撃 / 左クリック'}:null;
  const action=object.kind==='door'?(object.open?'閉じる':'開く'):object.kind==='chest'?(object.open?'回収済み':'補給を取る'):object.kind==='valve'?(this.waterOn?'止水':'放水'):object.kind==='altar'?'番兵を復活':p.tool?'削る':'斬る';
  return {hit,label:object.name,action:object.kind==='tree'?action:object.kind==='chest'&&object.open?'':'E / 操作 · '+action};
 }
 action(action:Action,input:Controls){
  const p=this.player;if(p.hp<=0)return;
  if(action==='tool'||action==='sword'||action==='chisel'){if(p.phase==='idle')p.tool=action==='tool'?!p.tool:action==='chisel';return;}
  if(action==='heal'){if(p.phase==='idle'&&p.flasks&&p.hp<100){p.flasks--;p.hp=Math.min(100,p.hp+55);this.events.push({kind:'interact',text:'回復薬を使用'});}return;}
  if(action==='interact'){if(p.phase==='idle')this.interact();return;}
  if(action==='jump'){if(p.grounded&&p.stamina>=12){p.vy=5;p.grounded=false;p.stamina-=12;this.regenDelay=.6;}return;}
  if(action==='dodge'){if(p.phase!=='idle'||p.stamina<24)return;const m=this.axes(input),length=Math.hypot(m.x,m.z);p.dodgeX=length?m.x/length:Math.sin(p.yaw);p.dodgeZ=length?m.z/length:Math.cos(p.yaw);p.phase='dodge';p.time=0;p.stamina-=24;this.regenDelay=.8;return;}
  if(p.phase!=='idle'||input.block)return;
  const cost=p.tool?12:action==='heavy'?32:20;if(p.stamina<cost){this.events.push({kind:'interact',text:'スタミナ不足'});return;}
  p.phase='windup';p.time=0;p.heavy=action==='heavy';p.hit=false;p.stamina-=cost;this.regenDelay=.75;
 }
 private interact(){
  const target=this.target();if(!target||target.enemy||!target.hit.cell.object)return;const o=this.arena.objects.get(target.hit.cell.object);if(!o||o.kind==='tree')return;
  if(o.kind==='door'){setDoor(this.arena.field,!o.open);
   if(this.arena.field.overlaps(this.player.position)||this.enemies.some(e=>e.hp>0&&this.arena.field.overlaps(e.position,.27,1.7))){setDoor(this.arena.field,o.open);this.events.push({kind:'interact',text:'扉が体に当たるため動かせない'});return;}
   o.open=!o.open;
  }
  if(o.kind==='chest'&&!o.open){o.open=true;this.player.flasks+=2;this.arena.field.box({x:-3.25,y:1,z:-3.75},{x:-1.75,y:1.25,z:-3},0);this.events.push({kind:'interact',text:'回復薬 ×2'});}
  if(o.kind==='valve')this.waterOn=!this.waterOn;
  if(o.kind==='altar'){for(const e of this.enemies){e.hp=100;e.phase='idle';e.time=0;e.vy=0;e.position={x:e.id*2,y:.25,z:-6-e.id*3};}this.defeated=0;this.player.stamina=100;}
  this.events.push({kind:'interact',text:o.name+' · '+(o.kind==='valve'?(this.waterOn?'放水':'止水'):o.kind==='door'?(o.open?'開く':'閉じる'):'操作')});
 }
 private axes(input:Controls){const p=this.player;return {x:Math.cos(p.yaw)*input.x-Math.sin(p.yaw)*input.z,z:-Math.sin(p.yaw)*input.x-Math.cos(p.yaw)*input.z};}
 private move(position:Vec3,dx:number,dz:number,height=1.65){
  const field=this.arena.field,steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/.1));
  for(let i=0;i<steps;i++){for(const [axis,delta] of [['x',dx/steps],['z',dz/steps]] as const){const trial={...position,[axis]:position[axis]+delta};
   const bodies=[this.player.position,...this.enemies.filter(e=>e.hp>0).map(e=>e.position)];
   if(bodies.some(b=>b!==position&&Math.abs(b.y-trial.y)<1.65&&Math.hypot(b.x-trial.x,b.z-trial.z)<.55))continue;
   if(!field.overlaps(trial,.27,height))position[axis]+=delta;else if(!field.overlaps({...trial,y:trial.y+.26},.27,height)){position[axis]+=delta;position.y+=.25;}}}
 }
 private melee(){
  const p=this.player,target=this.target(p.tool?3:2.6);
  // Blade sweep samples a cone, but every sample is still occlusion-tested voxel DDA.
  let enemy=target?.enemy;
  if(!p.tool&&!enemy){const yaw=p.yaw;for(const offset of [-.24,-.12,.12,.24]){p.yaw=yaw+offset;enemy=this.target(2.6)?.enemy;if(enemy)break;}p.yaw=yaw;}
  if(enemy){enemy.hp=Math.max(0,enemy.hp-(p.heavy?55:32));
   if(!enemy.hp){enemy.phase='dead';enemy.time=0;this.defeated++;}
   else if(p.heavy){enemy.phase='stagger';enemy.time=0;}
   // Light hits do not cancel the enemy's committed attack; heavy hits and parries do.
   this.events.push({kind:'hit',text:enemy.hp?'命中':'番兵を倒した'});return;}
  if(!target)return;const c=target.hit.cell,o=c.object?this.arena.objects.get(c.object):null;
  if(p.tool){
   const radius=p.heavy?1:0;for(let x=-radius;x<=radius;x++)for(let y=-radius;y<=radius;y++)for(let z=-radius;z<=radius;z++)this.arena.field.set(c.x+x,c.y+y,c.z+z,0);
   this.water.refreshSolids();this.events.push({kind:'break',text:'Voxelを削った'});return;
  }
  if(o?.kind==='tree'){o.hp-=p.heavy?2:1;if(o.hp<=0){this.arena.field.removeObject(o.id);this.events.push({kind:'break',text:'Voxelの樹木を伐採'});}else this.events.push({kind:'hit'});}
 }
 tick(dt:number,input:Controls){
  const p=this.player;this.seconds+=dt;if(p.hp<=0)return;
  const blocking=input.block&&p.phase==='idle'&&p.stamina>0&&!p.tool;p.blockTime=blocking?p.blockTime+dt:0;
  this.regenDelay=Math.max(0,this.regenDelay-dt);if(!blocking&&this.regenDelay===0&&p.phase==='idle')p.stamina=Math.min(100,p.stamina+27*dt);
  const m=this.axes(input),length=Math.hypot(m.x,m.z),speed=p.phase==='dodge'?0:blocking?1.2:p.phase!=='idle'?1.15:input.sprint&&p.stamina>0?4.5:2.8;
  if(length&&input.sprint&&p.phase==='idle'&&!blocking){p.stamina=Math.max(0,p.stamina-18*dt);this.regenDelay=.45;}
  this.move(p.position,m.x/Math.max(1,length)*speed*dt,m.z/Math.max(1,length)*speed*dt);
  if(length&&p.grounded){this.footTime+=dt;if(this.footTime>.48){this.events.push({kind:'step'});this.footTime=0;}}
  // Vertical body collision: jump, editable terrain, ceilings and basin floor.
  p.vy-=14*dt;const nextY=p.position.y+p.vy*dt;
  if(p.vy<=0&&this.arena.field.overlaps({...p.position,y:nextY-.02})){const s=this.arena.field.size;p.position.y=Math.ceil((nextY-.005)/s)*s;p.grounded=true;p.vy=0;}
  else if(!this.arena.field.overlaps({...p.position,y:nextY})){p.position.y=nextY;p.grounded=false;}
  else p.vy=0;
  if(p.position.y<-4){p.hp=0;this.events.push({kind:'hurt',text:'落下した'});}
  p.time+=dt;
  if(p.phase==='windup'&&p.time>=(p.heavy?.46:.22)){p.phase='strike';p.time=0;this.events.push({kind:'swing'});}
  if(p.phase==='strike'&&!p.hit){p.hit=true;this.melee();}
  if(p.phase==='strike'&&p.time>=.15){p.phase='recover';p.time=0;}
  if(p.phase==='recover'&&p.time>=(p.heavy?.62:.36)){p.phase='idle';p.time=0;}
  if(p.phase==='dodge'){this.move(p.position,p.dodgeX*6.2*dt,p.dodgeZ*6.2*dt);if(p.time>=.36){p.phase='idle';p.time=0;}}
  for(const e of this.enemies){this.enemyTick(e,dt,blocking);if(e.hp<=0)continue;e.vy-=14*dt;const next=e.position.y+e.vy*dt;
   if(e.vy<=0&&this.arena.field.overlaps({...e.position,y:next-.02},.27,1.7)){e.position.y=Math.ceil((next-.005)/this.arena.field.size)*this.arena.field.size;e.vy=0;}
   else if(!this.arena.field.overlaps({...e.position,y:next},.27,1.7))e.position.y=next;else e.vy=0;
   if(e.position.y<-4){e.hp=0;e.phase='dead';this.defeated++;}
  }
  this.fluidTime+=dt;if(this.fluidTime>=.1){this.fluidTime=0;if(this.waterOn||input.water)for(let z=20;z<26;z++)this.water.add(2,10,z,.8);this.water.step();}
 }
 private enemyTick(e:Enemy,dt:number,blocking:boolean){
  if(e.hp<=0)return;const p=this.player,dx=p.position.x-e.position.x,dz=p.position.z-e.position.z,distance=Math.hypot(dx,dz);e.time+=dt;
  if(e.phase==='idle'){
   if(distance>10)return;e.yaw=Math.atan2(-dx,-dz);
   if(distance>1.65){const before={...e.position};this.move(e.position,dx/distance*1.45*dt,dz/distance*1.45*dt,1.7);
    if(Math.hypot(e.position.x-before.x,e.position.z-before.z)<.001)this.move(e.position,-dz/distance*.8*dt,dx/distance*.8*dt,1.7);
   }else{e.phase='windup';e.time=0;e.hit=false;}
  }else if(e.phase==='windup'&&e.time>=.68){e.phase='strike';e.time=0;}
  else if(e.phase==='strike'){
   if(!e.hit){e.hit=true;const f=direction(e.yaw,0),dot=(f.x*dx+f.z*dz)/Math.max(.01,distance),ray=this.arena.field.ray({...e.position,y:e.position.y+1},{x:dx,y:p.position.y-e.position.y,z:dz},distance);
    if(distance<2.1&&dot>.55&&Math.abs(p.position.y-e.position.y)<1.5&&(!ray||ray.distance>distance-.3)&&!(p.phase==='dodge'&&p.time>=.035&&p.time<.27)){
     const front=direction(p.yaw,0),facing=(front.x*-dx+front.z*-dz)/Math.max(.01,distance)>.45;
     if(blocking&&facing&&p.stamina>=18){p.stamina-=18;this.regenDelay=.8;if(p.blockTime<.19){e.phase='stagger';e.time=0;this.events.push({kind:'parry',text:'パリィ'});}else this.events.push({kind:'hit',text:'ガード'});}
     else{p.hp=Math.max(0,p.hp-28);p.stamina=Math.max(0,p.stamina-8);this.events.push({kind:'hurt'});}
    }
   }if(e.time>=.18&&e.phase==='strike'){e.phase='recover';e.time=0;}
  }else if((e.phase==='recover'&&e.time>=1.05)||(e.phase==='stagger'&&e.time>=.95)){e.phase='idle';e.time=0;}
 }
}
