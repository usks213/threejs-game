import {expect,it} from 'vitest';
import {SessionAuthority} from '../../src/simulation/session';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {migrateGear,selectedGear,GEAR_LIMITS} from '../../src/game/equipment/items';
import type {SkyFusion} from '../../src/game/skybound/types';
import {validateSave} from '../../src/save/format';
import {participantSave} from '../../src/save/participant';
import {releaseBuildingItems,DROP_LIMIT} from '../../src/game/interaction/drops';
const aim={x:0,y:0,z:1},fusion:SkyFusion={equipment:'club',material:'resin',damage:4,durability:12,effect:'fire'};
function fixture(){
 const room=new SessionAuthority(),sim=room.sim,a=room.join('alice'),b=room.join('bob');sim.adventure.state.enemies=[];sim.adventure.state.resources=[];sim.adventure.state.buildings=[];sim.fluid.restore([]);sim.bodies.length=0;
 Object.assign(a.player,{x:12,y:sim.groundAt(12,12)+.02,z:12,grounded:true});Object.assign(b.player,{x:13,y:sim.groundAt(13,12)+.02,z:12,grounded:true});
 const seed=(id:string,items:Record<string,number>,quality:Record<string,number>={},durability:Record<string,number>={},fusions:SkyFusion[]=[])=>{const g=room.actors.get(id)!.adventure;g.state.inventory={...items};g.gear.commit(migrateGear(items,()=>sim.allocateEntityId(),{quality,durability,fusions}));};
 const action=(owner:string,action:Parameters<SessionAuthority['action']>[1] extends never?never:import('../../src/game/types').GameAction,id?:string)=>{sim.tick+=4;return room.action(owner,{type:'game-action',action,id,aim});};
 return {room,sim,a,b,seed,action};
}
it('hands off exact equipment to another real Session actor without overwriting the receiver’s selected copy',()=>{
 const {room,sim,a,b,seed,action}=fixture();seed('alice',{club:1},{club:3},{club:7},[fusion]);seed('bob',{club:1},{club:1},{club:88});const original=structuredClone(a.adventure.state.gearItems!.lots[0]),selectedB=selectedGear(b.adventure.state.gearItems!,'club')!.id;
 action('alice','drop',`gear:${original.id}:1`);const drop=sim.adventure.state.resources.find(n=>n.kind==='club')!;expect(drop.gearItems?.lots[0]).toEqual(original);
 action('bob','gather',String(drop.id));expect(a.adventure.state.inventory.club).toBe(0);expect(a.adventure.state.gearItems!.lots).toEqual([]);expect(sim.skybound.fusion('alice','club')).toBeUndefined();
 expect(b.adventure.state.inventory.club).toBe(2);expect(b.adventure.state.gearItems!.lots).toContainEqual(original);expect(selectedGear(b.adventure.state.gearItems!,'club')?.id).toBe(selectedB);expect(b.adventure.state.meadows!.durability.club).toBe(88);
 action('bob','equip',`gear:${original.id}`);expect(b.adventure.state.meadows!.quality.club).toBe(3);expect(b.adventure.state.meadows!.durability.club).toBe(7);expect(sim.skybound.fusion('bob','club')).toEqual(fusion);
 const restored=new SessionAuthority(validateSave(room.save()));const returning=restored.join('bob');expect(selectedGear(returning.adventure.state.gearItems!,'club')).toEqual(original);expect(restored.sim.skybound.fusion('bob','club')).toEqual(fusion);expect(restored.join('alice').adventure.state.gearItems!.lots).toEqual([]);
});
it('death then fresh craft then grave recovery keeps old and new gear distinct with one fusion',()=>{
 const {room,sim,a,seed,action}=fixture();seed('alice',{club:1},{club:3},{club:7},[fusion]);const original=structuredClone(a.adventure.state.gearItems!.lots[0]);
 a.adventure.hurtPlayer(1000,'physical',a.player);a.adventure.state.downed=.001;room.step();for(let i=0;i<100&&a.adventure.state.health===0;i++)room.step();expect(a.adventure.state.health).toBeGreaterThan(0);expect(a.adventure.state.graveGear?.lots).toEqual([original]);expect(sim.skybound.fusion('alice','club')).toBeUndefined();
 a.adventure.state.inventory.wood=3;action('alice','craft','club');const fresh=structuredClone(selectedGear(a.adventure.state.gearItems!,'club')!);expect(fresh).toMatchObject({quality:1,durability:100});expect(fresh.fusion).toBeUndefined();expect(fresh.id).not.toBe(original.id);
 Object.assign(a.player,a.adventure.state.death);action('alice','gather','grave');expect(a.adventure.state.inventory.club).toBe(2);expect(a.adventure.state.gearItems!.lots).toEqual([fresh,original]);expect(selectedGear(a.adventure.state.gearItems!,'club')).toEqual(fresh);expect(a.adventure.state.graveGear?.lots).toEqual([]);expect(a.adventure.state.death).toBeNull();
 const saved=validateSave(room.save()),restored=new SessionAuthority(saved);expect(restored.join('alice').adventure.state.gearItems!.lots).toEqual([fresh,original]);
});
it('repairs, upgrades and fuses only the explicitly selected individual and preserves other copies',()=>{
 const {sim,a,seed,action}=fixture();seed('alice',{club:2,stone:20,resin:10,crystal:10},{club:1},{club:7});const source=a.adventure.state.gearItems!.lots[0];
 action('alice','repair','club');expect(a.adventure.state.gearItems!.lots).toHaveLength(2);const repaired=selectedGear(a.adventure.state.gearItems!,'club')!;expect(repaired).toMatchObject({count:1,durability:100});expect(a.adventure.state.gearItems!.lots.find(l=>l.id===source.id)).toMatchObject({count:1,durability:7});
 sim.adventure.state.siteWorld!.completed=[850001];action('alice','upgrade','club');expect(selectedGear(a.adventure.state.gearItems!,'club')).toMatchObject({quality:2,durability:150});action('alice','sky-fuse','club:resin');
 expect(a.adventure.state.gearItems!.lots.find(l=>l.id===source.id)).toMatchObject({quality:1,durability:7});expect(a.adventure.state.gearItems!.lots.filter(l=>l.fusion)).toHaveLength(1);expect(sim.skybound.state.fusions.alice).toBeUndefined();
});
it('moves lot-selected equipment through a static chest and redacts private chest metadata',()=>{
 const {room,sim,a,b,seed,action}=fixture();seed('alice',{club:1},{club:3},{club:7},[fusion]);seed('bob',{});const lot=structuredClone(a.adventure.state.gearItems!.lots[0]),box={id:sim.allocateEntityId(),definition:'chest',x:a.player.x+1,y:sim.groundAt(a.player.x+1,a.player.z),z:a.player.z,rotation:0,support:4,contents:{},creator:'alice',shared:false};sim.adventure.state.buildings.push(box);
 action('alice','store',`${box.id}|gear:${lot.id}:1`);const stored=sim.adventure.state.buildings[0];expect(stored.gearItems?.lots).toEqual([lot]);expect(room.view('bob').adventure.buildings[0].gearItems).toBeUndefined();expect(participantSave(room,'bob').adventure!.buildings[0].gearItems).toBeUndefined();
 expect(()=>action('bob','take',`${box.id}|gear:${lot.id}:1`)).toThrow();stored.shared=true;action('bob','take',`${box.id}|gear:${lot.id}:1`);expect(b.adventure.state.gearItems!.lots).toEqual([lot]);expect(stored.gearItems?.lots).toEqual([]);expect(a.adventure.state.inventory.club).toBe(0);
 const portable=participantSave(room,'bob',{portable:true});expect(portable.adventure!.gearItems!.lots).toEqual([lot]);expect(portable.members).toBeUndefined();
});
it('does not consume IDs or alter inventory on failed gear capacity/metadata/drop transactions',()=>{
 const {room,sim,a,seed,action}=fixture();seed('alice',{club:1,wood:148},{club:2},{club:7});a.adventure.state.meadows!.slots=Array.from({length:32},()=>({id:'wood',count:1}));
 const before=room.save();expect(()=>action('alice','craft','shield')).toThrow();expect(room.save().nextEntityId).toBe(before.nextEntityId);expect(a.adventure.state.inventory).toEqual(before.members!.find(m=>m.id==='alice')!.adventure.inventory);
 const c=a.adventure.state.gearItems!,ids=Array.from({length:GEAR_LIMITS.lots-1},()=>sim.allocateEntityId());c.lots=[{...c.lots[0],count:2},...ids.map(id=>({id,kind:'club',count:1,quality:1,durability:100}))];c.activeByKind.club=c.lots[0].id;a.adventure.state.inventory.club=GEAR_LIMITS.lots+1;
 const bounded=room.save();expect(()=>action('alice','sky-fuse','club:resin')).toThrow();expect(room.save().nextEntityId).toBe(bounded.nextEntityId);expect(a.adventure.state.gearItems).toEqual(bounded.members!.find(m=>m.id==='alice')!.adventure.gearItems);
});
it('preserves exact gear during overflow-to-ground and building destruction, including a full drop budget',()=>{
 const {sim,a,seed}=fixture();seed('alice',{});const lot=migrateGear({club:1},()=>sim.allocateEntityId(),{quality:{club:3},durability:{club:5},fusions:[fusion]}),box={id:sim.allocateEntityId(),definition:'chest',x:a.player.x+1,y:a.player.y,z:a.player.z,rotation:0,support:0,contents:{club:1},gearItems:lot};sim.adventure.state.buildings.push(box);
 releaseBuildingItems(a.adventure,box,{});expect(box.contents).toEqual({});expect(sim.adventure.state.resources[0].gearItems?.lots).toEqual(lot.lots);
 const before=structuredClone(sim.adventure.state.resources);sim.adventure.state.resources=Array.from({length:DROP_LIMIT},(_,i)=>({id:9000000+i,kind:'stone',amount:100,ready:0,drop:true,x:800,y:2,z:800}));const another={...box,contents:{club:1},gearItems:lot};expect(()=>releaseBuildingItems(a.adventure,another,{})).toThrow('上限');expect(another.gearItems).toEqual(lot);expect(another.contents.club).toBe(1);sim.adventure.state.resources=before;
});
it('preserves compact duplicate gear and known values when loading a legacy save',()=>{
 const save=new GameSimulation().save();delete save.adventure!.gearItems;delete save.adventure!.graveGear;save.adventure!.inventory={club:100000000};save.adventure!.meadows!.quality={club:3};save.adventure!.meadows!.durability={club:7};save.skybound!.fusions={host:[fusion]};
 const sim=new GameSimulation(validateSave(save)),saved=sim.save();expect(saved.adventure!.inventory.club).toBe(100000000);expect(saved.adventure!.gearItems!.lots).toHaveLength(2);expect(saved.adventure!.gearItems!.lots.filter(l=>l.fusion)).toHaveLength(1);expect(JSON.stringify(saved.adventure!.gearItems).length).toBeLessThan(600);
});
it('rejects low-stamina tree/attack uses without splitting legacy batches or consuming any entity ID',()=>{
 const {room,sim,a,seed,action}=fixture();seed('alice',{axe:2},{axe:1},{axe:10});a.adventure.state.equipment='axe';a.adventure.state.stamina=0;
 const tree={id:sim.allocateEntityId(),kind:'beech',amount:8,ready:0,x:a.player.x+1,y:a.player.y,z:a.player.z};sim.adventure.state.resources.push(tree);const before=room.save(),gear=structuredClone(a.adventure.state.gearItems);
 expect(()=>action('alice','gather',String(tree.id))).toThrow('スタミナ');expect(()=>action('alice','attack')).toThrow('スタミナ');expect(room.save().nextEntityId).toBe(before.nextEntityId);expect(a.adventure.state.gearItems).toEqual(gear);expect(a.adventure.state.inventory.axe).toBe(2);
});
it('does not split a merely held shield while unguarded, and blocks only the in-use lot during an active swing',()=>{
 const {room,sim,a,seed,action}=fixture();seed('alice',{shield:2,club:2},{shield:1,club:1},{shield:50,club:50});a.adventure.state.meadows!.gear.offhand='shield';a.adventure.state.equipment='club';
 const idBefore=room.save().nextEntityId,shield=structuredClone(selectedGear(a.adventure.state.gearItems!,'shield'));a.adventure.hurtPlayer(1,'physical',a.player,{x:a.player.x,y:a.player.y,z:a.player.z+1});expect(room.save().nextEntityId).toBe(idBefore);expect(selectedGear(a.adventure.state.gearItems!,'shield')).toEqual(shield);
 action('alice','attack');const used=selectedGear(a.adventure.state.gearItems!,'club')!,unused=a.adventure.state.gearItems!.lots.find(l=>l.kind==='club'&&l.id!==used.id)!;
 const box={id:sim.allocateEntityId(),definition:'chest',x:a.player.x+1,y:a.player.y,z:a.player.z,rotation:0,support:4,contents:{},creator:'alice'};sim.adventure.state.buildings.push(box);
 expect(()=>action('alice','drop',`gear:${used.id}:1`)).toThrow('回復');expect(()=>action('alice','store',`${box.id}|gear:${used.id}:1`)).toThrow('回復');expect(()=>action('alice','repair','club')).toThrow('回復');
 expect(()=>action('alice','drop',`gear:${unused.id}:1`)).not.toThrow();expect(selectedGear(a.adventure.state.gearItems!,'club')?.id).toBe(used.id);
});
it('recovers a thrown exact spear once after a save/restart without refilling durability or fusion',()=>{
 const {room,sim,a,b,seed,action}=fixture();const spearFusion={...fusion,equipment:'flintSpear'};seed('alice',{flintSpear:1},{flintSpear:2},{flintSpear:40},[spearFusion]);seed('bob',{});const original=a.adventure.state.gearItems!.lots[0];action('alice','equip',`gear:${original.id}`);action('alice','heavy');
 expect(a.adventure.state.inventory.flintSpear).toBe(0);expect(sim.adventure.state.gearFlights).toHaveLength(1);expect(sim.adventure.state.gearFlights![0].gearItems.lots[0]).toMatchObject({id:original.id,quality:2,durability:39,fusion:{durability:11}});
 const saved=validateSave(room.save());expect(saved.members!.every(m=>m.adventure.gearFlights===undefined)).toBe(true);const restored=new SessionAuthority(saved),returning=restored.join('alice'),receiver=restored.join('bob'),node=restored.sim.adventure.state.resources.find(n=>n.kind==='flintSpear'&&n.drop)!;
 expect(node.gearItems!.lots[0]).toMatchObject({id:original.id,quality:2,durability:39,fusion:{durability:11}});expect(restored.sim.adventure.state.gearFlights).toEqual([]);expect(returning.adventure.state.inventory.flintSpear).toBe(0);
 Object.assign(receiver.player,{x:node.x+1,y:node.y,z:node.z,grounded:true});restored.sim.tick+=4;restored.action('bob',{type:'game-action',action:'gather',id:String(node.id),aim});expect(receiver.adventure.state.gearItems!.lots[0].id).toBe(original.id);
 restored.sim.tick+=4;expect(()=>restored.action('bob',{type:'game-action',action:'gather',id:String(node.id),aim})).toThrow();expect(receiver.adventure.state.inventory.flintSpear).toBe(1);expect(b.adventure.state.inventory.flintSpear).toBeUndefined();
});
it('rejects conflicting equipment ownership across dormant participants and preserves all legacy duplicate counts in generators1–3',()=>{
 const {room,sim,a,b,seed}=fixture();seed('alice',{club:1},{club:2},{club:7});seed('bob',{});room.leave('alice');const bad=room.save();bad.adventure!.gearItems=structuredClone(bad.members!.find(m=>m.id==='alice')!.adventure.gearItems);bad.adventure!.inventory={club:1};expect(()=>validateSave(bad)).toThrow('重複');
 for(const generator of[1,2,3]as const){const save=new GameSimulation(undefined,generator).save();delete save.adventure!.gearItems;delete save.adventure!.graveGear;save.adventure!.inventory={club:9};if(save.adventure!.meadows){save.adventure!.meadows.quality={club:2};save.adventure!.meadows.durability={club:11};}const loaded=new GameSimulation(validateSave(save));loaded.adventure.action('equip','club');expect(loaded.adventure.state.inventory.club).toBe(9);expect(loaded.save().adventure!.gearItems!.lots.reduce((n,l)=>n+l.count,0)).toBe(9);}
});
it('rejects a stale exact legacy-batch count rather than silently transferring fewer items',()=>{
 const {room,sim,a,seed,action}=fixture();seed('alice',{club:3},{club:2},{club:7});const id=a.adventure.state.gearItems!.lots[0].id;action('alice','drop',`gear:${id}:2`);expect(a.adventure.state.inventory.club).toBe(1);const before=room.save();
 expect(()=>action('alice','drop',`gear:${id}:2`)).toThrow('更新');expect(a.adventure.state.inventory.club).toBe(1);expect(sim.adventure.state.resources.filter(n=>n.kind==='club').reduce((n,r)=>n+r.amount,0)).toBe(2);expect(room.save().nextEntityId).toBe(before.nextEntityId);
});
it('preflights an exhausted metadata budget before consuming ammunition, stamina or durability',()=>{
 const {room,sim,a,seed,action}=fixture();seed('alice',{crudeBow:2,woodArrow:10},{crudeBow:1},{crudeBow:50});const c=structuredClone(a.adventure.state.gearItems!);for(let i=1;i<GEAR_LIMITS.lots;i++)c.lots.push({id:sim.allocateEntityId(),kind:'crudeBow',count:1,quality:1,durability:50});a.adventure.gear.commit(c);a.adventure.state.equipment='crudeBow';a.adventure.state.stamina=50;
 const before=room.save();expect(()=>action('alice','attack')).toThrow('いっぱい');expect(a.adventure.state.inventory.woodArrow).toBe(10);expect(a.adventure.state.stamina).toBe(50);expect(a.adventure.state.gearItems).toEqual(c);expect(room.save().nextEntityId).toBe(before.nextEntityId);expect(a.adventure.projectiles).toEqual([]);
});
it('rejects insufficient fusion material without consuming reserved IDs or changing either lot',()=>{
 const {room,a,seed,action}=fixture();seed('alice',{club:2},{club:2},{club:7});const before=room.save();expect(()=>action('alice','sky-fuse','club:resin')).toThrow('足りません');expect(room.save().nextEntityId).toBe(before.nextEntityId);expect(a.adventure.state.gearItems).toEqual(before.members!.find(m=>m.id==='alice')!.adventure.gearItems);
});
it('manual return selects free space around the start and keeps its position and lease if every candidate is blocked',()=>{
 const {room,sim,a,seed,action}=fixture();seed('alice',{wood:10});const host=room.actors.get('host')!;Object.assign(host.player,{x:0,y:sim.groundAt(0,8)+.03,z:8,grounded:true});action('alice','return');expect(Math.hypot(a.player.x-host.player.x,a.player.z-host.player.z)).toBeGreaterThanOrEqual(.7);
 Object.assign(a.player,{x:12,y:sim.groundAt(12,12)+.03,z:12,grounded:true});sim.tick+=4;room.action('alice',{type:'game-action',action:'sky-part',id:'block:wood',target:{x:14,y:a.player.y+2,z:12},aim});action('alice','sky-grab',String(sim.skybound.state.parts[0].id));const before={...a.player};const density=sim.world.density;sim.world.density=()=>-1;
 expect(()=>action('alice','return')).toThrow('安全な空き');expect(a.player).toEqual(before);expect(sim.skybound.leases.get(sim.skybound.state.parts[0].id)?.owner).toBe('alice');sim.world.density=density;
});

it('drops a100M homogeneous legacy batch as one holder, partially picks it up and saves exact remaining metadata',()=>{
 const {room,sim,a,b,seed,action}=fixture();seed('alice',{club:100000000},{club:3},{club:7});seed('bob',{});const old=structuredClone(a.adventure.state.gearItems!.lots[0]);
 action('alice','drop',`gear:${old.id}:100000000`);const drops=sim.adventure.state.resources.filter(n=>n.kind==='club');expect(drops).toHaveLength(1);expect(drops[0].amount).toBe(100000000);expect(drops[0].gearItems!.lots).toEqual([old]);expect(a.adventure.state.inventory.club).toBe(0);
 action('bob','gather',String(drops[0].id));expect(b.adventure.state.inventory.club).toBe(32);expect(drops[0].amount).toBe(99999968);expect(drops[0].gearItems!.lots[0]).toMatchObject({id:old.id,count:99999968,quality:3,durability:7});
 const picked=b.adventure.state.gearItems!.lots[0];expect(picked.id).not.toBe(old.id);expect(picked).toMatchObject({count:32,quality:3,durability:7});const saved=validateSave(room.save());expect(saved.adventure!.resources.filter(n=>n.kind==='club')).toHaveLength(1);const restored=new SessionAuthority(saved);expect(restored.join('bob').adventure.state.inventory.club).toBe(32);expect(restored.sim.adventure.state.resources.find(n=>n.kind==='club')!.amount).toBe(99999968);
});
it('gives fresh starters and new joiners known defaults while retaining genuinely missing legacy metadata',()=>{
 const sim=new GameSimulation(),starter=sim.save().adventure!.gearItems!.lots.find(l=>l.kind==='club')!;expect(starter).toMatchObject({count:1,quality:1,durability:100});expect(starter.legacy).toBeUndefined();
 const room=new SessionAuthority(),joined=room.join('newcomer'),club=joined.adventure.state.gearItems!.lots.find(l=>l.kind==='club')!;expect(club).toMatchObject({count:1,quality:1,durability:100});expect(club.legacy).toBeUndefined();expect(room.sim.adventure.state.gearItems!.lots.some(l=>l.id===club.id)).toBe(false);
 const old=new GameSimulation(undefined,3).save();delete old.adventure!.gearItems;delete old.adventure!.graveGear;old.adventure!.inventory={club:2};old.adventure!.equipment='club';old.adventure!.meadows!.quality={};old.adventure!.meadows!.durability={};const legacy=new GameSimulation(validateSave(old));legacy.adventure.action('attack');expect(legacy.adventure.state.gearItems!.lots.reduce((n,l)=>n+l.count,0)).toBe(2);expect(legacy.adventure.state.gearItems!.lots.every(l=>l.legacy&&l.quality===undefined&&l.durability===undefined)).toBe(true);
});
