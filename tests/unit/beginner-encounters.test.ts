import {expect,it} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {SessionAuthority} from '../../src/simulation/session';
import {makeAdventureEnemy,populateAdventureTiles} from '../../src/game/adventure-exploration';
import {stepAdventureEnemy} from '../../src/game/adventure-enemies';
import {BEGINNER_ENCOUNTER,ENTRY_CLEARING,crossesEntryClearing,inBeginnerArea,inEntryClearing} from '../../src/game/entry-clearing';
import {validateSave} from '../../src/save/format';
import {legacySimulation} from '../helpers/legacy';
const idle={x:0,z:0,jump:false};
function fixture(kind='slime',x=20,y=0){
 const room=new SessionAuthority(),sim=room.sim;
 // Flat supported surface, no incidental walls, water, equipment or food armor.
 sim.world.heightAt=()=>0;sim.world.density=p=>p.y-y;sim.fluid.restore([]);sim.bodies.length=0;sim.skybound.state.parts=[];sim.companions.state.creatures=[];
 const s=sim.adventure.state;s.resources=[];s.buildings=[];s.enemies=[];s.inventory={};s.meadows!.gear={};
 s.exploration={version:1,tiles:[-1,0,1,2,3,4].flatMap(tx=>[-1,0,1].map(tz=>`surface:${tx},${tz}`)),pending:[],generated:0,exhausted:false,waterJobs:[]};
 Object.assign(sim.player,{x,y,z:8,grounded:true,vy:0});
 const e=makeAdventureEnemy(sim,kind,{x:x+1,y,z:8});e.cooldown=0;s.enemies.push(e);
 return {room,sim,e};
}
function brain(sim:GameSimulation,frames=1){for(let i=0;i<frames;i++){sim.tick++;sim.adventure.state.seconds+=1/30;for(const e of sim.adventure.state.enemies)stepAdventureEnemy(sim.adventure,e,1/30);}}
it('authors exactly two separated weak surface encounters, with no random pack added on arrival or revisit',()=>{
 const sim=new GameSimulation(),beginner=sim.adventure.state.enemies.filter(e=>inBeginnerArea(sim,e));
 expect(beginner).toHaveLength(2);expect(beginner.every(e=>e.definition==='slime'&&e.health===24&&!inEntryClearing(sim,e))).toBe(true);
 expect(Math.hypot(beginner[0].x-beginner[1].x,beginner[0].z-beginner[1].z)).toBeGreaterThan(20);
 const original=sim.adventure.state.enemies.map(e=>({...e}));for(let i=0;i<12;i++){sim.tick++;populateAdventureTiles(sim,sim.adventure.state,sim.player);}
 expect(sim.adventure.state.enemies.filter(e=>inBeginnerArea(sim,e))).toEqual(beginner);
 // The three enemies beyond the starter area keep their authored roles/health.
 expect(original.filter(e=>!inBeginnerArea(sim,e)).map(e=>[e.definition,e.health])).toEqual([['walker',48],['slime',24],['walker',48]]);
 const loaded=new GameSimulation(validateSave(sim.save()));for(let i=0;i<12;i++){loaded.tick++;populateAdventureTiles(loaded,loaded.adventure.state,loaded.player);}
 expect(loaded.adventure.state.enemies).toEqual(sim.adventure.state.enemies);
});
it('limits new aggression to eight metres and never recruits nearby old-save enemies into a starter pack',()=>{
 const {sim,e}=fixture();Object.assign(e,{x:30,homeX:30});brain(sim);expect(e.attackKind).toBe('idle');expect(e.alerted??0).toBe(0);
 sim.player.x=23;const ally=makeAdventureEnemy(sim,'walker',{x:36,y:0,z:8});sim.adventure.state.enemies.push(ally);brain(sim);
 expect(e.attackKind).toBe('pursue');expect(e.alerted).toBe(BEGINNER_ENCOUNTER.alert);expect(ally.alerted??0).toBe(0);expect(ally.attackKind).toBe('idle');
});
it('gives old dense packs one readable attack at a time, including ranged enemies on opposite sides',()=>{
 const {sim}=fixture();sim.adventure.state.enemies=Array.from({length:5},(_,i)=>{const e=makeAdventureEnemy(sim,'reedspitter',{x:i%2?24:18,y:0,z:8+(i-2)*1.5});e.cooldown=0;return e;});
 const tookTurn=new Set<number>();brain(sim);expect(sim.adventure.state.enemies.filter(e=>e.windup>0)).toHaveLength(1);expect(sim.adventure.state.enemies.find(e=>e.windup>0)!.windup).toBe(BEGINNER_ENCOUNTER.windup);
 for(let i=0;i<360;i++){brain(sim);const active=sim.adventure.state.enemies.filter(e=>e.windup>0);expect(active.length).toBeLessThanOrEqual(1);active.forEach(e=>tookTurn.add(e.id));}
 expect(tookTurn.size).toBe(5);
});
it('caps a starter hit at three physical damage without poison, but retains normal later/sky/cave attacks',()=>{
 for(const kind of ['slime','walker']){const {sim,e}=fixture(kind);e.windup=.01;e.attackKind='melee';e.attackYaw=Math.atan2(sim.player.x-e.x,sim.player.z-e.z);brain(sim);expect(sim.adventure.state.health).toBe(22);expect(sim.adventure.state.poison??0).toBe(0);expect(e.cooldown).toBe(BEGINNER_ENCOUNTER.cooldown);}
 for(const [x,y] of [[100,0],[20,25],[20,-10.5]]){const {sim,e}=fixture('slime',x,y);expect(inBeginnerArea(sim,sim.player)).toBe(false);brain(sim);expect(e.windup).toBe(.9);e.windup=.01;brain(sim);expect(sim.adventure.state.health).toBe(19);expect(sim.adventure.state.poison).toBe(8);expect(e.cooldown).toBe(2.8);}
 const {sim,e}=fixture('walker',100);e.x=125;e.homeX=125;brain(sim);expect(e.attackKind).toBe('pursue');expect(e.alerted).toBe(6);
 const legacy=legacySimulation();expect(inBeginnerArea(legacy,{x:20,y:0,z:8})).toBe(false);
});
it('cancels windup and charges on retreat while an outside teammate can still take ordinary encounter damage',()=>{
 const {room,sim,e}=fixture('cinderunner');e.windup=.5;e.attackKind='charge';e.alerted=6;e.attackReady={dashUntil:10};sim.player.x=0;brain(sim);
 expect(e.windup).toBe(0);expect(e.alerted).toBe(0);expect(e.attackReady.dashUntil).toBe(0);expect(sim.adventure.state.health).toBe(25);
 const guest=room.join('outside');Object.assign(guest.player,{x:20,y:0,z:8});guest.adventure.state.meadows!.gear={};e.x=21;e.windup=.01;e.attackKind='melee';e.attackYaw=Math.atan2(guest.player.x-e.x,guest.player.z-e.z);brain(sim);
 expect(guest.adventure.state.health).toBe(22);expect(sim.adventure.state.health).toBe(25);
 Object.assign(guest.player,{x:0,y:0,z:8});brain(sim);expect(e.attackKind).toBe('idle');
 // The clearing is not player invulnerability: unrelated physical damage applies.
 sim.adventure.hurtPlayer(4,'physical');expect(sim.adventure.state.health).toBe(21);
});
it('stops already fired ordinary shots at the safe boundary, including swept crossings, but leaves bosses and later shots alone',()=>{
 const {room,sim,e}=fixture('reedspitter',15.8);e.x=22;e.cooldown=10;
 const fire=(owner:string,x:number,damage=7)=>sim.adventure.projectiles.push({id:sim.allocateEntityId(),owner,x,y:.7,z:8,vx:-8,vy:0,vz:0,life:2,damage,element:'poison',radius:.16});
 fire('enemy:'+e.id,16.05);room.step(idle);expect(sim.adventure.state.health).toBe(25);expect(sim.adventure.projectiles).toHaveLength(0);
 // The player's collision radius may reach outside while their feet remain safe.
 fire('enemy:'+e.id,16.4);room.step(idle);expect(sim.adventure.state.health).toBe(25);expect(sim.adventure.projectiles).toHaveLength(0);
 expect(crossesEntryClearing(sim,{x:-30,y:.7,z:8},{x:30,y:.7,z:8})).toBe(true);
 expect(crossesEntryClearing(sim,{x:-30,y:25,z:8},{x:30,y:25,z:8})).toBe(false);
 expect(crossesEntryClearing(sim,{x:-30,y:-10,z:8},{x:30,y:-10,z:8})).toBe(false);
 expect(crossesEntryClearing(sim,{x:20,y:.7,z:8},{x:30,y:.7,z:8})).toBe(false);
 const boss={...e,id:999,definition:'stormcore',boss:true,health:0};sim.adventure.state.enemies.push(boss);fire('enemy:999',16.05);room.step(idle);expect(sim.adventure.state.health).toBe(18);
 const outer=fixture('reedspitter',20);outer.e.cooldown=10;outer.sim.adventure.projectiles.push({id:999,owner:'enemy:'+outer.e.id,x:20.3,y:.7,z:8,vx:-8,vy:0,vz:0,life:2,damage:7,element:'poison',radius:.16});outer.room.step(idle);expect(outer.sim.adventure.state.health).toBe(22);expect(outer.sim.adventure.state.poison??0).toBe(0);
 const later=fixture('reedspitter',100);later.e.cooldown=10;later.sim.adventure.projectiles.push({id:999,owner:'enemy:'+later.e.id,x:100.3,y:.7,z:8,vx:-8,vy:0,vz:0,life:2,damage:7,element:'poison',radius:.16});later.room.step(idle);expect(later.sim.adventure.state.health).toBe(18);expect(later.sim.adventure.state.poison).toBe(8);
});
it('keeps passive current and wet healing active when every participant shelters in the clearing',()=>{
 const {sim,e}=fixture('slime',0);sim.fluid.immersion=()=>.8;sim.fluid.current=()=>({x:3,z:0});e.health=12;e.burn=2;
 expect(inEntryClearing(sim,sim.player)).toBe(true);expect(inEntryClearing(sim,e)).toBe(true);
 const before=e.x;brain(sim);
 expect(e.x).toBeGreaterThan(before);expect(e.health).toBeGreaterThan(12);expect(e.burn).toBe(0);
 expect(e.attackKind).toBe('idle');expect(e.windup).toBe(0);expect(e.alerted).toBe(0);expect(sim.adventure.state.health).toBe(25);
});
it('preserves existing saved enemy identities, progression, health and terrain instead of reseeding the new tutorial',()=>{
 const sim=new GameSimulation(),oldEnemy=makeAdventureEnemy(sim,'walker',{x:18,y:sim.groundAt(18,8),z:8});oldEnemy.health=31;oldEnemy.stars=1;oldEnemy.alerted=5;sim.adventure.state.enemies.push(oldEnemy);sim.adventure.state.inventory.wood=17;sim.world.apply({id:1,kind:'dig',position:{x:7,y:sim.groundAt(7,8),z:8},radius:.5,material:'stone',tick:0});
 const saved=validateSave(sim.save()),expected=structuredClone(saved.adventure!.enemies),restored=new GameSimulation(saved);expect(restored.adventure.state.enemies).toEqual(expected);expect(restored.adventure.state.inventory.wood).toBe(17);expect(restored.world.generator).toBe(4);expect(restored.world.edits).toEqual(sim.world.edits);
 expect(ENTRY_CLEARING.radius).toBe(16);expect(inBeginnerArea(restored,{x:BEGINNER_ENCOUNTER.radius+.01,y:restored.world.heightAt(BEGINNER_ENCOUNTER.radius+.01,8),z:8})).toBe(false);
});
