import {seedInventory} from '../helpers/equipment';
import {expect,it} from 'vitest';
import {SessionAuthority} from '../../src/simulation/session';
import {skyContext} from '../../src/game/skybound/context';
import {validateSave} from '../../src/save/format';
import {participantSave} from '../../src/save/participant';
import {PART_HALF} from '../../src/game/skybound/types';
import type {SkyAction} from '../../src/game/skybound/types';
import {skyPartOverlapsCapsule} from '../../src/game/skybound/assembly-contacts';
const aim={x:0,y:0,z:1};
function fixture(){
 const room=new SessionAuthority(),sim=room.sim,a=room.join('alice'),b=room.join('bob');
 sim.adventure.state.resources=[];sim.adventure.state.enemies=[];sim.adventure.state.buildings=[];sim.fluid.restore([]);sim.bodies.length=0;
 Object.assign(a.player,{x:21,y:25.005,z:-20,vy:0,grounded:true});Object.assign(b.player,{x:25,y:25.005,z:-18,vy:0,grounded:true});seedInventory(a.adventure,{wood:50,berry:10,club:1});
 function action(name:SkyAction,id:string,target?:{x:number;y:number;z:number}){sim.tick+=4;const epoch=sim.skybound.state.parts.find(p=>p.id===Number(id.split(':')[0]))?.epoch;return room.action('alice',{type:'game-action',action:name,id,target,aim,expectedEpoch:name==='sky-part'?undefined:epoch});}
 action('sky-part','slab:wood',{x:21,y:25.125,z:-18});action('sky-part','bed:wood',{x:20.5,y:25.5,z:-18});action('sky-part','storage:wood',{x:21.625,y:25.75,z:-18});
 action('sky-grab','1');action('sky-glue','1:2');action('sky-glue','1:3');action('sky-release','1');
 action('sky-store','3:berry:6');action('sky-camp','2');
 return {room,sim,a,b,action};
}
function die(room:SessionAuthority,id='alice'){
 const actor=room.actors.get(id)!;actor.adventure.hurtPlayer(1000,'physical',actor.player);actor.adventure.state.downed=.001;
 room.step();expect(actor.adventure.state.health).toBe(0);expect(actor.adventure.state.downed).toBeUndefined();
 for(let tick=0;tick<95&&actor.adventure.state.health===0;tick++)room.step();expect(actor.adventure.state.health).toBeGreaterThan(0);
}
it('constructs, glues, stores, moves and binds through real Session actions, then respawns a guest at the current safe bed',()=>{
 const {room,sim,a,b,action}=fixture();expect(a.adventure.state.inventory.wood).toBe(39);expect(a.adventure.state.inventory.berry).toBe(4);expect(sim.skybound.state.storage?.[3]).toEqual({berry:6});
 const oldBed={...sim.skybound.state.parts[1].position};action('sky-grab','1');action('sky-move','1',{x:23,y:25.125,z:-18});action('sky-release','1');
 expect(sim.skybound.state.parts[1].position.x).toBe(oldBed.x+2);expect(sim.skybound.state.camps?.alice).toBe(2);
 const bobInventory={...b.adventure.state.inventory},beforeHealth=a.adventure.state.health;expect(beforeHealth).toBe(25);
 Object.assign(a.player,{x:0,y:sim.groundAt(0,8)+.02,z:8,vy:0,grounded:true});die(room);
 const bed=sim.skybound.state.parts.find(p=>p.id===2)!;expect(Math.hypot(a.player.x-bed.position.x,a.player.z-bed.position.z),JSON.stringify({parts:sim.skybound.state.parts,actors:sim.targets.map(t=>({id:t.adventure.owner,position:t.player})),unsafe:skyContext(sim).unsafeCamp?.(bed.position),camp:sim.skybound.campRespawn('alice',skyContext(sim)),enemies:sim.adventure.state.enemies.filter(e=>e.health>0&&Math.hypot(e.x-bed.position.x,e.y-bed.position.y,e.z-bed.position.z)<12)})).toBeLessThan(.05);expect(a.player.y).toBeGreaterThanOrEqual(bed.position.y+PART_HALF.bed.y-.01);
 expect(sim.skybound.state.parts.some(p=>skyPartOverlapsCapsule(p,a.player,.3,1.45))).toBe(false);expect(sim.skybound.state.storage?.[3]).toEqual({berry:6});expect(a.adventure.state.inventory.berry).toBe(0);expect(a.adventure.state.grave?.berry).toBe(4);expect(b.adventure.state.inventory).toEqual(bobInventory);
 const restored=new SessionAuthority(validateSave(room.save()));expect(restored.join('alice').adventure.state.inventory.berry).toBe(0);expect(restored.sim.skybound.state.storage?.[3]).toEqual({berry:6});expect(restored.sim.skybound.state.camps?.alice).toBe(2);
});
it('rechecks a guest’s bed at the actual respawn tick and falls back when another player occupies it',()=>{
 const {room,sim,a,b}=fixture(),bed=sim.skybound.state.parts[1];Object.assign(b.player,{x:bed.position.x,y:bed.position.y+PART_HALF.bed.y+.02,z:bed.position.z,vy:0,grounded:true});
 Object.assign(a.player,{x:0,y:sim.groundAt(0,8)+.02,z:8,vy:0,grounded:true});die(room);
 expect(Math.hypot(a.player.x,a.player.z-8)).toBeLessThanOrEqual(6.1);expect(Math.hypot(a.player.x-sim.player.x,a.player.z-sim.player.z)).toBeGreaterThanOrEqual(.7);expect(Math.hypot(a.player.x-b.player.x,a.player.z-b.player.z)).toBeGreaterThan(10);expect(sim.skybound.state.storage?.[3]).toEqual({berry:6});
});
it('routes real inventory-capacity and combat checks through the acting guest, leaving the host unchanged',()=>{
 const {room,sim,a,action}=fixture(),hostInventory={...sim.adventure.state.inventory};a.adventure.state.inventory.wood=149;
 expect(()=>action('sky-take','3:berry:6')).toThrow('空き');expect(a.adventure.state.inventory.berry).toBe(4);expect(sim.skybound.state.storage?.[3]).toEqual({berry:6});expect(sim.adventure.state.inventory).toEqual(hostInventory);
 a.adventure.attack=.2;expect(()=>action('sky-camp','2')).toThrow('安全');a.adventure.attack=0;
 a.player.grounded=false;expect(()=>action('sky-camp','2')).toThrow('安全');a.player.grounded=true;
 const exported=participantSave(room,'alice',{portable:true});expect(exported.skybound?.camps).toEqual({host:2});expect(exported.skybound?.storage).toEqual({'3':{berry:6}});expect(exported.skybound?.parts.find(p=>p.id===3)?.creator).toBe('host');
 expect(participantSave(room,'bob',{portable:true}).skybound?.storage).toEqual({});expect(room.view('bob').adventure.skybound?.storage).toEqual([]);
});
it('does not create a moving terrain-protection bubble around a registered bed',()=>{
 const {sim}=fixture(),bed=sim.skybound.state.parts[1],context=skyContext(sim);
 expect(context.protected?.({x:bed.position.x,y:bed.position.y+.7,z:bed.position.z})).toBe(false);
 for(const part of sim.skybound.state.parts)part.position.x+=1;
 const current=skyContext(sim);expect(current.protected?.({x:bed.position.x,y:bed.position.y+.7,z:bed.position.z})).toBe(false);
});
it('rejects a now-buried ordinary saved spawn when the mobile bed becomes unsafe',()=>{
 const {room,sim,a,b}=fixture(),bed=sim.skybound.state.parts[1];a.adventure.state.spawn={x:20.5,y:24,z:-18};
 Object.assign(b.player,{x:bed.position.x,y:bed.position.y+PART_HALF.bed.y+.02,z:bed.position.z,vy:0,grounded:true});
 Object.assign(a.player,{x:0,y:sim.groundAt(0,8)+.02,z:8,vy:0,grounded:true});die(room);
 expect(Math.hypot(a.player.x,a.player.z-8)).toBeLessThanOrEqual(6.1);expect(Math.hypot(a.player.x-sim.player.x,a.player.z-sim.player.z)).toBeGreaterThanOrEqual(.7);expect(sim.world.density({x:a.player.x,y:a.player.y+.3,z:a.player.z})).toBeGreaterThan(0);
});
