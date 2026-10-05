import { expect, it } from 'vitest';
import { SessionAuthority } from '../../src/simulation/session';
import { legacySimulation } from '../helpers/legacy';
import { newMeadows } from '../../src/game/meadows/state';
import { validateSave } from '../../src/save/format';
import { DOWNED_SECONDS } from '../../src/game/coop-revive';
const aim = {x:0,y:0,z:1}, idle = {x:0,z:0,jump:false};
function setup(down = true) {
 const save=legacySimulation().save();save.generator=4;save.adventure!.meadows=newMeadows();save.adventure!.resources=[];save.adventure!.enemies=[];
 const room=new SessionAuthority(save);room.sim.world.density=p=>p.y-2;
 const helper=room.join('helper'),target=room.join('target');
 Object.assign(room.sim.player,{x:-3,y:2,z:8,grounded:true});Object.assign(helper.player,{x:0,y:2,z:8,grounded:true});Object.assign(target.player,{x:1,y:2,z:8,grounded:true});
 target.adventure.state.inventory.wood=11;if(down)target.adventure.hurtPlayer(1000,'physical',target.player);
 return {room,helper,target};
}
function ticks(room:SessionAuthority,n:number,heartbeat=true){for(let i=0;i<n;i++){if(heartbeat)for(const actor of room.actors.values())room.input(actor.id,idle,actor.sequence+1);room.step();}}
it('enters a saved downed grace without taking inventory, then revives once after a three-second hold',()=>{
 const {room,helper,target}=setup();expect(target.adventure.state.health).toBe(0);expect(target.adventure.state.downed).toBe(DOWNED_SECONDS);expect(target.adventure.state.inventory.wood).toBe(11);expect(target.adventure.state.death).toBeNull();
 room.action('helper',{type:'game-action',action:'revive',id:'target',aim});ticks(room,45);
 expect(room.view('helper').adventure.coop!.reviving!.seconds).toBeCloseTo(1.5);expect(room.view('target').adventure.coop!.beingRevived!.by).toBe('helper');expect(target.adventure.state.health).toBe(0);
 ticks(room,45);expect(target.adventure.state.health).toBeGreaterThan(0);expect(target.adventure.state.downed).toBeUndefined();expect(target.adventure.state.inventory.wood).toBe(11);expect(helper.adventure.helping).toBeUndefined();
 expect(()=>target.adventure.revive()).toThrow();expect(target.adventure.state.grave).toEqual({});
});
it('cancels immediate release despite action cooldown and cancels departure, distance, stale input or damage',()=>{
 for(const reason of ['release','leave','distance','timeout','damage']){
  const {room,helper,target}=setup();room.action('helper',{type:'game-action',action:'revive',id:'target',aim});
  if(reason==='release')room.action('helper',{type:'game-action',action:'revive',id:'',aim});
  if(reason==='leave')room.leave('helper');
  if(reason==='distance')helper.player.x=20;
  if(reason==='damage')helper.adventure.hurtPlayer(3,'physical',helper.player);
  ticks(room,100,reason!=='timeout');expect(target.adventure.state.health).toBe(0);expect(target.adventure.receivingHelp).toBeUndefined();
 }
},20000);
it('rejects obscured rescue and competing helpers, and releases a target when either participant leaves',()=>{
 const {room,helper,target}=setup(),other=room.join('other');Object.assign(other.player,{x:1,y:2,z:9,grounded:true});
 room.sim.world.density=p=>p.x>.4&&p.x<.6?-1:p.y-2;
 expect(()=>room.action('helper',{type:'game-action',action:'revive',id:'target',aim})).toThrow('見える');
 room.sim.world.density=p=>p.y-2;room.sim.tick+=4;room.action('helper',{type:'game-action',action:'revive',id:'target',aim});
 expect(()=>room.action('other',{type:'game-action',action:'revive',id:'target',aim})).toThrow('別の仲間');
 room.leave('target');expect(helper.adventure.helping).toBeUndefined();expect(target.adventure.receivingHelp).toBeUndefined();
});
it('bleeds out into one legacy grave and preserves it across a save/restart and respawn',()=>{
 const {room,target}=setup();target.adventure.state.downed=.01;ticks(room,1);
 expect(target.adventure.state.downed).toBeUndefined();expect(target.adventure.state.inventory.wood).toBe(0);expect(target.adventure.state.grave!.wood).toBe(11);expect(target.adventure.state.death?.x).toBeCloseTo(target.player.x);
 const restored=new SessionAuthority(validateSave(room.save())),returning=restored.join('target');expect(returning.adventure.state.grave!.wood).toBe(11);expect(returning.adventure.state.inventory.wood).toBe(0);
 ticks(room,95);expect(target.adventure.state.health).toBeGreaterThan(0);expect(target.adventure.state.grave!.wood).toBe(11);
});
it('restores downed time but never restores an in-progress rescue, and does not copy host downed/spawn into newcomers',()=>{
 const {room,target}=setup();room.action('helper',{type:'game-action',action:'revive',id:'target',aim});ticks(room,30);
 const saved=validateSave(room.save()),restored=new SessionAuthority(saved),member=restored.join('target');
 expect(member.adventure.state.downed).toBeCloseTo(19);expect(member.adventure.receivingHelp).toBeUndefined();expect(member.adventure.state.inventory.wood).toBe(11);
 room.sim.adventure.state.spawn={x:20,y:2,z:20};room.sim.adventure.hurtPlayer(1000,'physical');const newcomer=room.join('newcomer');
 expect(newcomer.adventure.state.downed).toBeUndefined();expect(newcomer.adventure.state.spawn).toBeNull();expect(newcomer.adventure.state.health).toBeGreaterThan(0);
 const malformed=room.save();malformed.adventure!.downed=Infinity;expect(()=>validateSave(malformed)).toThrow('救助待ち');
});
it('keeps legacy generators on immediate grave/death rules',()=>{
 const room=new SessionAuthority(legacySimulation().save());room.sim.adventure.state.inventory.wood=10;room.sim.adventure.hurtPlayer(1000,'physical');
 expect(room.sim.adventure.state.downed).toBeUndefined();expect(room.sim.adventure.state.grave!.wood).toBe(2);
});
it('accepts guard and sprint release during the same action cooldown',()=>{
 const {room,helper}=setup();room.action('helper',{type:'game-action',action:'guard',id:'on',aim});expect(helper.adventure.guarding).toBe(true);
 room.action('helper',{type:'game-action',action:'guard',id:'off',aim});expect(helper.adventure.guarding).toBe(false);
 helper.adventure.state.meadows!.sprinting=true;room.action('helper',{type:'game-action',action:'sprint',id:'off',aim});expect(helper.adventure.state.meadows!.sprinting).toBe(false);
});
it('shares one boss defeat and one loot pool regardless of contenders, reconnects or late joins',()=>{
 for(const count of [1,2,7]){
  const {room}=setup();room.leave('helper');room.leave('target');
  const attackers=Array.from({length:count},(_,i)=>room.join('attacker'+i));
  const enemy={id:900001,definition:'stormcore',tier:1,x:0,y:2,z:8,homeX:0,homeZ:8,health:1,cooldown:1,windup:0,slow:0,boss:true};room.sim.adventure.state.enemies.push(enemy);
  for(const attacker of attackers)attacker.adventure.hit(enemy,20,'physical');
  const resources=room.sim.adventure.state.resources,antlers=resources.filter(r=>r.drop&&r.kind==='star').reduce((n,r)=>n+r.amount,0),trophies=resources.filter(r=>r.drop&&r.kind==='crystal').reduce((n,r)=>n+r.amount,0);
  expect(antlers).toBe(4);expect(trophies).toBe(6);expect(room.sim.adventure.state.defeated.filter(id=>id==='stormcore')).toHaveLength(1);
  expect(attackers.every(a=>(a.adventure.state.inventory.star??0)===0)).toBe(true);
  room.leave('attacker0');const late=room.join('late');expect(late.adventure.state.defeated).toContain('stormcore');
  late.adventure.hit(enemy,100,'fire');expect(room.sim.adventure.state.resources.filter(r=>r.kind==='crystal').reduce((n,r)=>n+r.amount,0)).toBe(6);
  const restarted=new SessionAuthority(validateSave(room.save()));expect(restarted.join('returning').adventure.state.defeated).toContain('stormcore');expect(restarted.sim.adventure.state.resources.filter(r=>r.kind==='crystal').reduce((n,r)=>n+r.amount,0)).toBe(6);
 }
});
it('preserves activated world progression through downing, helper departure and new player joins',()=>{
 const {room,target}=setup();room.sim.adventure.state.resources.push({id:810001,kind:'runestone',x:0,y:2,z:3,amount:1,ready:1e10});room.sim.adventure.state.unlocked=2;
 room.leave('helper');room.leave('target');const newcomer=room.join('new-arrival');
 expect(newcomer.adventure.state.resources.find(r=>r.id===810001)!.ready).toBe(1e10);expect(newcomer.adventure.state.unlocked).toBe(2);
 expect(newcomer.adventure.state.health).toBeGreaterThan(0);expect(newcomer.adventure.state.downed).toBeUndefined();
 const returning=room.join('target');expect(returning.adventure.state.downed).toBe(target.adventure.state.downed);expect(returning.adventure.state.resources.find(r=>r.id===810001)!.ready).toBe(1e10);
});

it('never applies allied melee or player-owned projectile damage to another player',()=>{
 const {room,helper,target}=setup(false);const health=target.adventure.state.health;
 helper.adventure.state.inventory.club=1;helper.adventure.state.equipment='club';room.action('helper',{type:'game-action',action:'attack',aim:{x:1,y:0,z:0}});ticks(room,35);expect(target.adventure.state.health).toBe(health);
 room.sim.adventure.projectiles.push({id:room.sim.allocateEntityId(),owner:'helper',x:target.player.x,y:target.player.y+.7,z:target.player.z,vx:0,vy:0,vz:0,life:1,damage:1000,element:'fire',radius:1});
 ticks(room,3);expect(target.adventure.state.health).toBe(health);expect(target.adventure.state.downed).toBeUndefined();
});
