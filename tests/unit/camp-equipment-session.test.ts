import {expect,it} from 'vitest';
import {SessionAuthority} from '../../src/simulation/session';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {seedInventory} from '../helpers/equipment';
import {migrateGear} from '../../src/game/equipment/items';
import {validateSave} from '../../src/save/format';
import {participantSave} from '../../src/save/participant';
import {assemblyBuoyancy} from '../../src/game/skybound/buoyancy';
import {skyContext} from '../../src/game/skybound/context';
import type {GameAction} from '../../src/game/types';
const aim={x:0,y:0,z:1};
function fixture(){
 const room=new SessionAuthority(),sim=room.sim,a=room.join('alice'),b=room.join('bob');sim.adventure.state.resources=[];sim.adventure.state.enemies=[];sim.adventure.state.buildings=[];sim.fluid.restore([]);sim.bodies.length=0;
 Object.assign(a.player,{x:21,y:25.005,z:-20,vy:0,grounded:true});Object.assign(b.player,{x:21,y:25.005,z:-21,vy:0,grounded:true});seedInventory(a.adventure,{wood:60,club:1});seedInventory(b.adventure,{club:1});a.adventure.gear.edit('club',lot=>{lot.quality=3;lot.durability=7;lot.fusion={equipment:'club',material:'resin',damage:4,durability:12,effect:'fire'};});b.adventure.gear.edit('club',lot=>lot.durability=88);
 const action=(owner:string,action:GameAction,id='',target?:{x:number;y:number;z:number},epoch?:number)=>{sim.tick+=4;const root=sim.skybound.state.parts.find(p=>p.id===Number(id.split(':')[0]));return room.action(owner,{type:'game-action',action,id,target,aim,...(root?{expectedEpoch:epoch??root.epoch}:{})});};
 action('alice','sky-part','slab:wood',{x:21,y:25.125,z:-18});action('alice','sky-part','bed:wood',{x:20.5,y:25.5,z:-18});action('alice','sky-part','storage:wood',{x:21.625,y:25.75,z:-18});action('alice','sky-grab','1');action('alice','sky-glue','1:2');action('alice','sky-glue','1:3');action('alice','sky-release','1');
 return{room,sim,a,b,action,lot:structuredClone(a.adventure.state.gearItems!.lots[0])};
}
it('stores exact fused gear on the moving authority assembly, shares it and transfers without replacing another selected copy',()=>{
 const {room,sim,a,b,action,lot}=fixture(),other=b.adventure.state.gearItems!.activeByKind.club,storage=sim.skybound.state.parts[2],epoch=storage.epoch;
 action('alice','sky-store',`3:gear-${lot.id}:1`);expect(a.adventure.state.inventory.club).toBe(0);expect(sim.skybound.state.storageGear?.[3].lots).toEqual([lot]);expect(storage.cargoMass).toBe(1);expect(storage.epoch).toBe(epoch+1);
 expect(room.view('bob').adventure.skybound?.storage).toEqual([]);expect(()=>action('bob','sky-take',`3:gear-${lot.id}:1`)).toThrow('作成者');
 const before=sim.skybound.state.parts.map(p=>({...p.position}));action('alice','sky-grab','1');action('alice','sky-move','1',{x:22,y:25.125,z:-18});action('alice','sky-release','1');for(let i=0;i<before.length;i++)expect(sim.skybound.state.parts[i].position.x).toBeCloseTo(before[i].x+1,8);expect(sim.skybound.state.storageGear?.[3].lots).toEqual([lot]);
 action('alice','sky-share','3:on');Object.assign(b.player,{x:22,y:25.005,z:-20});const shared=room.view('bob').adventure.skybound!.storage![0];expect(shared.gearItems?.lots).toEqual([lot]);
 expect(()=>action('bob','sky-take',`3:gear-${lot.id}:1`,undefined,epoch)).toThrow('更新');action('bob','sky-take',`3:gear-${lot.id}:1`);expect(b.adventure.state.inventory.club).toBe(2);expect(b.adventure.state.gearItems!.activeByKind.club).toBe(other);expect(b.adventure.state.gearItems!.lots).toContainEqual(lot);expect(sim.skybound.state.storageGear?.[3].lots).toEqual([]);expect(storage.cargoMass).toBe(0);
});
it('preflights8 camp slots, cargo weight and actor capacity before any split, ID, epoch or inventory write',()=>{
 const {room,sim,a,action}=fixture();const inventory={wood:49,stone:38,club:9};a.adventure.state.inventory=inventory;a.adventure.gear.commit(migrateGear(inventory,()=>sim.allocateEntityId(),{quality:{club:3},durability:{club:7}}));const id=a.adventure.state.gearItems!.lots[0].id;
 let before=room.save();expect(()=>action('alice','sky-store',`3:gear-${id}:9`)).toThrow('容量');expect(room.save()).toEqual(before);
 action('alice','sky-store','3:stone:38');before=room.save();expect(()=>action('alice','sky-store',`3:gear-${id}:7`)).toThrow('容量');expect(room.save()).toEqual(before);
 action('alice','sky-store',`3:gear-${id}:4`);const cargo=sim.skybound.state.storageGear![3].lots[0];expect(cargo.id).not.toBe(id);expect(cargo).toMatchObject({count:4,quality:3,durability:7});expect(sim.skybound.state.parts[2].cargoMass).toBe(80);expect(a.adventure.state.inventory.club).toBe(5);
 a.adventure.state.inventory.wood=150;before=room.save();expect(()=>action('alice','sky-take',`3:gear-${cargo.id}:1`)).toThrow('空き');expect(room.save()).toEqual(before);
});
it('redacts another creator’s camp gear in portable exports, recomputes mass and rejects cross-holder identity duplication',()=>{
 const {room,sim,a,action,lot}=fixture();action('alice','sky-store',`3:gear-${lot.id}:1`);action('alice','sky-share','3:on');const own=participantSave(room,'alice',{portable:true}),other=participantSave(room,'bob',{portable:true}),shared=participantSave(room,'bob');
 expect(own.skybound?.storageGear?.[3].lots).toEqual([lot]);expect(other.skybound?.storageGear?.[3]).toBeUndefined();expect(other.skybound?.parts[2].cargoMass).toBe(0);expect(other.skybound?.parts[2].mass).toBe(8);expect(shared.skybound?.storageGear?.[3].lots).toEqual([lot]);expect(a.adventure.state.gearItems!.lots).toEqual([]);
 const bad=room.save(),member=bad.members!.find(m=>m.id==='alice')!;member.adventure.gearItems=structuredClone(bad.skybound!.storageGear![3]);member.adventure.inventory.club=1;expect(()=>validateSave(bad)).toThrow('重複');
 const missing=room.save();delete missing.skybound!.storageGear;expect(()=>validateSave(missing)).toThrow('欠け');const orphan=room.save();orphan.skybound!.storageGear![99]=structuredClone(orphan.skybound!.storageGear![3]);expect(()=>validateSave(orphan)).toThrow('倉庫');
 const restored=new SessionAuthority(validateSave(room.save()));expect(restored.sim.skybound.state.storageGear?.[3].lots).toEqual([lot]);expect(restored.join('alice').adventure.state.inventory.club).toBe(0);
});
it('retains exact gear in a destroyed storage wreck and removes its metadata only after successful recovery',()=>{
 const {room,sim,a,action,lot}=fixture();action('alice','sky-store',`3:gear-${lot.id}:1`);action('alice','sky-grab','3');expect(()=>action('alice','sky-salvage','3')).toThrow('空に');action('alice','sky-release','3');sim.skybound.state.parts[2].integrity=0;room.step();
 expect(sim.skybound.state.parts.find(p=>p.id===3)?.wrecked).toBe(true);expect(sim.skybound.state.storageGear?.[3].lots).toEqual([lot]);expect(()=>action('alice','sky-store',`3:gear-${lot.id}:1`)).toThrow('壊れ');
 const restored=new SessionAuthority(validateSave(room.save())),owner=restored.join('alice'),part=restored.sim.skybound.state.parts.find(p=>p.id===3)!;Object.assign(owner.player,{x:part.position.x,y:25,z:part.position.z-2});restored.sim.tick+=4;restored.action('alice',{type:'game-action',action:'sky-take',id:`3:gear-${lot.id}:1`,aim,expectedEpoch:part.epoch});restored.step();expect(restored.sim.skybound.state.parts.some(p=>p.id===3)).toBe(false);expect(restored.sim.skybound.state.storageGear?.[3]).toBeUndefined();expect(owner.adventure.state.gearItems!.lots).toContainEqual(lot);expect(owner.adventure.state.inventory.club).toBe(1);expect(a.adventure.state.inventory.club).toBe(0);
});
it('never clones stored gear through blueprint reconstruction or creates buoyant lift from it',()=>{
 const {sim,action,lot}=fixture(),ctx={...skyContext(sim),immersion:()=>1,waterFraction:()=>1},before=assemblyBuoyancy(sim.skybound.state.parts,ctx).force.y;
 action('alice','sky-store',`3:gear-${lot.id}:1`);expect(assemblyBuoyancy(sim.skybound.state.parts,ctx).force.y).toBe(before);action('alice','sky-blueprint','1:荷物付き');const plan=sim.skybound.state.blueprints[0];action('alice','sky-rebuild',String(plan.id),{x:21,y:27,z:-15});
 const created=sim.skybound.state.parts.find(p=>p.kind==='storage'&&p.id!==3)!;expect(sim.skybound.state.storageGear?.[created.id]).toBeUndefined();expect(sim.skybound.state.storage?.[created.id]).toBeUndefined();expect(created.cargoMass??0).toBe(0);expect(sim.skybound.state.storageGear?.[3].lots).toEqual([lot]);
});
it('migrates formerly allowed count-only linenHat cargo without inventing metadata or losing large allowed counts',()=>{
 const {room}=fixture(),old=room.save(),part=old.skybound!.parts.find(p=>p.id===3)!;old.skybound!.storage={'3':{linenHat:80}};delete old.skybound!.storageGear;part.cargoMass=80;part.mass=88;
 const restored=new SessionAuthority(validateSave(old)),gear=restored.sim.skybound.state.storageGear![3].lots[0];expect(gear).toMatchObject({kind:'linenHat',count:80,legacy:true});expect(gear.quality).toBeUndefined();expect(gear.durability).toBeUndefined();expect(restored.sim.skybound.state.storage?.[3]).toEqual({linenHat:80});
 const again=new GameSimulation(validateSave(restored.save()));expect(again.skybound.state.storageGear![3].lots).toEqual([gear]);
});
it('rejects transfer of an actively used lot into a camp while allowing exact non-equipped cargo afterward',()=>{
 const {sim,a,action,lot}=fixture();action('alice','equip',`gear:${lot.id}`);action('alice','attack');const before=structuredClone(a.adventure.state.gearItems);expect(()=>action('alice','sky-store',`3:gear-${lot.id}:1`)).toThrow('回復');expect(a.adventure.state.gearItems).toEqual(before);expect(sim.skybound.state.storageGear?.[3]).toBeUndefined();
});
it('recalls only the assembly pose and never restores a second copy of stored gear',()=>{
 const {room,sim,a,action,lot}=fixture();action('alice','sky-store',`3:gear-${lot.id}:1`);const gear=structuredClone(sim.skybound.state.storageGear![3]);for(let i=0;i<12;i++)room.step();action('alice','sky-recall','1');for(let i=0;i<6;i++)room.step();expect(sim.skybound.state.storageGear![3]).toEqual(gear);expect(a.adventure.state.inventory.club).toBe(0);expect(sim.skybound.state.storage![3].club).toBe(1);expect(sim.skybound.snapshot('alice').storage![0].gearItems!.lots[0].id).toBe(lot.id);
});
it('ends gliding and fishing when the last required utility lot is successfully stored',()=>{
 const {sim,a,action}=fixture();seedInventory(a.adventure,{...a.adventure.state.inventory,glider:1,fishingRod:1,bait:1});const wing=a.adventure.state.gearItems!.lots.find(l=>l.kind==='glider')!,rod=a.adventure.state.gearItems!.lots.find(l=>l.kind==='fishingRod')!;
 Object.assign(a.player,{y:25.8,grounded:false,vy:-1});action('alice','glide','on');expect(a.adventure.traversal.gliding).toBe(true);action('alice','sky-store',`3:gear-${wing.id}:1`);expect(a.adventure.traversal.gliding).toBe(false);expect(a.adventure.state.inventory.glider).toBe(0);
 sim.adventure.state.resources.push({id:sim.allocateEntityId(),kind:'perch',amount:1,ready:0,x:a.player.x+1,y:a.player.y,z:a.player.z});action('alice','fish');expect(a.adventure.state.meadows!.fishing).toBeDefined();action('alice','sky-store',`3:gear-${rod.id}:1`);expect(a.adventure.state.meadows!.fishing).toBeUndefined();expect(a.adventure.state.inventory.fishingRod).toBe(0);expect(sim.skybound.state.storageGear![3].lots.map(l=>l.kind)).toEqual(['glider','fishingRod']);
});
