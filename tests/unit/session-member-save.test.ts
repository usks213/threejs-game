import { expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { SessionAuthority, MAX_RECORDED_MEMBERS } from '../../src/simulation/session';
import { Adventure } from '../../src/game/adventure';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { newMeadows } from '../../src/game/meadows/state';
import { legacySimulation } from '../helpers/legacy';
import { validateSave } from '../../src/save/format';
import type { ResourceNode } from '../../src/game/types';
function fixture(){const save=legacySimulation().save();save.adventure!.meadows=newMeadows();return new SessionAuthority(save);}
it('omits shared arrays before cloning and preserves personal food, inventory, gear, pins, graves and journal',()=>{
 const room=fixture(),member=room.join('a'),s=member.adventure.state,m=s.meadows!;
 s.inventory.wood=17;s.food=50;s.death={x:1,y:2,z:3};s.grave={stone:4};s.trialJournal=[825001];m.foods=[{id:'berry',remaining:30}];m.pins=[{id:1,x:3,z:4,label:'My camp'}];m.graves=[{x:1,y:2,z:3,items:{wood:2}}];m.gear.chest='ragTunic';m.mapCells=['0,0'];
 room.sim.adventure.state.meadows!.worldTiles=['0,0','1,0'];room.sim.adventure.state.meadows!.pendingWaterTiles=[{x:0,z:0,column:0}];
 const memberSave=member.adventure.save(false);expect(memberSave.resources).toEqual([]);expect(memberSave.enemies).toEqual([]);expect(memberSave.buildings).toEqual([]);expect(memberSave.trialWorld).toBeUndefined();expect(memberSave.meadows!.worldTiles).toBeUndefined();expect(memberSave.meadows!.pendingWaterTiles).toBeUndefined();
 expect(memberSave.inventory.wood).toBe(17);expect(memberSave.food).toBe(50);expect(memberSave.grave).toEqual({stone:4});expect(memberSave.trialJournal).toEqual([825001]);expect(memberSave.meadows).toMatchObject({foods:m.foods,pins:m.pins,graves:m.graves,gear:m.gear,mapCells:['0,0']});
 const plain=legacySimulation().adventure;plain.state.resources=new Proxy([] as ResourceNode[],{ownKeys(){throw Error('Shared world must not be traversed');}});expect(()=>plain.save(false)).not.toThrow();expect(()=>plain.save()).toThrow();
});
it('rebinds dormant and restarted members to canonical progress while keeping save snapshots detached',()=>{
 const room=fixture(),a=room.join('a');a.adventure.state.inventory.wood=17;a.adventure.state.meadows!.pins=[{id:1,x:3,z:4,label:'Home'}];room.leave('a');
 const first=room.save();room.sim.adventure.state.resources[0].amount=7;room.sim.adventure.state.defeated=['stormcore'];room.sim.adventure.state.unlocked=3;
 const returning=room.join('a');expect(returning.adventure.state.resources).toBe(room.sim.adventure.state.resources);expect(returning.adventure.state.defeated).toEqual(['stormcore']);expect(returning.adventure.state.inventory.wood).toBe(17);returning.adventure.state.inventory.wood=9;
 expect(first.members![0].adventure.inventory.wood).toBe(17);const saved=validateSave(room.save());expect(saved.members![0].adventure.resources).toEqual([]);
 const restored=new SessionAuthority(saved),again=restored.join('a');expect(again.adventure.state.inventory.wood).toBe(9);expect(again.adventure.state.resources[0].amount).toBe(7);expect(again.adventure.state.unlocked).toBe(3);expect(again.adventure.state.meadows!.pins![0].label).toBe('Home');
});
it('loads old full-world member records but writes only one canonical world thereafter',()=>{
 const room=fixture(),actor=room.join('old-member');actor.adventure.state.inventory.wood=23;
 const old={...room.sim.save(),members:[{id:actor.id,player:{...actor.player},adventure:actor.adventure.save(true)}]};expect(old.members[0].adventure.resources.length).toBeGreaterThan(0);
 const loaded=new SessionAuthority(validateSave(old));expect(loaded.save().members![0].adventure.resources).toEqual([]);expect(loaded.join('old-member').adventure.state.inventory.wood).toBe(23);expect(loaded.join('old-member').adventure.state.resources).toBe(loaded.sim.adventure.state.resources);
});
it('caps new recorded identities at 256 without evicting any existing inventory, including oversized legacy saves',()=>{
 const room=fixture();for(let i=0;i<MAX_RECORDED_MEMBERS;i++){const a=room.join('member'+i);a.adventure.state.inventory.wood=i;room.leave(a.id);}
 expect(()=>room.join('newcomer')).toThrow('256');expect(room.join('member0').adventure.state.inventory.wood).toBe(0);room.leave('member0');expect(room.join('member255').adventure.state.inventory.wood).toBe(255);room.leave('member255');
 const old=room.save();old.members!.push({id:'legacy-extra',player:{x:0,y:2,z:8},adventure:Adventure.personalSave(old.adventure!)});const loaded=new SessionAuthority(validateSave(old));expect(loaded.save().members).toHaveLength(257);expect(()=>loaded.join('legacy-extra')).not.toThrow();expect(()=>loaded.join('another-new')).toThrow('256');
});
it('reduces large-room save size and records comparative save latency without claiming browser FPS',()=>{
 const room=fixture();room.sim.adventure.state.resources=Array.from({length:5000},(_,i)=>({id:10000+i,kind:'wood',amount:1,ready:0,x:i%100,y:2,z:Math.floor(i/100)}));
 for(let i=0;i<7;i++)room.join('benchmark'+i);
 const oldSave=()=>({...room.sim.save(),members:[...room.actors.values()].filter(a=>a.id!=='host').map(a=>({id:a.id,player:{...a.player},adventure:a.adventure.save(true)}))});
 const oldBytes=JSON.stringify(oldSave()).length,newBytes=JSON.stringify(room.save()).length,oldMs:number[]=[],newMs:number[]=[],oldTickMs:number[]=[],newTickMs:number[]=[];
 for(let i=0;i<8;i++){let start=performance.now();oldSave();oldMs.push(performance.now()-start);start=performance.now();room.save();newMs.push(performance.now()-start);}
 for(let i=0;i<8;i++){let start=performance.now();room.step();oldSave();oldTickMs.push(performance.now()-start);start=performance.now();room.step();room.save();newTickMs.push(performance.now()-start);}
 expect(newBytes).toBeLessThan(oldBytes*.2);const saved=room.save();expect(saved.adventure!.resources).toHaveLength(5000);expect(saved.members!.every(m=>m.adventure.resources.length===0)).toBe(true);
 oldMs.sort((a,b)=>a-b);newMs.sort((a,b)=>a-b);oldTickMs.sort((a,b)=>a-b);newTickMs.sort((a,b)=>a-b);writeFileSync('/tmp/voxel-member-save-profile.json',JSON.stringify({scope:'5000 shared resources, 7 members, Node save and tick+save samples; excludes disk/network/GPU',oldBytes,newBytes,oldMedianMs:oldMs[4],newMedianMs:newMs[4],oldTickAndSaveMedianMs:oldTickMs[4],newTickAndSaveMedianMs:newTickMs[4]}));
});
