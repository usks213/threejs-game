import {seedInventory} from '../helpers/equipment';
import {expect,it} from 'vitest';
import {SessionAuthority} from '../../src/simulation/session';
import {legacySimulation} from '../helpers/legacy';
import {newMeadows} from '../../src/game/meadows/state';
import {strikeVoxels} from '../../src/game/voxel/destruction';
import {assertBuildingDestruction,assertBuildingTerrain} from '../../src/game/building-permissions';
import {participantSave} from '../../src/save/participant';
import {validateSave} from '../../src/save/format';
import type {BuildingState,GameAction} from '../../src/game/types';
const aim={x:1,y:0,z:0};
function fixture(){const save=legacySimulation().save();save.generator=4;save.adventure!.meadows=newMeadows();const room=new SessionAuthority(save);room.sim.world.density=p=>p.y;const host=room.actors.get('host')!,a=room.join('a');for(const actor of [host,a]){Object.assign(actor.player,{x:20,y:0,z:8});seedInventory(actor.adventure,{wood:50,stone:50,hammer:1});}room.sim.adventure.state.resources=[];room.sim.adventure.state.enemies=[];room.sim.adventure.state.buildings=[];return {room,host,a};}
function action(room:SessionAuthority,owner:string,action:GameAction,id='',target?:{x:number;y:number;z:number}){room.sim.tick+=8;return room.action(owner,{type:'game-action',action,id,target,aim});}
function chest(room:SessionAuthority,options:Partial<BuildingState>={}):BuildingState{const b:BuildingState={id:800,definition:'chest',x:22,y:0,z:8,rotation:0,support:3,contents:{stone:7},creator:'host',shared:false,...options};room.sim.adventure.state.buildings.push(b);return b;}
it('creates private buildings, owner sharing permits withdrawals once, and reconnect preserves ownership',()=>{
 const {room,a}=fixture();action(room,'host','build','chest',{x:22,y:0,z:8});const b=room.sim.adventure.state.buildings[0];expect(b.creator).toBe('host');expect(b.shared).toBe(false);b.contents={stone:7};
 for(const kind of ['take','remove','chest'] as const)expect(()=>action(room,'a',kind,kind==='take'?`${b.id}|stone:7`:String(b.id))).toThrow('作成者');
 expect(()=>action(room,'a','building-share',`${b.id}:on`)).toThrow('作成者');action(room,'host','building-share',`${b.id}:on`);const before=a.adventure.state.inventory.stone;action(room,'a','take',`${b.id}|stone:7`);expect(a.adventure.state.inventory.stone).toBe(before+7);expect(()=>action(room,'a','take',`${b.id}|stone:7`)).toThrow();
 action(room,'host','building-share',`${b.id}:off`);room.leave('a');room.join('a');expect(()=>action(room,'a','remove',String(b.id))).toThrow('作成者');
});
it('permits repair and deposits, blocks vertical and occluded interactions, and keeps salvage cost finite after repair',()=>{
 const {room}=fixture(),b=chest(room,{health:10,salvage:{wood:2}});action(room,'a','repairBuilding',String(b.id));expect(b.health).toBe(100);expect(b.salvage).toEqual({wood:2});action(room,'a','store',`${b.id}|wood:2`);expect(b.contents.wood).toBe(2);
 const a=room.actors.get('a')!;a.player.y=9;expect(()=>action(room,'a','store',`${b.id}|wood:2`)).toThrow('近づ');a.player.y=0;
 room.sim.world.density=p=>p.x>20.8&&p.x<21.2?-1:p.y;expect(()=>action(room,'host','building-share',`${b.id}:on`)).toThrow('遮');
});
it('blocks voxel damage without throwing from ticks, and denies support and terrain undermining',()=>{
 const {room,a}=fixture(),b=chest(room,{definition:'wall',contents:{stone:7}}),before=structuredClone(b);
 expect(()=>strikeVoxels(a.adventure,aim,4,true)).not.toThrow();expect(b).toEqual(before);
 expect(()=>action(room,'a','attack')).not.toThrow();expect(()=>{for(let i=0;i<30;i++)room.step();}).not.toThrow();expect(b.removed??[]).toHaveLength(0);
 const base=chest(room,{id:801,x:24,creator:'a',definition:'foundation'});b.x=24;b.y=2;expect(()=>assertBuildingDestruction(a.adventure,base)).toThrow('支え');expect(()=>assertBuildingTerrain(a.adventure,{x:24,y:0,z:8},1)).toThrow('支持');
});
it('keeps legacy buildings shared and removes contents exactly once with bounded salvage',()=>{
 const {room}=fixture(),b=chest(room,{creator:undefined,salvage:{wood:2}});action(room,'a','remove',String(b.id));const drops=room.sim.adventure.state.resources.filter(n=>n.drop);expect(drops.reduce((sum,n)=>sum+(n.kind==='wood'?n.amount:0),0)).toBe(2);expect(drops.reduce((sum,n)=>sum+(n.kind==='stone'?n.amount:0),0)).toBe(7);expect(()=>action(room,'a','remove',String(b.id))).toThrow();expect(room.sim.adventure.state.resources).toHaveLength(drops.length);
});
it('projects private containers and preserves ownership in portable imports and authority checkpoints',()=>{
 const {room}=fixture(),b=chest(room);b.cooking=[{id:'boarMeat',time:30}];const own=chest(room,{id:801,x:24,creator:'a'});const exported=participantSave(room,'a',{portable:true});expect(exported.adventure!.buildings[0].contents).toEqual({});expect(exported.adventure!.buildings[0].cooking).toEqual([]);expect(exported.adventure!.buildings[0].creator).toBe('remote-host');expect(exported.adventure!.buildings[1].creator).toBe('host');expect(room.save().adventure!.buildings[0].contents).toEqual({stone:7});
 const invalid=room.sim.save();invalid.adventure!.buildings[0].shared='yes' as never;expect(()=>validateSave(invalid)).toThrow('権限');expect(own.creator).toBe('a');
});

it('rejects foreign terrain edits atomically and allows explicit sharing without duplicating materials',()=>{
 const {room,a}=fixture(),b=chest(room);const inventory={...a.adventure.state.inventory};expect(()=>room.action('a',{type:'action',tool:'dig',target:{x:22,y:0,z:8}})).toThrow('共有');expect(room.sim.world.edits).toHaveLength(0);expect(a.adventure.state.inventory).toEqual(inventory);action(room,'host','building-share',`${b.id}:on`);room.sim.tick+=8;expect(()=>room.action('a',{type:'action',tool:'dig',target:{x:22,y:0,z:8}})).not.toThrow();expect(room.sim.world.edits).toHaveLength(1);
});
it('hides unshared storage in recipient snapshots but leaves the canonical state and shared view intact',()=>{
 const {room}=fixture(),b=chest(room);expect(room.view('a').adventure.buildings[0].contents).toEqual({});expect(room.view('host').adventure.buildings[0].contents).toEqual({stone:7});expect(b.contents).toEqual({stone:7});action(room,'host','building-share',`${b.id}:on`);expect(room.view('a').adventure.buildings[0].contents).toEqual({stone:7});
});
it('permits foreign fuel deposits but protects cooked food and honey withdrawals',()=>{
 const {room,a}=fixture(),b=chest(room,{definition:'fire',contents:{},fuel:0});action(room,'a','fuel',String(b.id));expect(b.fuel).toBe(300);expect(a.adventure.state.inventory.wood).toBe(49);
 b.definition='cook';b.cooking=[{id:'boarMeat',time:30}];expect(()=>action(room,'a','cook',String(b.id)+'|')).toThrow('取出');expect(b.cooking).toHaveLength(1);
 b.definition='beehive';b.contents={honey:3};expect(()=>action(room,'a','interact',String(b.id))).toThrow('取出');expect(b.contents.honey).toBe(3);
});
it('rechecks changed ownership before append-only terrain undo',()=>{
 const {room}=fixture(),b=chest(room,{shared:true}),sim=room.sim,start=sim.terrainHistory.begin(),point={x:22,y:0,z:8};sim.world.apply({id:1,kind:'dig',position:point,radius:.4,material:'stone',tick:sim.tick});sim.terrainHistory.record('a',start,point,0);b.shared=false;
 expect(()=>action(room,'a','terrain-undo')).toThrow('共有');expect(sim.world.edits).toHaveLength(1);
});
it('keeps original host parts private when a guest exports a new single-player world',()=>{
 const {room}=fixture();room.sim.skybound.state.parts=[{id:10,kind:'block',material:'wood',position:{x:22,y:2,z:8},velocity:{x:0,y:0,z:0},rotation:0,mass:6,links:[],epoch:0,creator:'host',shared:false}];const exported=participantSave(room,'a',{portable:true});expect(exported.skybound!.parts[0].creator).toBe('remote-host');expect(participantSave(room,'a').skybound!.parts[0].creator).toBe('host');
});
