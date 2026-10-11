/** Continuous acceptance driver. It only observes the authority and sends the same
 * input/action messages available to clients. No world/player/inventory fixtures.
 * This is an authority-layer route solver, not a browser or WebSocket receipt. */
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SessionAuthority} from '../src/simulation/session';
import type {ClientMessage,PlayerInput} from '../src/simulation/protocol';
import type {GameAction} from '../src/game/types';
import type {Vec3} from '../src/world/types';
import {SITES} from '../src/content/adventure-sites';
import {REGIONAL_RECORDS} from '../src/content/adventure-chapters';
import {validateSave} from '../src/save/format';

const IDLE:PlayerInput={x:0,z:0,jump:false};
const AIM:Vec3={x:0,y:0,z:-1};
export class ContinuousCoopJourney {
 room:SessionAuthority;
 readonly players=['journey-a','journey-b'];
 readonly trace:Record<string,unknown>[]=[];
 readonly completed:string[]=[];
 stage='new-world';
 private sequence=new Map<string,number>();
 constructor(readonly output='/tmp/voxel-continuous-journey',resume?:string,readonly quiet=false){
  mkdirSync(output,{recursive:true});const input=resume?readFileSync(resume,'utf8'):undefined;this.room=new SessionAuthority(input===undefined?null:validateSave(JSON.parse(input)),true);
  for(const id of this.players)this.room.join(id);
  this.event('start',{resume:resume??null,resumeSha256:input!==undefined?createHash('sha256').update(input).digest('hex'):undefined,players:this.players,seed:this.room.sim.world.bounds.seed,generator:this.room.sim.world.generator});
 }
 actor(id=this.players[0]){const actor=this.room.actors.get(id);if(!actor)throw Error(`Absent actor ${id}`);return actor;}
 get sim(){return this.room.sim;}
 event(kind:string,data:Record<string,unknown>={}){const event={kind,stage:this.stage,tick:this.sim.tick,...data};this.trace.push(event);if(!this.quiet&&kind!=='input')process.stdout.write(JSON.stringify(event)+'\n');}
 step(ticks=6,inputs:Record<string,PlayerInput>={}){this.trace.push({kind:'input',tick:this.sim.tick,ticks,inputs});for(let i=0;i<ticks;i++){for(const id of this.players){if(!this.room.actors.has(id))continue;const seq=(this.sequence.get(id)??0)+1;this.sequence.set(id,seq);this.room.input(id,inputs[id]??IDLE,seq);}this.room.step(IDLE);}}
 message(id:string,message:ClientMessage,waitTicks=6){this.step(waitTicks);try{const result=this.room.action(id,message);this.event('action',{player:id,message,result:result.message});return result;}catch(error){this.event('action-rejected',{player:id,message,error:String(error)});throw error;}}
 act(action:GameAction,id?:string,target?:Vec3,player=this.players[0],aim=AIM){return this.message(player,{type:'game-action',action,id,target,aim});}
 walk(x:number,z:number,player=this.players[0],limit=900,tolerance=.4){let last=Infinity,stuck=0;const initial={...this.actor(player).player};for(let i=0;i<limit;i++){const p=this.actor(player).player,dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz);if(d<tolerance){this.event('walk',{player,from:initial,to:{...p},target:{x,z},ticks:i});return;}stuck=d>last-.015?stuck+1:0;last=d;this.step(1,{[player]:{x:dx/d,z:dz/d,jump:stuck>15&&p.grounded}});if(this.actor(player).adventure.state.health<=0)throw Error(`Actor ${player} downed while walking to ${x},${z}`);}throw Error(`Movement stopped: ${JSON.stringify({player,position:this.actor(player).player,target:{x,z},health:this.actor(player).adventure.state.health})}`);}
 pair(x:number,z:number,limit=900){const active=this.players.filter(id=>this.room.actors.has(id)),last=new Map<string,number>(),stuck=new Map<string,number>();for(let tick=0;tick<limit;tick++){const inputs:Record<string,PlayerInput>={};let arrived=true;for(const id of active){const p=this.actor(id).player,dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz);if(d<.4)continue;arrived=false;const n=d>(last.get(id)??Infinity)-.015?(stuck.get(id)??0)+1:0;last.set(id,d);stuck.set(id,n);inputs[id]={x:dx/d,z:dz/d,jump:n>15&&p.grounded};this.require(this.actor(id).adventure.state.health>0,`Party member ${id} downed en route to ${x},${z}`);}if(arrived){this.event('party-walk',{target:{x,z},ticks:tick,positions:active.map(id=>({id,...this.actor(id).player}))});return;}this.step(1,inputs);}throw Error(`Party movement stopped: ${JSON.stringify({target:{x,z},players:active.map(id=>({id,...this.actor(id).player}))})}`);}
 require(condition:unknown,message:string):asserts condition{if(!condition)throw Error(message);}
 leave(player:string){this.room.leave(player);this.event('leave',{player});}
 rejoin(player:string){this.room.join(player);this.event('rejoin',{player});}

 checkpoint(name:string){this.stage=name;const before=this.players.filter(id=>this.room.actors.has(id)).map(id=>({id,player:{...this.actor(id).player},inventory:{...this.actor(id).adventure.state.inventory},progression:structuredClone(this.actor(id).adventure.state.progression)}));const save=validateSave(this.room.save());writeFileSync(resolve(this.output,name+'.save.json'),JSON.stringify(save));this.completed.push(name);this.event('checkpoint',{file:name+'.save.json',players:before,completedTrials:[...(save.adventure?.trialWorld?.completed??[])],completedSites:[...(save.adventure?.siteWorld?.completed??[])],defeated:save.adventure?.defeated});this.flush();}
 restart(name:string){this.checkpoint(name);const active=this.players.filter(id=>this.room.actors.has(id));const save=validateSave(JSON.parse(readFileSync(resolve(this.output,name+'.save.json'),'utf8')));this.room=new SessionAuthority(save,true);for(const id of active)this.room.join(id);this.sequence.clear();for(const id of active){const saved=save.members?.find(member=>member.id===id);this.require(saved,`Missing saved member ${id}`);this.require(JSON.stringify(this.actor(id).adventure.state.inventory)===JSON.stringify(saved.adventure.inventory),`Inventory changed on restart for ${id}`);this.require(JSON.stringify(this.actor(id).adventure.state.progression)===JSON.stringify(saved.adventure.progression),`Personal progress changed on restart for ${id}`);}this.event('restart',{active});}
 flush(){writeFileSync(resolve(this.output,'trace.json'),JSON.stringify(this.trace));writeFileSync(resolve(this.output,'receipt.json'),JSON.stringify({harness:'actual-input-session-authority',notCovered:['real-websocket','browser','device-performance',...(this.trace.some(event=>event.kind==='route-complete'&&event.scope==='earned-ending-epilogue-continuation')?[]:['post-ending-commissions']),'next-cycle-UI'],steps:this.trace.filter(e=>e.kind==='input').reduce((n,e)=>n+Number(e.ticks),0),actions:this.trace.filter(e=>e.kind==='action').length,party:this.players.filter(id=>this.room.actors.has(id)).map(id=>({id,health:this.actor(id).adventure.state.health,records:[...(this.actor(id).adventure.state.progression?.records??[])],rooms:SITES.map(site=>({site:site.id,rooms:(this.actor(id).adventure.state.siteJournal??[]).filter(n=>Math.floor(n/10)===site.id).map(n=>n%10)})),decorations:this.actor(id).adventure.progression.snapshot().decorations})),regional:structuredClone(this.sim.adventure.state.siteWorld?.regional),stage:this.stage,completed:this.completed,tick:this.sim.tick,traceSha256:createHash('sha256').update(JSON.stringify(this.trace)).digest('hex')},null,2));}
 tutorial(){
  this.stage='tutorial';this.step(30);
  for(const [i,id]of this.players.entries()){
   this.walk(i?-.8:2,16,id);this.require(this.actor(id).adventure.state.progression?.tutorial===1,'Walking tutorial evidence missing');
   const p=this.actor(id).player,target={x:p.x+(i?-3.5:3.5),y:this.sim.groundAt(p.x+(i?-3.5:3.5),p.z)-.2,z:p.z};this.message(id,{type:'action',tool:'dig',target});
   this.require(this.actor(id).adventure.state.progression?.tutorial===2,'Mining tutorial evidence missing');
  }
  const a=this.players[0],b=this.players[1];this.pair(0,9);
  for(const [id,kind]of [[a,'wood'],[b,'stone'],[a,'resin']]as const){const drop=this.sim.adventure.state.resources.find(n=>n.drop&&n.kind===kind&&n.amount>0);this.require(drop,`Missing ${kind} starting supply`);this.walk(drop.x,drop.z+1.5,id);this.act('gather',String(drop.id),undefined,id);}
  // Both contributors build and glue their own pair using real shared supplies.
  for(const [i,id]of this.players.entries()){
   this.walk(i?4:3,6,id);const material=i?'stone':'wood',y=this.actor(id).player.y+1.25;
   this.act('sky-part',`beam:${material}`,{x:i?7:3,y,z:4},id);this.act('sky-part',`beam:${material}`,{x:i?9:5,y,z:4},id);
   const parts=this.sim.skybound.state.parts.filter(p=>p.creator===id);this.act('sky-grab',String(parts[0].id),undefined,id);this.act('sky-glue',`${parts[0].id}:${parts[1].id}`,undefined,id);this.act('sky-release',String(parts[0].id),undefined,id);
   this.require(this.actor(id).adventure.state.progression?.tutorial===4,'Assembly tutorial evidence missing');
   this.walk(3,12,id);this.act('tutorial-rescue','start',undefined,id);this.step(92);this.require(this.actor(id).adventure.state.progression?.tutorial===5,'Rescue-practice evidence missing');
  }
  this.pair(0,5);this.act('gather','810001');this.checkpoint('tutorial-and-first-beacon');
 }
 surfaceTrials(){
  this.stage='surface-trials';if(!this.sim.adventure.state.trialWorld!.completed.includes(825001)){this.pair(-8,8);this.act('trial-reset','825001');let parts=this.sim.skybound.state.parts.filter(p=>p.trial===825001),base=parts.find(p=>p.anchored)!,block=parts.find(p=>p.kind==='block')!;
  this.act('sky-grab',String(block.id));this.act('sky-move',String(block.id),{x:base.position.x,y:base.position.y+.625,z:base.position.z});this.act('sky-release',String(block.id));this.step(30);this.act('trial','825001');this.checkpoint('trial-weight');}
  if(!this.sim.adventure.state.trialWorld!.completed.includes(825004)){this.pair(-12,-4);this.act('trial-reset','825004');const parts=this.sim.skybound.state.parts.filter(p=>p.trial===825004);const battery=parts.find(p=>p.kind==='battery')!,lamp=parts.find(p=>p.kind==='lamp')!;
  this.act('sky-grab',String(lamp.id));this.act('sky-move',String(lamp.id),{x:battery.position.x+.625,y:battery.position.y,z:battery.position.z});this.act('sky-glue',`${lamp.id}:${battery.id}`);this.act('sky-release',String(lamp.id));this.act('sky-toggle',String(lamp.id));this.step(10);this.act('trial','825004');this.checkpoint('trial-circuit');}
  if(!this.sim.adventure.state.trialWorld!.completed.includes(825007)){this.pair(-5,-10);this.act('trial-reset','825007');const parts=this.sim.skybound.state.parts.filter(p=>p.trial===825007),base=parts.filter(p=>p.anchored).sort((a,b)=>a.position.y-b.position.y)[0];this.walk(base.position.x,base.position.z);this.step(30);this.act('sky-ascend-preview');this.act('sky-ascend');this.act('trial','825007');}this.restart('three-surface-trials');
 }
 skyTrials(){
  this.stage='sky-trials';if(!this.sim.adventure.state.trialWorld!.completed.includes(825002)){for(const id of this.players){this.act('return',undefined,undefined,id);this.act('eat','berry',undefined,id);this.act('equip','club',undefined,id);}this.pair(0,20);this.pair(7,20);this.pair(10,20);this.pair(10,-18);for(const id of this.players){this.step(30);this.act('sky-ascend-preview',undefined,undefined,id);this.act('sky-ascend',undefined,undefined,id);this.walk(15,-18,id);}this.act('gather','810002');
  this.pair(18,-18);this.act('trial-reset','825002');const parts=this.sim.skybound.state.parts.filter(p=>p.trial===825002),base=parts.find(p=>p.anchored)!,block=parts.find(p=>p.kind==='block')!;this.act('sky-grab',String(block.id));this.act('sky-move',String(block.id),{x:base.position.x,y:base.position.y+.625,z:base.position.z});this.act('sky-release',String(block.id));this.step(30);this.act('trial','825002');this.checkpoint('trial-carry');}
  this.act('trial-reset','825003');this.pair(10,-15);this.step(30);const id=this.players[0];this.step(1,{[id]:{x:0,z:0,jump:true}});this.act('glide');for(let i=0;i<180&&!this.sim.adventure.state.trialWorld!.evidence.includes(825003);i++)this.step(1);this.require(this.sim.adventure.state.trialWorld!.evidence.includes(825003),'Updraft failed to yield two-metre rise and y28 evidence');this.act('glide','off');for(const player of this.players)this.act('return',undefined,undefined,player);this.pair(5,-15);this.pair(9,-15);this.act('trial','825003');this.restart('five-trials-sky-return');
 }
 depthTrials(){
  this.stage='depth-trials';for(const player of this.players)this.act('return',undefined,undefined,player);this.pair(0,20);this.pair(16,20);this.pair(28,17);this.pair(28,10);
  for(let tick=0;tick<650&&!this.players.every(id=>this.actor(id).player.y<-9);tick++){for(const id of this.players){const actor=this.actor(id);if(actor.player.y<-5&&!actor.player.grounded&&!actor.adventure.traversal.gliding)this.act('glide',undefined,undefined,id);}this.step(1);}
  this.require(this.players.every(id=>this.actor(id).player.y<-9),'Both players must enter the authored chasm');for(const id of this.players)if(this.actor(id).adventure.traversal.gliding)this.act('glide','off',undefined,id);this.step(30);this.pair(28,8);this.act('gather','810003');this.checkpoint('depth-beacon');
  this.pair(28,14);this.act('trial-reset','825005');const heat=this.sim.skybound.state.parts.filter(p=>p.trial===825005),wood=heat.find(p=>p.kind==='block')!,emitter=heat.find(p=>p.kind==='emitter')!;this.act('sky-toggle',String(emitter.id));for(let t=0;t<60&&!wood.heated;t++)this.step(1);this.require(wood.heated,'Loan emitter has not heated the wood');this.act('sky-toggle',String(emitter.id));for(let t=0;t<30&&!this.sim.adventure.state.trialWorld!.evidence.includes(825005);t++){this.message(this.players[0],{type:'action',tool:'water',target:{...wood.position}});this.step(3);}this.act('trial','825005');this.checkpoint('trial-heat-water');
  this.pair(34,8);this.act('trial-reset','825006');const stone=this.sim.skybound.state.parts.find(p=>p.trial===825006&&p.kind==='block')!;this.step(25);this.act('sky-recall',String(stone.id));this.step(28);this.act('trial','825006');this.require(this.sim.adventure.state.trialWorld!.completed.length===7,'All seven trials must be earned');this.restart('seven-trials-three-layers');
 }

 fight(definition:string,enemyId?:number){
  this.stage='fight-'+definition;
  for(let tick=0;tick<1800;tick++){
   const enemy=this.sim.adventure.state.enemies.find(e=>(enemyId?e.id===enemyId:e.definition===definition)&&e.health>0);if(!enemy){if(!enemyId)this.require(this.sim.adventure.state.defeated.includes(definition),'Boss disappeared without a defeat receipt');this.checkpoint('defeated-'+definition);return;}
   const inputs:Record<string,PlayerInput>={};
   for(const id of this.players.filter(id=>this.room.actors.has(id)&&this.actor(id).adventure.state.health>0)){const actor=this.actor(id),p=actor.player;this.require(actor.adventure.state.health>0,`${id} was downed fighting ${definition}`);const dx=enemy.x-p.x,dz=enemy.z-p.z,d=Math.hypot(dx,dz),dy=enemy.y-p.y;
    if(d>(enemy.definition==='veilray'?1:1.7))inputs[id]={x:dx/d,z:dz/d,jump:tick%30===0&&p.grounded};
    else if(actor.adventure.attack<=0&&actor.adventure.dodge<=0&&actor.adventure.state.stamina>=8){const length=Math.hypot(dx,dy,dz);this.act('attack',undefined,undefined,id,{x:dx/length,y:dy/length,z:dz/length});}
   }
   this.step(1,inputs);if(tick%120===0)this.event('combat-observation',{definition,enemy:{x:enemy.x,y:enemy.y,z:enemy.z,health:enemy.health},players:this.players.filter(id=>this.room.actors.has(id)).map(id=>({id,health:this.actor(id).adventure.state.health,stamina:this.actor(id).adventure.state.stamina,player:{...this.actor(id).player}}))});
  }
  throw Error(`Could not defeat ${definition} through actual inputs`);
 }
 rescueParty(){
  this.stage='party-rescue';if(this.players.every(id=>this.actor(id).adventure.state.health>8&&!(this.actor(id).adventure.state.poison??0)))return;
  // Ambient foes remain live; clear an immediate threat using ordinary combat.
  for(let i=0;i<5;i++){const living=this.players.map(id=>this.actor(id)).filter(a=>a.adventure.state.health>0),enemy=this.sim.adventure.state.enemies.find(e=>!e.boss&&e.health>0&&living.some(a=>Math.hypot(e.x-a.player.x,e.y-a.player.y,e.z-a.player.z)<12));if(!enemy)break;this.fight(enemy.definition,enemy.id);}
  for(const victim of this.players){if(this.actor(victim).adventure.state.health>0)continue;const helper=this.players.find(id=>id!==victim&&this.actor(id).adventure.state.health>0&&!(this.actor(id).adventure.state.poison??0));if(!helper)break;const p=this.actor(victim).player;this.walk(p.x,p.z,helper);this.act('revive',victim,undefined,helper);this.step(92);if(this.actor(victim).adventure.state.health>0)this.event('cooperative-revival',{helper,victim});}
  // A failed rescue remains a real death. Wait for the normal respawn, then
  // retrieve each grave via an already-earned beacon and actual walking.
  for(let t=0;t<900&&this.players.some(id=>this.actor(id).adventure.state.health<=0||(this.actor(id).adventure.state.health<4&&(this.actor(id).adventure.state.poison??0)>0));t++)this.step(1);
  this.require(this.players.every(id=>this.actor(id).adventure.state.health>0),'Party did not recover through normal respawn');
  const graves=this.players.filter(id=>this.actor(id).adventure.state.death&&Object.values(this.actor(id).adventure.state.grave??{}).some(n=>n>0));
  if(graves.length){for(const id of this.players){this.act('return',undefined,undefined,id);this.step(10);this.act('travel','beacon:810003',undefined,id);}this.pair(12,8);this.pair(0,0);for(const id of graves){const point=this.actor(id).adventure.state.death!;this.pair(point.x,point.z);this.act('gather','grave',undefined,id);this.act('equip','club',undefined,id);}this.step(180);this.checkpoint('death-and-grave-recovery');}
 }

 depthRegion(){
  this.stage='depth-region';if(!this.sim.adventure.state.defeated.includes('echowarden')){this.pair(12,8);this.pair(-6,0);this.pair(-18,-6.5);this.act('site-accept','850002');this.act('chronicle-accept','850002');this.leave(this.players[1]);
  this.pair(-18,-9);this.pair(-18,-11);this.pair(-16,-11);this.pair(-16,-14);this.act('site-rescue','850002');this.pair(-16,-11);this.pair(-18,-11);this.pair(-18,-5.8);for(let t=0;t<300&&!(this.sim.adventure.state.siteWorld!.evidence[850002]&1);t++)this.step(1);this.require(this.sim.adventure.state.siteWorld!.rescue!.arrived,'Rescue NPC has not walked to the entrance');this.checkpoint('depth-rescue-objective');
  this.act('site-report','850002');this.rejoin(this.players[1]);this.pair(-10,-5);this.fight('echowarden');}this.rescueParty();this.pair(-18,-6.5);this.act('site-report','850002');this.restart('depth-region-completed');
 }

 surfaceRegion(){
  this.stage='surface-region';for(const id of this.players)this.act('return',undefined,undefined,id);this.pair(18,10);this.pair(18,-25);this.pair(24,-26.5);if(!this.sim.skybound.fusion(this.players[0],'club'))this.act('sky-fuse','club:resin');const threat=this.sim.adventure.state.enemies.find(e=>!e.boss&&e.health>0&&Math.hypot(e.x-this.actor().player.x,e.y-this.actor().player.y,e.z-this.actor().player.z)<8);if(threat)this.fight(threat.definition,threat.id);this.act('site-accept','850001');this.act('chronicle-accept','850001');this.pair(24,-29);this.pair(24,-31);
  const cargo=this.sim.skybound.state.parts.find(p=>p.loan?.site===850001&&p.kind==='block')!,base=this.sim.adventure.state.siteWorld!.bases[850001];this.act('sky-grab',String(cargo.id));this.act('sky-move',String(cargo.id),{x:26,y:base+.85,z:-34});this.act('sky-release',String(cargo.id));this.step(20);this.pair(24,-26.5);this.act('site-report','850001');this.pair(32,-25);this.fight('loadwarden');this.rescueParty();this.pair(24,-26.5);this.act('site-report','850001');this.restart('surface-region-completed');
 }
 skyRegion(){
  this.stage='sky-region';for(const id of this.players)this.act('return',undefined,undefined,id);if((this.actor(this.players[1]).adventure.state.inventory.stone??0)<3){this.pair(-8,8);const reward=this.sim.adventure.state.resources.find(n=>n.drop&&n.kind==='stone'&&Math.hypot(n.x+8,n.z-8)<3);this.require(reward,'Earned weight-trial stone reward is required');this.act('gather',String(reward.id),undefined,this.players[1]);for(const id of this.players)this.act('return',undefined,undefined,id);}for(const id of this.players){this.step(10);this.act('travel','beacon:810002',undefined,id);}this.pair(10,-15);this.step(20);this.step(1,Object.fromEntries(this.players.map(id=>[id,{x:0,z:0,jump:true}])));for(const id of this.players)this.act('glide',undefined,undefined,id);for(let tick=0;tick<240&&!this.players.every(id=>this.actor(id).player.y>43.5);tick++)this.step(1);this.require(this.players.every(id=>this.actor(id).player.y>43.5),'Both players must earn sky-route height via the updraft');this.pair(-22,-24.5);for(let tick=0;tick<400&&!this.players.every(id=>this.actor(id).player.grounded);tick++)this.step(1);for(const id of this.players)if(this.actor(id).adventure.traversal.gliding)this.act('glide','off',undefined,id);this.step(30);this.pair(-22,-24.5);this.act('site-accept','850003');this.act('chronicle-accept','850003');this.pair(-22,-27);this.pair(-22,-29);
  const parts=this.sim.skybound.state.parts.filter(p=>p.loan?.site===850003),battery=parts.find(p=>p.kind==='battery')!,lamp=parts.find(p=>p.kind==='lamp')!,emitter=parts.find(p=>p.kind==='emitter')!,device=parts.find(p=>p.kind==='block')!;
  this.act('sky-grab',String(lamp.id));this.act('sky-move',String(lamp.id),{x:battery.position.x-.625,y:34.625,z:battery.position.z-1.5});this.act('sky-move',String(lamp.id),{x:battery.position.x-.625,y:34.625,z:battery.position.z});this.act('sky-glue',`${lamp.id}:${battery.id}`);this.act('sky-move',String(battery.id),{x:emitter.position.x-.625,y:34.625,z:emitter.position.z},this.players[0],{x:0,y:0,z:0});this.act('sky-glue',`${battery.id}:${emitter.id}`);this.act('sky-release',String(lamp.id));this.act('sky-toggle',String(lamp.id));this.act('sky-toggle',String(emitter.id));for(let tick=0;tick<100&&(!device.heated||(device.frozen??0)>0);tick++)this.step(1);this.require(device.heated&&!(device.frozen??0),'Real emitter fire must heat and thaw the loan device');this.act('sky-toggle',String(emitter.id));for(let t=0;t<20&&!(this.sim.adventure.state.siteWorld!.evidence[850003]&1);t++){this.message(this.players[0],{type:'action',tool:'water',target:{...device.position}});this.step(5);}this.pair(-22,-24.5);this.act('site-report','850003');this.pair(-14,-24);this.fight('sailwarden');this.rescueParty();this.pair(-22,-24.5);this.act('site-report','850003');this.restart('three-regions-completed');
 }

 regionalRecords(siteId:number){
  this.stage='regional-records-'+siteId;const site=SITES.find(s=>s.id===siteId)!;this.require(site,'Unknown regional site');const base=this.sim.adventure.state.siteWorld!.bases[siteId];
  if(siteId===850002){this.pair(-15,-6);const iron=this.sim.adventure.state.resources.find(n=>n.kind==='iron'&&Math.hypot(n.x+15,n.y+10.5,n.z+6)<1)!;this.act('gather',String(iron.id));this.pair(-18,-6.5);}
  this.pair(site.x-6,site.z+5.5);this.pair(site.x-6,site.z-5);this.pair(site.x,site.z-5);const owner=siteId===850002?this.players[0]:this.players[1],material=siteId===850002?'metal':'stone';
  this.act('sky-part','block:'+material,{x:site.x,y:base+(siteId===850003?3:1),z:site.z-7},owner);const block=this.sim.skybound.state.parts.filter(p=>p.creator===owner&&p.kind==='block').at(-1)!;
  if(siteId===850002)for(let i=0;i<10&&!this.sim.adventure.state.siteWorld!.regional!.solved.includes(siteId);i++){this.message(owner,{type:'action',tool:'water',target:{...block.position}});this.step(5);}
  else if(siteId===850003){this.step(28);this.act('sky-recall',String(block.id),undefined,owner);this.step(100);}else this.step(50);
  this.require(this.sim.adventure.state.siteWorld!.regional!.solved.includes(siteId),'Regional mechanism not physically solved');
  this.pair(site.x,site.z-7);for(const id of this.players)this.act('chronicle-inspect',String(REGIONAL_RECORDS.find(r=>r.site===siteId&&r.kind==='mechanism')!.id),undefined,id);
  this.pair(site.x-3,site.z-7);for(const id of this.players)this.act('chronicle-inspect',String(REGIONAL_RECORDS.find(r=>r.site===siteId&&r.kind==='read')!.id),undefined,id);
  this.pair(site.x,site.z-7);this.pair(site.x+3,site.z-7);this.step(30);for(const id of this.players){if(this.actor(id).player.y<base+2){this.act('sky-ascend-preview',undefined,undefined,id);this.act('sky-ascend',undefined,undefined,id);}this.act('chronicle-inspect',String(REGIONAL_RECORDS.find(r=>r.site===siteId&&r.kind==='loft')!.id),undefined,id);this.walk(site.x+3.9,site.z-7,id);}
  this.pair(site.x,site.z-5);this.pair(site.x-6,site.z-5);this.pair(site.x-6,site.z+5.5);this.pair(site.x,site.z+5.5);for(const id of this.players)this.act('chronicle-report',String(siteId),undefined,id);this.restart('three-records-'+siteId);
 }

 finalGoal(){
  this.stage='final-goal';const a=this.players[0],b=this.players[1];if(!this.actor(a).adventure.state.inventory.crystal){const crystal=this.sim.adventure.state.resources.filter(n=>n.drop&&n.kind==='crystal'&&n.y>30).sort((x,y)=>Math.hypot(x.x+15,x.z+28)-Math.hypot(y.x+15,y.z+28))[0];this.require(crystal,'The earned sky warden crystal reward is required');this.pair(-14,-24);this.pair(crystal.x,crystal.z);this.act('gather',String(crystal.id));}if(!this.actor(b).adventure.state.inventory.crystal){this.act('drop','crystal:1');const drop=this.sim.adventure.state.resources.filter(n=>n.drop&&n.kind==='crystal'&&Math.hypot(n.x-this.actor(b).player.x,n.y-this.actor(b).player.y,n.z-this.actor(b).player.z)<3.5).sort((x,y)=>x.amount-y.amount)[0];this.require(drop,'Transferred crystal drop is missing');this.act('gather',String(drop.id),undefined,b);}for(const id of this.players){if(this.sim.skybound.fusion(id,'club'))this.act('sky-unfuse','club',undefined,id);this.act('sky-fuse','club:crystal',undefined,id);}for(const id of this.players){this.act('return',undefined,undefined,id);if(!this.actor(id).adventure.state.meadows!.foods.some(f=>f.id==='berry'))this.act('eat','berry',undefined,id);}this.pair(0,20);this.pair(18,20);this.pair(18,28);this.pair(35,28);this.pair(39,23);this.step(1);this.step(1,Object.fromEntries(this.players.map(id=>[id,{x:0,z:0,jump:true}])));for(const id of this.players)this.act('glide',undefined,undefined,id);for(let tick=0;tick<240&&!this.players.every(id=>this.actor(id).player.y>20);tick++)this.step(1);this.require(this.players.every(id=>this.actor(id).player.y>20),'Final island requires actual wind ascent');for(const id of this.players){this.act('glide','off',undefined,id);this.message(id,{type:'game-action',action:'sky-ascend-preview',aim:AIM},4);this.message(id,{type:'game-action',action:'sky-ascend',aim:AIM},4);this.walk(40,23,id);}this.pair(48,24);this.step(20);this.require(this.players.every(id=>this.actor(id).player.y>=29&&this.actor(id).player.grounded),'Both players must land on the final island');this.act('gather','810004');this.fight('stormcore');this.require(this.sim.adventure.state.siteWorld!.completed.length===3,'Final goal must follow all three regional objectives');this.require(this.players.every(id=>this.room.view(id).adventure.progressionView?.ending),'Both players must see the shared ending');this.restart('final-goal-completed');
 }

}
async function main(){
 const journey:ContinuousCoopJourney=new ContinuousCoopJourney(process.env.JOURNEY_OUTPUT,process.env.JOURNEY_RESUME);
 const stages:[string,()=>void][]=[
  ['surface',()=>journey.surfaceTrials()],['sky',()=>journey.skyTrials()],['depth',()=>journey.depthTrials()],
  ['region',()=>journey.depthRegion()],['depth-records',()=>journey.regionalRecords(850002)],
  ['surface-region',()=>journey.surfaceRegion()],['surface-records',()=>journey.regionalRecords(850001)],
  ['sky-region',()=>journey.skyRegion()],['sky-records',()=>journey.regionalRecords(850003)],['final',()=>journey.finalGoal()],
 ];
 try{
  if(!process.env.JOURNEY_RESUME)journey.tutorial();
  const start=process.env.JOURNEY_FROM?stages.findIndex(([id])=>id===process.env.JOURNEY_FROM):0;
  journey.require(start>=0,'Unknown requested route stage');
  for(const [id,run]of stages.slice(start)){run();if(process.env.JOURNEY_UNTIL===id){journey.event('partial-success',{through:id,remaining:stages.slice(stages.findIndex(([s])=>s===id)+1).map(([s])=>s)});journey.flush();return;}}
  journey.event('route-complete',{tutorials:journey.players.map(id=>journey.actor(id).adventure.state.progression!.tutorial),trials:journey.sim.adventure.state.trialWorld!.completed.length,regions:journey.sim.adventure.state.siteWorld!.completed.length,records:journey.players.map(id=>journey.actor(id).adventure.state.progression!.records.length),ending:journey.sim.adventure.state.defeated.includes('stormcore')});journey.flush();
 }catch(error){
  journey.event('blocked',{message:String(error),rescue:journey.sim.adventure.state.siteWorld?.rescue,nearbyEnemies:journey.sim.adventure.state.enemies.filter(e=>e.health>0&&Math.hypot(e.x-journey.actor().player.x,e.y-journey.actor().player.y,e.z-journey.actor().player.z)<15),stack:error instanceof Error?error.stack:undefined,players:journey.players.filter(id=>journey.room.actors.has(id)).map(id=>({id,player:{...journey.actor(id).player},health:journey.actor(id).adventure.state.health}))});
  writeFileSync(resolve(journey.output,'blocked-state.save.json'),JSON.stringify(validateSave(journey.room.save())));journey.flush();process.exitCode=1;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))void main();
