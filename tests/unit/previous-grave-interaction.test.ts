import { expect, it } from 'vitest';
import { SessionAuthority } from '../../src/simulation/session';
import { interactionTarget } from '../../src/game/interaction/target';
import { previousGraveTarget } from '../../src/game/interaction/graves';
import { migrateGear } from '../../src/game/equipment/items';
import { validateSave } from '../../src/save/format';

const aim = {x:0,y:0,z:-1};
function fixture() {
 const room = new SessionAuthority(),sim = room.sim,game = sim.adventure;
 sim.world.density = p=>p.y;sim.fluid.restore([]);sim.bodies.length=0;sim.skybound.state.parts=[];
 game.state.resources=[];game.state.buildings=[];game.state.enemies=[];
 Object.assign(sim.player,{x:50,y:0,z:2,grounded:true,vy:0});
 return {room,sim,game};
}

it('recovers the first upgraded fused grave after a second death through the rendered target and actual authority action',()=>{
 const {room,sim,game} = fixture();game.gear.ensure();
 const inventory = {glider:1,club:1,wood:5},fusion = {equipment:'club',material:'resin' as const,damage:4,durability:12,effect:'fire' as const};
 game.gear.commit(migrateGear(inventory,()=>sim.allocateEntityId(),{quality:{club:3},durability:{club:7},fusions:[fusion]}),inventory);
 const club = structuredClone(game.gear.selected('club')!),wing = structuredClone(game.gear.selected('glider')!);
 Object.assign(sim.player,{x:50,y:0,z:0});game.hurtPlayer(1000,'physical');
 for(let i=0;i<95;i++)game.stepPersonal(1/30);
 game.gear.craft('club',1,{...game.state.inventory});
 const newer = structuredClone(game.gear.selected('club')!);
 Object.assign(sim.player,{x:58,y:0,z:0});game.hurtPlayer(1000,'physical');
 for(let i=0;i<95;i++)game.stepPersonal(1/30);
 const restored = new SessionAuthority(validateSave(room.save())),next = restored.sim.adventure;
 restored.sim.world.density = p=>p.y;restored.sim.fluid.restore([]);
 Object.assign(restored.sim.player,{x:50,y:0,z:2,grounded:true,vy:0});
 const target = interactionTarget(restored.view('host').adventure,restored.sim.player,{x:50,y:.8,z:2},aim)!;
 expect(target.id).toMatch(/^grave:0:[0-9a-f]{8}$/);expect(target.label).toBe('前の墓標から回収');
 const result = restored.action('host',{type:'game-action',action:'interact',id:target.id,target:target.point,aim});
 expect(result.message).toContain('前の墓標');
 expect(next.state.gearItems!.lots).toEqual([wing,club]);expect(next.state.inventory.wood).toBe(5);
 expect(next.state.meadows!.graves).toEqual([]);expect(next.state.graveGear!.lots).toEqual([newer]);
 expect(()=>validateSave(restored.save())).not.toThrow();
});

it('rejects a stale index after recovery shifts another grave into that slot',()=>{
 const {room,sim,game} = fixture();
 game.state.meadows!.graves = [{x:50,y:0,z:0,items:{wood:5}},{x:50,y:0,z:0,items:{stone:4}}];
 const target = interactionTarget(room.view('host').adventure,sim.player,{x:50,y:.8,z:2},aim)!;
 room.action('host',{type:'game-action',action:'interact',id:target.id,target:target.point,aim});
 expect(game.state.meadows!.graves).toHaveLength(1);expect(game.state.inventory.wood).toBe(5);
 sim.tick+=4;
 expect(()=>room.action('host',{type:'game-action',action:'interact',id:target.id,target:target.point,aim})).toThrow();
 expect(game.state.meadows!.graves![0].items).toEqual({stone:4});expect(game.state.inventory.stone??0).toBe(0);
 const current = interactionTarget(room.view('host').adventure,sim.player,{x:50,y:.8,z:2},aim)!;
 expect(current.id).not.toBe(target.id);sim.tick+=4;
 room.action('host',{type:'game-action',action:'interact',id:current.id,target:current.point,aim});
 expect(game.state.inventory.stone).toBe(4);expect(game.state.meadows!.graves).toEqual([]);
});

it('checks the old grave’s actual position, vertical layer, solid walls and participant ownership on the authority',()=>{
 for(const failure of ['remote','other-layer','wall','moved','other-owner']) {
  const {room,sim,game} = fixture();game.state.meadows!.graves=[{x:50,y:0,z:0,items:{wood:5}}];
  const id = previousGraveTarget(game.state.meadows!.graves[0],0),target={x:50,y:.8,z:.5};
  let owner = 'host';
  if(failure==='remote')sim.player.x=70;
  if(failure==='other-layer')sim.player.y=10;
  if(failure==='wall')game.state.buildings=[{id:sim.allocateEntityId(),definition:'wall',x:50,y:0,z:1,rotation:0,support:4,contents:{}}];
  if(failure==='moved')game.state.meadows!.graves[0].x=51;
  if(failure==='other-owner'){const guest=room.join('guest');Object.assign(guest.player,sim.player);guest.adventure.state.meadows!.graves=[];owner='guest';}
  expect(()=>room.action(owner,{type:'game-action',action:'interact',id,target,aim}),failure).toThrow();
  expect(game.state.meadows!.graves![0].items).toEqual({wood:5});expect(game.state.inventory.wood??0).toBe(0);
 }
});

it('does not expose empty previous graves and rejects malformed target IDs',()=>{
 const {room,sim,game} = fixture();game.state.meadows!.graves=[{x:50,y:0,z:0,items:{wood:0}}];
 expect(interactionTarget(room.view('host').adventure,sim.player,{x:50,y:.8,z:2},aim)).toBeNull();
 for(const id of ['grave:0','grave:-1:deadbeef','grave:0:NaN','grave:9999999999:deadbeef','grave:00:deadbeef']) {
  sim.tick+=4;expect(()=>room.action('host',{type:'game-action',action:'interact',id,target:{x:50,y:.8,z:.5},aim})).toThrow();
 }
});

it('keeps overflow in the selected old grave and invalidates the pre-recovery target',()=>{
 const {room,sim,game} = fixture();game.gear.ensure();
 const inventory = {wood:145};game.gear.commit(migrateGear(inventory,()=>sim.allocateEntityId()),inventory);
 game.state.meadows!.graves = [{x:50,y:0,z:0,items:{wood:10}}];
 const target = interactionTarget(room.view('host').adventure,sim.player,{x:50,y:.8,z:2},aim)!;
 room.action('host',{type:'game-action',action:'interact',id:target.id,target:target.point,aim});
 expect(game.state.inventory.wood).toBe(150);expect(game.state.meadows!.graves![0].items.wood).toBe(5);
 const current = interactionTarget(room.view('host').adventure,sim.player,{x:50,y:.8,z:2},aim)!;
 expect(current.id).not.toBe(target.id);sim.tick+=4;
 expect(()=>room.action('host',{type:'game-action',action:'interact',id:target.id,target:target.point,aim})).toThrow();
 expect(game.state.inventory.wood+game.state.meadows!.graves![0].items.wood).toBe(155);
 expect(()=>validateSave(room.save())).not.toThrow();
});
