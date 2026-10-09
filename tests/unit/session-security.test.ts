import { expect, it } from 'vitest';
import { SessionAuthority } from '../../src/simulation/session';
import { GameSimulation } from '../../src/simulation/game-simulation';
import type { ClientMessage } from '../../src/simulation/protocol';
import { legacySimulation } from '../helpers/legacy';
import { newMeadows } from '../../src/game/meadows/state';
import { SkyboundPowers } from '../../src/game/skybound/powers';
import type { SkyContext } from '../../src/game/skybound/types';
import { WORLD } from '../../src/world/types';
import { keepBodiesOutsideProtected } from '../../src/game/skybound/protection';
const aim={x:1,y:0,z:0};
function roomFixture(){const save=legacySimulation().save();save.generator=4;save.adventure!.meadows=newMeadows();const room=new SessionAuthority(save);room.sim.adventure.state.resources=[];room.sim.adventure.state.enemies=[];const y=room.sim.world.heightAt(0,8);room.sim.world.density=p=>p.y-y;Object.assign(room.sim.player,{x:0,y,z:8});const a=room.join('a');Object.assign(a.player,{x:6,y,z:8});a.adventure.state.inventory.wood=30;a.adventure.state.inventory.stone=30;return {room,a,y};}
function powersFixture(){const powers=new SkyboundPowers(),context:SkyContext={tick:0,bounds:WORLD,player:{x:0,y:0,z:0},inventory:{wood:30},actors:[],solid:p=>p.y<0};powers.action('a','sky-part','block:wood',{x:2,y:2,z:0},aim,context);return {powers,context,part:powers.state.parts[0]};}
it('rejects prototype identifiers, reserved peers, sender spoofing and non-finite inputs without changing inventories',()=>{
 const {room,a}=roomFixture();for(const id of ['constructor','__proto__','toString']){expect(()=>room.join(id)).toThrow('Invalid peer');for(const action of ['spell','equip'] as const)expect(()=>room.action('a',{type:'game-action',action,id,aim})).toThrow('識別子');}
 const before=a.adventure.save(false);expect(()=>room.action('a',{type:'game-action',action:'drop',id:'wood:1',aim,actorId:'host'} as unknown as ClientMessage)).toThrow('フィールド');room.input('a',{x:NaN,z:0,jump:false},1);expect(a.sequence).toBe(0);expect(a.adventure.save(false)).toEqual(before);
});
it('projects vector and input fields, checks optional stale revisions, and allows ordinary edits outside protected cores',()=>{
 const {room,a,y}=roomFixture(),target={x:10,y,z:8,extra:{resumeKey:'not-state'}};
 room.action('a',{type:'action',tool:'dig',target});expect(room.sim.world.edits[0].position).toEqual({x:10,y,z:8});
 room.input('a',{x:0,z:0,jump:false,actorId:'host'} as never,1);expect(a.input).toEqual({x:0,z:0,jump:false});
 room.sim.tick+=8;expect(()=>room.action('a',{type:'action',tool:'dig',target,expectedRevision:0} as ClientMessage)).toThrow('同期');expect(room.sim.world.edits).toHaveLength(1);
 room.action('a',{type:'action',tool:'dig',target,expectedRevision:1} as ClientMessage);expect(room.sim.world.edits).toHaveLength(2);
});
it('protects spawn and dormant return positions while preserving unrestricted pouring and unlimited existing rocks',()=>{
 const {room,a,y}=roomFixture(),spawn={x:0,y,z:8};
 for(const tool of ['dig','add','rock'] as const)expect(()=>room.action('a',{type:'action',tool,target:spawn})).toThrow('保護');
 for(const action of ['build','landscape','spell'] as const)expect(()=>room.action('a',{type:'game-action',action,id:action==='build'?'foundation':action==='spell'?'quake':'raise',target:spawn,aim})).toThrow('保護');
 for(let i=0;i<3;i++)room.action('a',{type:'action',tool:'water',target:spawn});expect(room.sim.fluid.cells.size).toBeGreaterThan(0);
 const offline=room.join('offline');offline.adventure.state.spawn={x:30,y,z:8};room.leave('offline');Object.assign(a.player,{x:35,y,z:8});expect(()=>room.action('a',{type:'action',tool:'dig',target:{x:30,y,z:8}})).toThrow('保護');
 expect(()=>room.action('a',{type:'game-action',action:'sky-part',id:'block:wood',target:{x:30,y:y+1,z:8},aim})).toThrow('保護領域');
 room.sim.bodies.push(...Array.from({length:130},(_,i)=>({id:i+1,radius:.55,position:{x:0,y:y+1,z:8},velocity:{x:0,y:0,z:0},sleeping:true})));keepBodiesOutsideProtected(room.sim);expect(room.sim.bodies).toHaveLength(130);expect(room.sim.bodies.every(body=>Math.hypot(body.position.x,body.position.z-8)>1.25)).toBe(true);
});
it('lets an owner immediately release out of reach or behind walls, without allowing another player to release it',()=>{
 const {powers,context,part}=powersFixture();powers.action('a','sky-grab',String(part.id),undefined,aim,context);expect(()=>powers.action('b','sky-release',String(part.id),undefined,aim,context)).toThrow();expect(powers.leases.size).toBe(1);
 context.player.x=100;context.solid=()=>true;powers.action('a','sky-release',String(part.id),undefined,aim,context);expect(powers.leases.size).toBe(0);
});
it('does not renew a lease with repeatedly rejected moves',()=>{
 const {powers,context,part}=powersFixture();powers.action('a','sky-grab',String(part.id),undefined,aim,context);const expires=powers.leases.get(part.id)!.expiresTick;
 for(let tick=5;tick<expires;tick+=5){context.tick=tick;expect(()=>powers.action('a','sky-move',String(part.id),{x:2,y:-2,z:0},aim,context)).toThrow();expect(powers.leases.get(part.id)!.expiresTick).toBe(expires);}
 context.tick=expires;powers.step(1/30,context);expect(powers.leases.size).toBe(0);
});
it('keeps shared handling but gates other-player salvage behind the creator shared flag',()=>{
 const {powers,context,part}=powersFixture();powers.action('b','sky-grab',String(part.id),undefined,aim,context);expect(()=>powers.action('b','sky-salvage',String(part.id),undefined,aim,context)).toThrow('作成者');powers.action('b','sky-release',String(part.id),undefined,aim,context);
 expect(()=>powers.action('b','sky-share',`${part.id}:on`,undefined,aim,context)).toThrow('作成者');powers.action('a','sky-share',`${part.id}:on`,undefined,aim,context);powers.action('b','sky-grab',String(part.id),undefined,aim,context);expect(powers.action('b','sky-salvage',String(part.id),undefined,aim,context).drops![0].count).toBe(3);
});
it('makes fixed trial slabs immune to destructive elements and tolerates missing trial markers during simulation',()=>{
 const {powers,context}=powersFixture();const ids=powers.resetTrial(825007,[{kind:'slab',material:'stone',position:{x:4,y:2,z:0},links:[],anchored:true}],context),slab=powers.state.parts.find(p=>p.id===ids[0])!;
 for(const element of ['fire','frost','shock'] as const)powers.affect(slab.id,element,100,context);context.tick++;powers.step(1/30,context);expect(slab.integrity).toBe(100);expect(slab.frozen??0).toBe(0);expect(()=>powers.action('a','sky-grab',String(slab.id),undefined,aim,context)).toThrow('固定');
 const sim=new GameSimulation();sim.adventure.state.resources=[];expect(()=>{for(let i=0;i<3;i++)sim.step({x:0,z:0,jump:false});}).not.toThrow();
});
