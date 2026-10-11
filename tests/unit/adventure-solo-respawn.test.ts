import { expect, it } from 'vitest';
import { SessionAuthority } from '../../src/simulation/session';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { DOWNED_SECONDS } from '../../src/game/coop-revive';
import { validateSave } from '../../src/save/format';
import { migrateGear, validateGear } from '../../src/game/equipment/items';

it('skips an impossible solo rescue wait and respawns through the existing safe arrival without losing the grave',()=>{
 const sim = new GameSimulation(),game = sim.adventure;
 sim.adventure.state.enemies = [];sim.fluid.restore([]);game.state.inventory.wood = 11;
 game.hurtPlayer(1000,'physical');
 expect(game.state.health).toBe(0);expect(game.state.downed).toBeUndefined();
 expect(game.state.grave!.wood).toBe(11);expect(game.state.inventory.wood).toBe(0);
 const grave = structuredClone(game.state.grave),place = {...game.state.death!};
 for (let i = 0; i < 95; i++) game.stepPersonal(1 / 30);
 expect(game.state.health).toBeGreaterThan(0);expect(game.state.grave).toEqual(grave);expect(game.state.death).toEqual(place);
 const restored = new GameSimulation(validateSave(sim.save()));
 expect(restored.adventure.state.grave).toEqual(grave);expect(restored.adventure.state.inventory.wood).toBe(0);
});

it('counts only connected human peers, including a lone player on a dedicated authority',()=>{
 const solo = new SessionAuthority();solo.sim.adventure.hurtPlayer(1000,'physical');
 expect(solo.sim.adventure.state.downed).toBeUndefined();
 const dedicated = new SessionAuthority(undefined,true),guest = dedicated.join('guest');
 guest.adventure.state.inventory.wood = 7;guest.adventure.hurtPlayer(1000,'physical',guest.player);
 expect(guest.adventure.state.downed).toBeUndefined();expect(guest.adventure.state.grave!.wood).toBe(7);
 expect(dedicated.sim.adventure.state.grave?.wood).toBeUndefined();
});

it('keeps multiplayer rescue grace and saved downed timers intact while peers reconnect',()=>{
 const room = new SessionAuthority(),guest = room.join('guest');
 room.sim.adventure.state.inventory.wood = 9;room.sim.adventure.hurtPlayer(1000,'physical');
 expect(room.sim.adventure.state.downed).toBe(DOWNED_SECONDS);
 expect(room.sim.adventure.state.inventory.wood).toBe(9);expect(room.sim.adventure.state.grave?.wood).toBeUndefined();
 guest.adventure.hurtPlayer(1000,'physical',guest.player);
 expect(guest.adventure.state.downed).toBe(DOWNED_SECONDS);
 const restored = new SessionAuthority(validateSave(room.save()));restored.sim.adventure.stepPersonal(1 / 30);
 expect(restored.sim.adventure.state.downed).toBeCloseTo(DOWNED_SECONDS-1/30);
 expect(restored.join('guest').adventure.state.downed).toBe(DOWNED_SECONDS);
 expect(restored.sim.adventure.state.inventory.wood).toBe(9);
});

it('retains the exact glider lots through death, save/restart and grave recovery without duplicating them',()=>{
 const room = new SessionAuthority(),game = room.sim.adventure;
 game.gear.ensure();
 const inventory = {glider:3,club:1,wood:5};
 game.gear.commit(migrateGear(inventory,()=>room.sim.allocateEntityId(),{quality:{glider:2},durability:{glider:17}}),inventory);
 const wings = structuredClone(game.state.gearItems!.lots.filter(lot=>lot.kind==='glider'));
 game.hurtPlayer(1000,'physical');
 expect(game.state.inventory.glider).toBe(3);expect(game.state.grave?.glider).toBeUndefined();
 expect(game.state.gearItems!.lots).toEqual(wings);expect(game.state.graveGear!.lots.every(lot=>lot.kind!=='glider')).toBe(true);
 const restored = new SessionAuthority(validateSave(room.save())),next = restored.sim.adventure;
 expect(next.state.gearItems!.lots).toEqual(wings);expect(next.state.inventory.glider).toBe(3);
 const holder = {items:next.state.grave!,gearItems:next.state.graveGear};next.gear.recover(holder);
 next.state.grave = holder.items;next.state.graveGear = holder.gearItems;
 expect(next.state.gearItems!.lots.filter(lot=>lot.kind==='glider')).toEqual(wings);
 expect(next.state.inventory.glider).toBe(3);expect(next.state.inventory.club).toBe(1);
 expect(()=>validateSave(restored.save())).not.toThrow();
});

it('does not grant a missing wing on death and keeps legacy generator equipment death rules',()=>{
 for (const generator of [3,4] as const) {
  const sim = new GameSimulation(undefined,generator),game = sim.adventure;
  const inventory: Record<string,number> = generator===3?{glider:1,club:1}:{club:1};
  game.gear.ensure();game.gear.commit(migrateGear(inventory,()=>sim.allocateEntityId()),inventory);
  game.hurtPlayer(1000,'physical');
  expect(game.state.inventory.glider??0).toBe(0);
  expect(game.state.grave?.glider??0).toBe(generator===3?1:0);
  expect(()=>validateGear(game.state.gearItems,game.state.inventory)).not.toThrow();
  expect(()=>validateSave(sim.save())).not.toThrow();
 }
});

it('keeps an earlier upgraded fused grave intact across a second death and recovery',()=>{
 const sim = new GameSimulation(),game = sim.adventure;
 sim.adventure.state.enemies = [];sim.fluid.restore([]);game.gear.ensure();
 const inventory = {glider:1,club:1,wood:5};
 const fusion = {equipment:'club',material:'resin' as const,damage:4,durability:12,effect:'fire' as const};
 game.gear.commit(migrateGear(inventory,()=>sim.allocateEntityId(),{quality:{club:3},durability:{club:7},fusions:[fusion]}),inventory);
 const club = structuredClone(game.gear.selected('club')!),wing = structuredClone(game.gear.selected('glider')!);
 game.hurtPlayer(1000,'physical');
 for (let i = 0; i < 95; i++) game.stepPersonal(1 / 30);
 game.gear.craft('club',1,{...game.state.inventory});
 const fresh = structuredClone(game.gear.selected('club')!);
 game.hurtPlayer(1000,'physical');
 expect(game.state.meadows!.graves).toHaveLength(1);
 expect(game.state.meadows!.graves![0].gearItems!.lots).toEqual([club]);
 expect(game.state.graveGear!.lots).toEqual([fresh]);expect(game.state.gearItems!.lots).toEqual([wing]);
 const restored = new GameSimulation(validateSave(sim.save())),next = restored.adventure;
 next.gear.recover(next.state.meadows!.graves![0]);
 expect(next.state.gearItems!.lots).toEqual([wing,club]);
 expect(next.state.graveGear!.lots).toEqual([fresh]);
 expect(next.state.meadows!.graves![0].gearItems!.lots).toEqual([]);
 expect(()=>validateSave(restored.save())).not.toThrow();
});

it('retains only the downed participant’s exact wing at cooperative bleedout',()=>{
 const room = new SessionAuthority(),guest = room.join('guest'),host = room.sim.adventure;
 const hostWing = structuredClone(host.gear.selected('glider')!),guestWing = structuredClone(guest.adventure.gear.selected('glider')!);
 guest.adventure.hurtPlayer(1000,'physical',guest.player);
 expect(guest.adventure.state.downed).toBe(DOWNED_SECONDS);
 expect(guest.adventure.gear.selected('glider')).toEqual(guestWing);
 guest.adventure.state.downed = .01;room.step({x:0,z:0,jump:false});
 expect(guest.adventure.state.downed).toBeUndefined();
 expect(guest.adventure.state.gearItems!.lots).toEqual([guestWing]);
 expect(guest.adventure.state.grave?.glider).toBeUndefined();
 expect(host.gear.selected('glider')).toEqual(hostWing);expect(hostWing.id).not.toBe(guestWing.id);
 expect(()=>validateSave(room.save())).not.toThrow();
});
