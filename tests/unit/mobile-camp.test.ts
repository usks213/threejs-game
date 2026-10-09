import {describe,expect,it} from 'vitest';
import {SkyboundPowers} from '../../src/game/skybound/powers';
import {CAMP_LIMITS,campStorable,cargoMass} from '../../src/game/skybound/camp';
import {validateSkybound} from '../../src/game/skybound/validation';
import {MATERIAL_MASS,PART_COST,SKY_LIMITS} from '../../src/game/skybound/types';
import type {SkyContext,SkyPart,SkyPartKind} from '../../src/game/skybound/types';
import {assemblyBuoyancy} from '../../src/game/skybound/buoyancy';
import {massProperties} from '../../src/game/skybound/rigid';
import {increment,yawQuaternion} from '../../src/game/skybound/orientation';
import {WORLD} from '../../src/world/types';
const aim={x:0,y:0,z:1};
function fixture(){
 const definitions:{kind:SkyPartKind;position:{x:number;y:number;z:number}}[]=[
  {kind:'slab',position:{x:3,y:.135,z:0}},
  {kind:'bed',position:{x:2.5,y:.46,z:0}},
  {kind:'storage',position:{x:3.6,y:.66,z:0}},
 ];
 const parts:SkyPart[]=definitions.map((p,i)=>({...p,id:i+1,material:'wood',mass:MATERIAL_MASS.wood*PART_COST[p.kind],velocity:{x:0,y:0,z:0},rotation:0,q:yawQuaternion(0),angularVelocity:{x:0,y:0,z:0},links:i?[1]:[2,3],epoch:0,creator:'a',shared:false}));
 const powers=new SkyboundPowers({version:2,parts,blueprints:[],fusions:{}});
 const context:SkyContext={tick:0,bounds:WORLD,player:{x:3,y:0,z:-2},inventory:{wood:100,resin:10,berry:30,coins:400,club:1},actors:[],solid:p=>p.y<0,canRest:true};
 return {powers,context,bed:powers.state.parts[1],storage:powers.state.parts[2]};
}
const act=(p:SkyboundPowers,c:SkyContext,action:Parameters<SkyboundPowers['action']>[1],id:string,owner='a')=>p.action(owner,action,id,undefined,aim,c);
const step=(p:SkyboundPowers,c:SkyContext,n=1)=>{for(let i=0;i<n;i++){c.tick++;p.step(1/30,c);}};

describe('mobile camp cargo transactions',()=>{
 it('is cargo on a linked rigid body, with private views and atomic inventory/mass changes',()=>{
  const {powers,context,storage}=fixture(),dry=massProperties(powers.state.parts).mass;
  act(powers,context,'sky-store','3:wood:10');
  expect(context.inventory.wood).toBe(90);expect(powers.state.storage).toEqual({'3':{wood:10}});
  expect(storage.cargoMass).toBe(20);expect(massProperties(powers.state.parts).mass).toBe(dry+20);
  expect(powers.state.parts.every(p=>p.epoch===1)).toBe(true);
  expect(powers.snapshot('a').storage).toEqual([{part:3,items:{wood:10}}]);expect(powers.snapshot('b').storage).toEqual([]);
  expect(JSON.stringify(powers.snapshot('b'))).not.toContain('"wood":10');
  act(powers,context,'sky-take','3:wood:4');expect(context.inventory.wood).toBe(94);expect(storage.cargoMass).toBe(12);
  expect(powers.state.storage?.[3]).toEqual({wood:6});
  const saved=powers.save();saved.storage![3].wood=999;expect(powers.state.storage?.[3].wood).toBe(6);
 });
 it('uses root storage permissions independently, without sharing a private bed or unrelated inventory',()=>{
  const {powers,context,storage,bed}=fixture();act(powers,context,'sky-store','3:wood:10');
  for(const action of ['sky-store','sky-take'] as const)expect(()=>act(powers,context,action,'3:wood:1','b')).toThrow('作成者');
  act(powers,context,'sky-share','3:on');const guest={...context,inventory:{wood:1}};
  act(powers,guest,'sky-take','3:wood:3','b');expect(guest.inventory.wood).toBe(4);expect(context.inventory.wood).toBe(90);
  expect(storage.shared).toBe(true);expect(bed.shared).toBe(false);
  expect(()=>act(powers,guest,'sky-grab','1','b')).toThrow('私物');
  expect(powers.snapshot('b').storage?.[0].items).toEqual({wood:7});
  act(powers,context,'sky-share','3:off');expect(powers.snapshot('b').storage).toEqual([]);
  expect(()=>act(powers,guest,'sky-take','3:wood:1','b')).toThrow('作成者');
 });
 it('preflights cargo weight, bounded units and personal capacity without partial writes',()=>{
  const {powers,context}=fixture();act(powers,context,'sky-store','3:wood:40');const saved=powers.save(),inventory={...context.inventory};
  expect(()=>act(powers,context,'sky-store','3:wood:1')).toThrow('容量');expect(powers.save()).toEqual(saved);expect(context.inventory).toEqual(inventory);
  context.canReceiveItem=()=>false;expect(()=>act(powers,context,'sky-take','3:wood:1')).toThrow('空き');expect(powers.save()).toEqual(saved);expect(context.inventory).toEqual(inventory);
  const fresh=fixture();act(fresh.powers,fresh.context,'sky-store','3:coins:400');fresh.context.inventory.coins=1;
  expect(()=>act(fresh.powers,fresh.context,'sky-store','3:coins:1')).toThrow('容量');expect(fresh.context.inventory.coins).toBe(1);
  expect(fresh.powers.state.storage?.[3]).toEqual({coins:400});
 });
 it('bounds distinct item kinds and occupied stacks before committing either side',()=>{
  const {powers,context}=fixture();context.inventory={feathers:51,berry:1,resin:1,stone:1,iron:1,copper:1,crystal:1,aether:1,fang:1};
  act(powers,context,'sky-store','3:feathers:51');for(const id of ['berry','resin','stone','iron','copper','crystal'])act(powers,context,'sky-store',`3:${id}:1`);
  const saved=powers.save(),inventory={...context.inventory};expect(()=>act(powers,context,'sky-store','3:aether:1')).toThrow('容量');expect(powers.save()).toEqual(saved);expect(context.inventory).toEqual(inventory);
  act(powers,context,'sky-take','3:feathers:1');act(powers,context,'sky-store','3:aether:1');expect(Object.keys(powers.state.storage![3])).toHaveLength(8);
  expect(()=>act(powers,context,'sky-store','3:fang:1')).toThrow('容量');expect(context.inventory.fang).toBe(1);
 });
 it('rejects malformed quantities, prototype names, missing items, equipment and extreme epochs',()=>{
  const {powers,context,storage}=fixture(),before=powers.save(),inventory={...context.inventory};
  for(const id of ['3:wood:0','3:wood:-1','3:wood:1.5','3:wood:NaN','3:wood:401','3:wood:1:extra','3:__proto__:1','3:constructor:1','3:club:1','3:glider:1','3:iron:1'])expect(()=>act(powers,context,'sky-store',id),id).toThrow();
  expect(powers.save()).toEqual(before);expect(context.inventory).toEqual(inventory);
  storage.epoch=Number.MAX_SAFE_INTEGER;expect(()=>act(powers,context,'sky-store','3:wood:1')).toThrow('履歴');expect(context.inventory).toEqual(inventory);
  expect(campStorable('club')).toBe(true);expect(campStorable('linenHat')).toBe(true);expect(campStorable('berry')).toBe(true);
 });
 it('blocks remote, obscured and lease-conflicting transfers',()=>{
  const {powers,context}=fixture();context.player={x:0,y:0,z:-4};expect(()=>act(powers,context,'sky-store','3:wood:1')).toThrow('3.5');
  context.player={x:3,y:0,z:-2};context.solid=p=>p.y<0||p.z>-.9&&p.z<-.5;expect(()=>act(powers,context,'sky-store','3:wood:1')).toThrow('遮られ');
  context.solid=p=>p.y<0;act(powers,context,'sky-share','2:on');act(powers,context,'sky-share','3:on');act(powers,context,'sky-grab','1','b');
  expect(()=>act(powers,context,'sky-store','3:wood:1')).toThrow('別の冒険者');expect(context.inventory.wood).toBe(100);
 });
 it('moves every loaded camp component as one authoritative assembly, and history never rewinds cargo',()=>{
  const {powers,context}=fixture();act(powers,context,'sky-store','3:berry:8');act(powers,context,'sky-grab','1');
  const before=powers.state.parts.map(p=>({...p.position}));powers.action('a','sky-move','1',{x:3,y:1.135,z:1},aim,context);
  for(let i=0;i<before.length;i++){expect(powers.state.parts[i].position.y).toBeCloseTo(before[i].y+.99,2);expect(powers.state.parts[i].position.z).toBeCloseTo(before[i].z+1,2);}
  expect(powers.state.storage?.[3]).toEqual({berry:8});powers.release('a');step(powers,context,4);
  act(powers,context,'sky-take','3:berry:2');expect(()=>act(powers,context,'sky-recall','1')).toThrow('軌跡');expect(powers.state.storage?.[3]).toEqual({berry:6});
 });
 it('does not create free lift when cargo increases gravity and inertia',()=>{
  const {powers,context}=fixture(),water={...context,immersion:()=>1},dry=assemblyBuoyancy(powers.state.parts,water),before=massProperties(powers.state.parts);
  act(powers,context,'sky-store','3:wood:20');const wet=assemblyBuoyancy(powers.state.parts,water),after=massProperties(powers.state.parts);
  expect(wet.force.y).toBeCloseTo(dry.force.y,10);expect(after.mass).toBe(before.mass+40);expect(after.center.x).toBeGreaterThan(before.center.x);
  powers.applyImpulse(1,{x:10,y:0,z:0});expect(powers.state.parts[0].velocity.x).toBeCloseTo(10/after.mass,10);
 });
 it('does not clone cargo or camp bindings into rebuilt blueprints',()=>{
  const {powers,context}=fixture();act(powers,context,'sky-store','3:berry:9');act(powers,context,'sky-camp','2');act(powers,context,'sky-blueprint','1:移動拠点');
  const id=powers.state.blueprints[0].id;powers.action('a','sky-rebuild',String(id),{x:3,y:2,z:4},aim,context);
  const storage=powers.state.parts.filter(p=>p.kind==='storage');expect(storage).toHaveLength(2);expect(storage[1].cargoMass??0).toBe(0);
  expect(powers.state.storage).toEqual({'3':{berry:9}});expect(powers.state.camps).toEqual({a:2});
 });
});

describe('mobile camp recovery and privacy',()=>{
 it('preserves cargo through restart, denies private snapshot access and validates replica mass without contents',()=>{
  const {powers,context}=fixture();act(powers,context,'sky-store','3:resin:7');act(powers,context,'sky-camp','2');
  const restored=new SkyboundPowers(powers.save());expect(restored.save()).toEqual(powers.save());expect(restored.snapshot('a').camp).toEqual({bed:2});expect(restored.snapshot('b').camp).toBeUndefined();
  const replica=new SkyboundPowers(powers.save());replica.applyReplica(powers.snapshot('b'));expect(replica.state.storage).toBeUndefined();expect(replica.state.camps).toBeUndefined();expect(replica.state.parts[2].mass).toBe(10.1);
  expect(()=>new SkyboundPowers(replica.save())).toThrow('重量');
 });
 it('rejects orphaned/unbounded/forged storage or camp data but preserves old saves',()=>{
  const {powers,context}=fixture();act(powers,context,'sky-store','3:wood:2');
  const change=(fn:(save:ReturnType<SkyboundPowers['save']>)=>void)=>{const save=powers.save();fn(save);expect(()=>validateSkybound(save)).toThrow();};
  change(s=>s.storage![99]={wood:1});change(s=>s.storage![1]={wood:1});change(s=>s.storage![3].wood=3);change(s=>s.parts[2].cargoMass=NaN);
  change(s=>s.storage![3]={club:1});change(s=>s.storage![3]={wood:0});change(s=>s.storage![3]={coins:401});change(s=>s.parts[2].creator=undefined);
  change(s=>s.camps={a:3});change(s=>s.camps=Object.fromEntries(Array.from({length:CAMP_LIMITS.players+1},(_,i)=>['p'+i,2])));
  change(s=>s.parts[2].wrecked=true);
  expect(validateSkybound({version:1,parts:[],blueprints:[],fusions:{}})).toMatchObject({version:2,parts:[]});
 });
 it('retains one protected storage wreck after destruction, then removes it only after complete withdrawal',()=>{
  const {powers,context,storage}=fixture();act(powers,context,'sky-store','3:berry:12');act(powers,context,'sky-camp','2');storage.integrity=0;step(powers,context);
  const wreck=powers.state.parts.find(p=>p.id===3)!;expect(wreck.wrecked).toBe(true);expect(wreck.links).toEqual([]);expect(wreck.integrity).toBe(0);
  expect(powers.state.parts[0].links).toEqual([2]);expect(powers.state.storage?.[3]).toEqual({berry:12});expect(powers.campRespawn('a',context)).toBeUndefined();
  const epoch=wreck.epoch;step(powers,context,3);expect(wreck.epoch).toBe(epoch);expect(powers.state.parts.filter(p=>p.id===3)).toHaveLength(1);
  expect(()=>act(powers,context,'sky-store','3:berry:1')).toThrow('壊れた');expect(()=>act(powers,context,'sky-take','3:berry:1','b')).toThrow('作成者');
  const restored=new SkyboundPowers(powers.save());act(restored,context,'sky-take','3:berry:12');expect(context.inventory.berry).toBe(30);step(restored,context);expect(restored.state.parts.find(p=>p.id===3)).toBeUndefined();expect(restored.state.storage?.[3]).toBeUndefined();
 });
 it('retains zero-weight cargo in a wreck and never reclaims it merely because cargoMass is zero',()=>{
  const {powers,context,storage}=fixture();act(powers,context,'sky-store','3:coins:100');expect(storage.cargoMass).toBe(0);storage.integrity=0;step(powers,context,3);
  expect(powers.state.parts.find(p=>p.id===3)?.wrecked).toBe(true);expect(powers.state.storage?.[3]).toEqual({coins:100});expect(new SkyboundPowers(powers.save()).state.storage?.[3]).toEqual({coins:100});
  act(powers,context,'sky-take','3:coins:100');step(powers,context);expect(powers.state.parts.some(p=>p.id===3)).toBe(false);expect(context.inventory.coins).toBe(400);
 });
 it('refuses to salvage a loaded container and removes dead bed bindings without refund duplication',()=>{
  const {powers,context,bed}=fixture();act(powers,context,'sky-store','3:berry:2');act(powers,context,'sky-camp','2');act(powers,context,'sky-grab','3');
  expect(()=>act(powers,context,'sky-salvage','3')).toThrow('空に');expect(powers.state.storage?.[3]).toEqual({berry:2});powers.release('a');
  bed.integrity=0;step(powers,context);expect(powers.state.camps).toEqual({});expect(powers.state.parts.some(p=>p.id===2)).toBe(false);
  act(powers,context,'sky-take','3:berry:2');act(powers,context,'sky-grab','3');const result=act(powers,context,'sky-salvage','3');expect(result.drops).toHaveLength(1);expect(result.drops?.[0].count).toBe(4);expect(powers.state.storage?.[3]).toBeUndefined();
 });
 it('still enforces the same part budget before spending for mobile furniture',()=>{
  const powers=new SkyboundPowers(),context:SkyContext={tick:0,bounds:WORLD,player:{x:0,y:0,z:0},inventory:{wood:1000},actors:[],solid:()=>false};
  powers.state.parts=Array.from({length:SKY_LIMITS.parts},(_,i)=>({id:i+1,kind:'block',material:'wood',mass:6,position:{x:i,y:3,z:20},velocity:{x:0,y:0,z:0},rotation:0,epoch:0,links:[]}));
  expect(()=>powers.action('a','sky-part','storage:wood',{x:2,y:2,z:0},aim,context)).toThrow('64');expect(context.inventory.wood).toBe(1000);
 });
});

describe('parked mobile checkpoint safety',()=>{
 it('registers a real assembly and resolves its current bed transform, with no inventory or time effects',()=>{
  const {powers,context}=fixture(),inventory={...context.inventory};act(powers,context,'sky-camp','2');expect(powers.campRespawn('a',context)).toEqual({x:2.5,y:.73,z:0});
  for(const p of powers.state.parts){p.position.x+=10;p.position.z-=6;}expect(powers.campRespawn('a',context)).toEqual({x:12.5,y:.73,z:-6});
  expect(context.inventory).toEqual(inventory);expect(context.tick).toBe(0);
  powers.release('a');expect(powers.state.camps).toEqual({a:2});act(powers,context,'sky-camp-clear','');expect(powers.campRespawn('a',context)).toBeUndefined();
 });
 it('will not bind static boxes near a bed, a private bed or a camp currently controlled by someone',()=>{
  const {powers,context,bed}=fixture();expect(()=>act(powers,context,'sky-camp','2','b')).toThrow();expect(powers.state.camps).toBeUndefined();
  bed.links=[];powers.state.parts[0].links=[3];expect(()=>act(powers,context,'sky-camp','2')).toThrow('接着');
  bed.links=[1];powers.state.parts[0].links=[2,3];act(powers,context,'sky-grab','1');expect(()=>act(powers,context,'sky-camp','2')).toThrow('安全');
 });
 it('checks angular motion, tilt, water, hazard, protected hotspots, active devices, actors and headroom on every respawn',()=>{
  const modifiers:((v:ReturnType<typeof fixture>)=>void)[]=[
   ({bed})=>bed.velocity.x=.21,
   ({bed})=>bed.velocity.y=-.51,
   ({bed})=>bed.angularVelocity={x:0,y:.11,z:0},
   ({bed})=>bed.q=increment({x:1,y:0,z:0},.6),
   ({context})=>context.immersion=()=>.1,
   ({context})=>context.unsafeCamp=()=>true,
   ({context})=>context.protected=()=>true,
   ({context})=>context.occupied=p=>p.y>1,
   ({context})=>context.solid=p=>p.y<0||p.y>1.5,
   ({context})=>context.solid=p=>p.y<0||p.x>2.55&&p.x<2.675&&p.y>.8,
   ({powers})=>powers.state.parts.push({id:4,kind:'beam',material:'wood',mass:4,position:{x:3.43,y:1.5,z:0},q:increment({x:0,y:0,z:1},.7),velocity:{x:0,y:0,z:0},rotation:0,epoch:0,links:[]}),
   ({context})=>context.actors=[{id:'b',position:{x:2.5,y:.73,z:0}}],
   ({powers})=>powers.state.parts.forEach(p=>p.position.y+=5),
   ({bed})=>bed.burning=1,
   ({powers})=>powers.state.parts[2].integrity=0,
   ({powers})=>{powers.state.parts.push({id:4,kind:'thruster',material:'wood',mass:12,position:{x:3,y:.7,z:2},velocity:{x:0,y:0,z:0},rotation:0,epoch:0,links:[1],enabled:true});powers.state.parts[0].links.push(4);},
   ({powers,context})=>act(powers,context,'sky-grab','1'),
  ];
  for(const modify of modifiers){const v=fixture();act(v.powers,v.context,'sky-camp','2');modify(v);expect(v.powers.campRespawn('a',v.context),String(modify)).toBeUndefined();}
 });
 it('only permits shared registration while access remains and rejects busy players without healing',()=>{
  const {powers,context}=fixture();context.canRest=false;expect(()=>act(powers,context,'sky-camp','2')).toThrow('安全');context.canRest=true;
  act(powers,context,'sky-share','2:on');act(powers,context,'sky-share','3:on');act(powers,context,'sky-camp','2','b');
  expect(powers.campRespawn('b',context)).toEqual({x:2.5,y:.73,z:0});act(powers,context,'sky-share','2:off');expect(powers.campRespawn('b',context)).toBeUndefined();expect(powers.snapshot('a').camp).toBeUndefined();
 });
});

describe('mobile camp assemblies in motion',()=>{
 it('carries two actual seated players and loaded storage on the same powered assembly',()=>{
  const {powers,context}=fixture();
  const additions:{kind:SkyPartKind;position:{x:number;y:number;z:number};links:number[];energy?:number;enabled?:boolean}[]=[
   {kind:'slab',position:{x:3,y:.135,z:2},links:[1,5,6,7,8]},
   {kind:'seat',position:{x:2.5,y:.51,z:2},links:[4]},
   {kind:'seat',position:{x:3.5,y:.51,z:2},links:[4]},
   {kind:'thruster',position:{x:3,y:.56,z:3.5},links:[4],enabled:true},
   {kind:'battery',position:{x:4.3,y:.56,z:2},links:[4],energy:40},
  ];
  powers.state.parts[0].links.push(4);
  powers.state.parts.push(...additions.map((p,i):SkyPart=>({...p,id:i+4,material:'wood',mass:MATERIAL_MASS.wood*PART_COST[p.kind],velocity:{x:0,y:0,z:0},rotation:0,epoch:0,creator:'a',shared:true})));
  for(const p of powers.state.parts){p.position.y+=20;p.shared=true;}
  Object.assign(context.player,{x:3,y:20,z:-2});act(powers,context,'sky-store','3:wood:10');
  act(powers,context,'sky-ride','5');act(powers,context,'sky-ride','6','b');
  const a={x:0,y:0,z:0,heading:0,vy:0,grounded:true},b={...a};context.actors=[{id:'a',position:a},{id:'b',position:b}];
  powers.drive('a',{x:0,z:-1},a);powers.drive('b',{x:0,z:0},b);
  const before=powers.state.parts.map(p=>({...p.position}));step(powers,context,30);
  expect(powers.state.parts[0].position.z).toBeGreaterThan(before[0].z+.2);
  expect(powers.state.parts.find(p=>p.id===8)?.energy).toBeCloseTo(37,8);
  expect(powers.snapshot('a').riding).toEqual({seat:5,driver:true});expect(powers.snapshot('b').riding).toEqual({seat:6,driver:false});
  expect(powers.state.storage?.[3]).toEqual({wood:10});expect(powers.state.parts[2].cargoMass).toBe(20);
  const distance=(x:{x:number;y:number;z:number},y:{x:number;y:number;z:number})=>Math.hypot(x.x-y.x,x.y-y.y,x.z-y.z);
  for(let i=1;i<before.length;i++)expect(distance(powers.state.parts[0].position,powers.state.parts[i].position)).toBeCloseTo(distance(before[0],before[i]),8);
  expect(distance(a,b)).toBeCloseTo(1,8);expect(a.z).toBeGreaterThan(2.2);expect(powers.state.parts.length).toBeLessThanOrEqual(SKY_LIMITS.assembly);
 });
 it('prevents locking another creator’s vehicle by gluing on a private camp component',()=>{
  const powers=new SkyboundPowers(),context:SkyContext={tick:0,bounds:WORLD,player:{x:0,y:0,z:0},inventory:{wood:30},actors:[],solid:()=>false};
  powers.action('a','sky-part','slab:wood',{x:2,y:2,z:0},aim,context);act(powers,context,'sky-share','1:on');
  powers.action('b','sky-part','storage:wood',{x:3.5,y:2,z:0},aim,context);act(powers,context,'sky-grab','2','b');
  expect(()=>act(powers,context,'sky-glue','2:1','b')).toThrow('先に共有');expect(powers.state.parts[0].links).toEqual([]);expect(powers.state.parts[1].links).toEqual([]);
  act(powers,context,'sky-share','2:on','b');act(powers,context,'sky-glue','2:1','b');powers.release('b');expect(()=>act(powers,context,'sky-share','2:off','b')).toThrow('接着を外して');expect(powers.state.parts[1].shared).toBe(true);expect(()=>act(powers,context,'sky-grab','1')).not.toThrow();
 });
 it('does not refill storage or re-create checkpoint data while recalling object poses',()=>{
  const {powers,context}=fixture();for(const p of powers.state.parts)p.position.y+=3;context.player.y+=3;
  act(powers,context,'sky-store','3:berry:10');step(powers,context,12);const falling=powers.state.parts[2].position.y;
  act(powers,context,'sky-recall','3');step(powers,context,5);expect(powers.state.parts[2].position.y).toBeGreaterThan(falling);
  expect(powers.state.storage?.[3]).toEqual({berry:10});expect(context.inventory.berry).toBe(20);expect(powers.state.camps).toBeUndefined();
 });
});
