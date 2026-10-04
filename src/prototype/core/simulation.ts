import { createArena, creatureVoxels, setDoor } from './world';
import { direction, type Vec3, type Hit } from './voxel';
import { VoxelWater } from './water';
import { attacks,attackPose,bladeWorld,bodyCapsules,segmentDistance,facing,transformPoint,type AttackKind,type WeaponPose } from './motion';
export interface Controls {x:number;z:number;sprint:boolean;block:boolean;water:boolean}
export type Action='attack'|'heavy'|'dodge'|'jump'|'interact'|'heal'|'tool'|'sword'|'chisel';
export interface Event {kind:'swing'|'hit'|'hurt'|'parry'|'step'|'interact'|'water'|'break';text?:string}
export interface Enemy {id:number;position:Vec3;yaw:number;hp:number;vy:number;phase:'idle'|'windup'|'strike'|'recover'|'stagger'|'dead';time:number;hit:boolean;attack:AttackKind;hitstop:number;stride:number;interrupted?:WeaponPose}
export interface Target {hit:Hit;enemy?:Enemy;label:string;action:string}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export class CoreSimulation {
 readonly arena=createArena();readonly water=new VoxelWater(this.arena.field);readonly enemyShape=creatureVoxels();
 readonly player={position:{x:0,y:.25,z:6},yaw:0,pitch:0,hp:100,stamina:100,vy:0,grounded:true,flasks:1,tool:false,phase:'idle' as 'idle'|'windup'|'strike'|'recover'|'dodge',time:0,heavy:false,hit:false,blockTime:0,dodgeX:0,dodgeZ:0,attack:'slash' as AttackKind,combo:0,queued:'' as ''|'attack'|'heavy',hitstop:0,vx:0,vz:0,stride:0,guard:0,impact:0};
 readonly enemies:Enemy[]=[{id:0,position:{x:0,y:.25,z:-6},yaw:0,hp:100,vy:0,phase:'idle',time:0,hit:false,attack:'slash',hitstop:0,stride:0},{id:1,position:{x:2,y:.25,z:-9},yaw:0,hp:100,vy:0,phase:'idle',time:0,hit:false,attack:'overhead',hitstop:0,stride:0}];
 readonly events:Event[]=[];seconds=0;waterOn=false;defeated=0;private fluidTime=0;private footTime=0;private regenDelay=0;
 look(dx:number,dy:number){const weight=this.player.phase==='strike'?.28:this.player.phase==='windup'?.65:1;this.player.yaw-=dx*weight;this.player.pitch=clamp(this.player.pitch-dy*weight,-Math.PI/2+.03,Math.PI/2-.03);}
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
  if(p.phase!=='idle'){if(p.phase==='recover'&&p.time>attacks[p.attack].recover*.55)p.queued=action==='heavy'?'heavy':'attack';return;}
  if(input.block)return;
  p.attack=action==='heavy'?'overhead':p.combo%2?'return':'slash';const cost=p.tool?12:attacks[p.attack].cost;
  if(p.stamina<cost){this.events.push({kind:'interact',text:'スタミナ不足'});return;}
  p.combo++;p.phase='windup';p.time=0;p.heavy=action==='heavy';p.hit=false;p.stamina-=cost;this.regenDelay=.85;
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
 pose(){const p=this.player;return attackPose(p.attack,p.phase,p.time);}
 enemyPose(e:Enemy){const pose=attackPose(e.attack,e.phase,e.time,1.35);if((e.phase==='stagger'||e.phase==='dead')&&e.interrupted){const u=clamp(e.time/(e.phase==='dead'?.8:.35),0,1),t=u*u*(3-2*u),a=e.interrupted,mix=(x:number,y:number)=>x+(y-x)*t;return {grip:{x:mix(a.grip.x,pose.grip.x),y:mix(a.grip.y,pose.grip.y),z:mix(a.grip.z,pose.grip.z)},tip:{x:mix(a.tip.x,pose.tip.x),y:mix(a.tip.y,pose.tip.y),z:mix(a.tip.z,pose.tip.z)},twist:mix(a.twist,pose.twist),lean:mix(a.lean,pose.lean),step:mix(a.step,pose.step)};}return pose;}
 /** Continuous blade sweep: contact follows the rendered edge, including head/body and walls. */
 private melee(before:WeaponPose,after:WeaponPose){
  const p=this.player;if(p.hit)return;
  if(p.tool){const target=this.target(2.5);if(target&&!target.enemy){this.arena.field.carve(target.hit.point,p.heavy?.5:.27);this.water.refreshSolids();p.hit=true;this.events.push({kind:'break',text:'SDFを削った'});}return;}
  const a=bladeWorld(before,p.position,p.yaw,p.pitch),b=bladeWorld(after,p.position,p.yaw,p.pitch),steps=Math.max(1,Math.ceil(Math.hypot(b.tip.x-a.tip.x,b.tip.y-a.tip.y,b.tip.z-a.tip.z)/.035));
  for(let i=0;i<=steps;i++){const t=i/steps,lerp=(u:Vec3,v:Vec3)=>({x:u.x+(v.x-u.x)*t,y:u.y+(v.y-u.y)*t,z:u.z+(v.z-u.z)*t}),grip=lerp(a.grip,b.grip),tip=lerp(a.tip,b.tip),edge={x:tip.x-grip.x,y:tip.y-grip.y,z:tip.z-grip.z},length=Math.hypot(edge.x,edge.y,edge.z),wall=this.arena.field.ray(grip,edge,length);
   const end=wall?wall.point:tip;
   for(const e of this.enemies){if(e.hp<=0)continue;for(const body of bodyCapsules(e.position,e.yaw,this.enemyPose(e))){if(segmentDistance(grip,end,body.a,body.b)>body.r+.035)continue;
    const damage=Math.round(attacks[p.attack].damage*(body.zone==='head'?1.35:1));e.hp=Math.max(0,e.hp-damage);p.hit=true;p.hitstop=.065;p.impact=1;
    if(!e.hp){e.interrupted=this.enemyPose(e);e.phase='dead';e.time=0;this.defeated++;}else if(p.heavy){e.interrupted=this.enemyPose(e);e.phase='stagger';e.time=0;}
    this.events.push({kind:'hit',text:e.hp?(body.zone==='head'?'頭部に命中':'命中'):'番兵を倒した'});return;
   }}
   if(wall){p.hit=true;p.hitstop=.08;p.impact=.8;const o=wall.cell.object?this.arena.objects.get(wall.cell.object):null;
    if(o?.kind==='tree'){o.hp-=p.heavy?2:1;if(o.hp<=0)this.arena.field.removeObject(o.id);this.events.push({kind:o.hp<=0?'break':'hit',text:o.hp<=0?'樹木を伐採':'木に命中'});}else this.events.push({kind:'parry',text:'刃が壁に当たった'});return;
   }
  }
 }
 private settle(position:Vec3,vy:number,dt:number,height=1.65){const field=this.arena.field,next=position.y+vy*dt,trial={...position,y:next};
  if(!field.overlaps(trial,.27,height)){position.y=next;return {vy,grounded:false};}
  if(vy>0)return {vy:0,grounded:false};let lo=next,hi=position.y+.05;for(let i=0;i<10;i++){const mid=(lo+hi)/2;if(field.overlaps({...position,y:mid},.27,height))lo=mid;else hi=mid;}position.y=hi;return {vy:0,grounded:true};
 }
 tick(dt:number,input:Controls){
  const p=this.player;this.seconds+=dt;if(p.hp<=0)return;
  const blocking=input.block&&p.phase==='idle'&&p.stamina>0&&!p.tool;p.blockTime=blocking?p.blockTime+dt:0;
  this.regenDelay=Math.max(0,this.regenDelay-dt);if(!blocking&&this.regenDelay===0&&p.phase==='idle')p.stamina=Math.min(100,p.stamina+27*dt);
  p.guard+=(Number(blocking)-p.guard)*(1-Math.exp(-dt*14));p.impact=Math.max(0,p.impact-dt*5);
  const m=this.axes(input),length=Math.hypot(m.x,m.z),speed=p.phase==='dodge'?0:blocking?1.05:p.phase!=='idle'?.8:input.sprint&&p.stamina>0?3.7:input.z<0?1.7:2.5;
  if(length&&input.sprint&&p.phase==='idle'&&!blocking){p.stamina=Math.max(0,p.stamina-18*dt);this.regenDelay=.45;}
  const k=1-Math.exp(-dt*(length?11:15));p.vx+=(m.x/Math.max(1,length)*speed-p.vx)*k;p.vz+=(m.z/Math.max(1,length)*speed-p.vz)*k;
  const oldPosition={...p.position};this.move(p.position,p.vx*dt,p.vz*dt);const travelled=Math.hypot(p.position.x-oldPosition.x,p.position.z-oldPosition.z);p.stride+=travelled*4.5;
  if(travelled>.002&&p.grounded){this.footTime+=travelled;if(this.footTime>.95){this.events.push({kind:'step'});this.footTime=0;}}
  const vertical=this.settle(p.position,p.vy-14*dt,dt);p.vy=vertical.vy;p.grounded=vertical.grounded;
  if(p.position.y<-4){p.hp=0;this.events.push({kind:'hurt',text:'落下した'});}
  const before=this.pose(),def=attacks[p.attack],oldPhase=p.phase;
  if(p.hitstop>0)p.hitstop=Math.max(0,p.hitstop-dt);else p.time+=dt;
  if(p.phase==='windup'&&p.time>=def.windup){p.phase='strike';p.time-=def.windup;this.events.push({kind:'swing'});}
  if(p.phase==='strike'){this.melee(before,this.pose());if(p.time>=def.strike){p.phase='recover';p.time-=def.strike;}}
  const after=this.pose();if(oldPhase==='windup'||oldPhase==='strike'||oldPhase==='recover'){const forward=direction(p.yaw,0),step=after.step-before.step;this.move(p.position,forward.x*step,forward.z*step);}
  if(p.phase==='recover'&&p.time>=def.recover){p.phase='idle';p.time=0;const queued=p.queued;p.queued='';if(queued)this.action(queued,input);}
  if(p.phase==='idle'&&p.time>1.2)p.combo=0;
  if(p.phase==='dodge'){this.move(p.position,p.dodgeX*4.1*dt,p.dodgeZ*4.1*dt);if(p.time>=.36){p.phase='idle';p.time=0;}}
  for(const e of this.enemies){this.enemyTick(e,dt,blocking);if(e.hp<=0)continue;const vertical=this.settle(e.position,e.vy-14*dt,dt,1.7);e.vy=vertical.vy;if(e.position.y<-4){e.hp=0;e.phase='dead';this.defeated++;}}
  this.fluidTime+=dt;if(this.fluidTime>=.1){this.fluidTime=0;if(this.waterOn||input.water)for(let z=20;z<26;z++)this.water.add(2,10,z,.8);this.water.step();}
 }
 private enemyTick(e:Enemy,dt:number,blocking:boolean){
  if(e.hp<=0){e.time+=dt;return;}const p=this.player,dx=p.position.x-e.position.x,dz=p.position.z-e.position.z,distance=Math.hypot(dx,dz),def=attacks[e.attack],slow=1.35,before=this.enemyPose(e);
  if(e.hitstop>0)e.hitstop=Math.max(0,e.hitstop-dt);else e.time+=dt;
  if(e.phase==='idle'){
   if(distance>10)return;e.yaw=Math.atan2(-dx,-dz);
   if(distance>1.45){const old={...e.position};this.move(e.position,dx/distance*1.25*dt,dz/distance*1.25*dt,1.7);e.stride+=Math.hypot(e.position.x-old.x,e.position.z-old.z)*5;
    if(Math.hypot(e.position.x-old.x,e.position.z-old.z)<.001)this.move(e.position,-dz/distance*.6*dt,dx/distance*.6*dt,1.7);
   }else{e.phase='windup';e.time=0;e.hit=false;}
  }else if(e.phase==='windup'){
   if(e.time<def.windup*slow*.6){const desired=Math.atan2(-dx,-dz),delta=Math.atan2(Math.sin(desired-e.yaw),Math.cos(desired-e.yaw));e.yaw+=clamp(delta,-dt*1.6,dt*1.6);}
   if(e.time>=def.windup*slow){e.phase='strike';e.time-=def.windup*slow;this.events.push({kind:'swing'});}
  }
  if(e.phase==='strike'){
   const after=this.enemyPose(e),a=bladeWorld(before,e.position,e.yaw),b=bladeWorld(after,e.position,e.yaw),steps=Math.max(1,Math.ceil(Math.hypot(b.tip.x-a.tip.x,b.tip.y-a.tip.y,b.tip.z-a.tip.z)/.035));
   if(!e.hit)for(let i=0;i<=steps;i++){const t=i/steps,grip={x:a.grip.x+(b.grip.x-a.grip.x)*t,y:a.grip.y+(b.grip.y-a.grip.y)*t,z:a.grip.z+(b.grip.z-a.grip.z)*t},tip={x:a.tip.x+(b.tip.x-a.tip.x)*t,y:a.tip.y+(b.tip.y-a.tip.y)*t,z:a.tip.z+(b.tip.z-a.tip.z)*t},edge={x:tip.x-grip.x,y:tip.y-grip.y,z:tip.z-grip.z},wall=this.arena.field.ray(grip,edge,Math.hypot(edge.x,edge.y,edge.z)),end=wall?.point??tip;
    if(bodyCapsules(p.position,p.yaw,this.pose()).some(c=>segmentDistance(grip,end,c.a,c.b)<c.r+.035)){
     e.hit=true;if(p.phase==='dodge'&&p.time>=.035&&p.time<.27)break;e.hitstop=.06;p.impact=1;
     if(blocking&&p.guard>.5&&facing(p.yaw,p.position,e.position)>.45&&segmentDistance(grip,end,transformPoint({x:-.38+p.guard*.2,y:1.035+p.guard*.37,z:-.4-p.guard*.15},p.position,p.yaw),transformPoint({x:-.38+p.guard*.2,y:1.035+p.guard*.37,z:-.4-p.guard*.15},p.position,p.yaw))<.44&&p.stamina>=18){p.stamina-=18;this.regenDelay=.8;
      if(p.blockTime<.19){e.interrupted=this.enemyPose(e);e.phase='stagger';e.time=0;this.events.push({kind:'parry',text:'パリィ'});}else this.events.push({kind:'parry',text:'ガード'});
     }else{p.hp=Math.max(0,p.hp-(e.attack==='overhead'?38:28));p.stamina=Math.max(0,p.stamina-8);this.events.push({kind:'hurt'});}break;
    }if(wall){e.hit=true;e.hitstop=.08;this.events.push({kind:'parry',text:'番兵の刃が壁に当たった'});break;}
   }
   if(e.phase==='strike'&&e.time>=def.strike*slow){e.phase='recover';e.time-=def.strike*slow;}
  }
  const after=this.enemyPose(e);if(e.phase==='windup'||e.phase==='strike'||e.phase==='recover'){const f=direction(e.yaw,0),step=after.step-before.step;this.move(e.position,f.x*step,f.z*step,1.7);}
  if((e.phase==='recover'&&e.time>=def.recover*slow+.3)||(e.phase==='stagger'&&e.time>=.95)){e.phase='idle';e.time=0;}
 }
}
