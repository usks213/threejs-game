import { expect, it } from 'vitest';
import { SkyboundPowers } from '../../src/game/skybound/powers';
import { massProperties, RIGID_BUDGET } from '../../src/game/skybound/rigid';
import { orientation, rotate, increment } from '../../src/game/skybound/orientation';
import type { SkyContext, SkyPart } from '../../src/game/skybound/types';
import { WORLD } from '../../src/world/types';
const aim={x:0,y:0,z:1};
function fixture(){const powers=new SkyboundPowers(),context:SkyContext={tick:0,bounds:WORLD,player:{x:0,y:0,z:0},inventory:{wood:100},actors:[],solid:p=>p.y<0};powers.action('a','sky-part','block:wood',{x:2,y:4,z:0},aim,context);return{powers,context,part:powers.state.parts[0]};}
function step(powers:SkyboundPowers,context:SkyContext,count:number){for(let i=0;i<count;i++){context.tick++;powers.step(1/30,context);}}
it('migrates yaw-only saves to validated quaternion version 2 and preserves angular pose through save/load',()=>{
 const {powers,part}=fixture(),old=powers.save();old.version=1;delete old.parts[0].q;delete old.parts[0].angularVelocity;old.parts[0].rotation=Math.PI/2;
 const restored=new SkyboundPowers(old);expect(restored.save().version).toBe(2);expect(rotate({x:0,y:0,z:1},orientation(restored.state.parts[0])).x).toBeCloseTo(1);expect(restored.state.parts[0].angularVelocity).toEqual({x:0,y:0,z:0});
 const invalid=powers.save();invalid.parts[0].q={x:NaN,y:0,z:0,w:1};expect(()=>new SkyboundPowers(invalid)).toThrow('回転');
});
it('uses mass and a composite inertia tensor for off-center impulses, then integrates rotation with a fixed budget',()=>{
 const {powers,context,part}=fixture();expect(massProperties([part]).mass).toBe(6);powers.applyImpulse(part.id,{x:3,y:0,z:0},{x:part.position.x,y:part.position.y+1,z:part.position.z});expect(part.velocity.x).toBeCloseTo(.5);expect(part.angularVelocity!.z).toBeCloseTo(-3);
 step(powers,context,4);expect(Math.abs(part.q!.z)).toBeGreaterThan(.1);expect(Math.hypot(part.q!.x,part.q!.y,part.q!.z,part.q!.w)).toBeCloseTo(1,9);expect(powers.snapshot('a').physics!.contacts).toBeLessThanOrEqual(RIGID_BUDGET.substeps*RIGID_BUDGET.contacts);
 const reloaded=new SkyboundPowers(powers.save());expect(reloaded.state.parts[0].q).toEqual(part.q);
});
it('recalls quaternion motion without restoring integrity or consuming any item',()=>{
 const {powers,context,part}=fixture();powers.applyImpulse(part.id,{x:2,y:0,z:0},{x:2,y:5,z:0});step(powers,context,10);const turned=part.q!.z;part.integrity=70;
 powers.action('a','sky-recall',String(part.id),undefined,aim,context);step(powers,context,10);expect(Math.abs(part.q!.z)).toBeLessThan(Math.abs(turned));expect(part.integrity).toBe(70);expect(part.angularVelocity).toEqual({x:0,y:0,z:0});
});
it('sleeps far assemblies without growing history, continues battery usage, and wakes on approach or a nearby edit',()=>{
 const {powers,context,part}=fixture();part.links=[2];powers.state.parts.push({id:2,kind:'battery',material:'wood',mass:8,position:{x:3,y:4,z:0},velocity:{x:0,y:0,z:0},rotation:0,links:[1,3],epoch:0,energy:10},{id:3,kind:'lamp',material:'wood',mass:4,position:{x:3.5,y:4,z:0},velocity:{x:0,y:0,z:0},rotation:0,links:[2],epoch:0,enabled:true});context.actors=[{id:'far',position:{x:100,y:0,z:0}}];const before={...part.position};step(powers,context,150);expect(part.sleeping).toBe(true);expect(part.position).toEqual(before);expect(powers.snapshot('a').physics!.historyFrames).toBe(0);expect(powers.state.parts.find(p=>p.id===2)!.energy).toBeCloseTo(8.75,8);
 context.actors[0].position.x=2;step(powers,context,1);expect(part.sleeping).toBe(false);expect(part.position.y).toBeLessThan(before.y);
 part.sleeping=true;powers.wakeAround({x:2,y:4,z:0},1);expect(part.sleeping).toBe(false);
});
it('keeps anchored trial fixtures rotationally fixed and allows an elevated lease-owned upright recovery',()=>{
 const {powers,context,part}=fixture();part.q=increment({x:0,y:0,z:1},Math.PI);part.rotation=0;
 powers.action('a','sky-grab',String(part.id),undefined,aim,context);powers.action('a','sky-upright',String(part.id),undefined,aim,context);expect(rotate({x:0,y:1,z:0},orientation(part)).y).toBeCloseTo(1);
 powers.action('a','sky-release',String(part.id),undefined,aim,context);
 const ids=powers.resetTrial(825007,[{kind:'slab',material:'stone',position:{x:4,y:2,z:0},anchored:true,links:[]}],context),anchor=powers.state.parts.find(p=>p.id===ids[0])!;powers.applyImpulse(anchor.id,{x:100,y:50,z:0});step(powers,context,10);expect(anchor.position).toEqual({x:4,y:2,z:0});expect(anchor.angularVelocity).toEqual({x:0,y:0,z:0});
});
it('rejects upright recovery through geometry and freezes wet parts only in intentional cold',()=>{
 const {powers,context,part}=fixture();part.q=increment({x:0,y:0,z:1},Math.PI);powers.action('a','sky-grab',String(part.id),undefined,aim,context);const before={...part.q};context.solid=p=>p.y<0||p.y>4.2;expect(()=>powers.action('a','sky-upright',String(part.id),undefined,aim,context)).toThrow();expect(part.q).toEqual(before);powers.action('a','sky-release',String(part.id),undefined,aim,context);
 context.solid=p=>p.y<0;context.immersion=()=>.5;context.temperature=()=>-12;step(powers,context,1);expect(part.frozen).toBeGreaterThan(0);context.temperature=()=>48;context.immersion=()=>0;part.wet=0;step(powers,context,120);expect(part.burning??0).toBe(0);
});
it('puts settled near bodies to sleep and wakes them with an impulse without duplicate static history',()=>{
 const {powers,context,part}=fixture();context.actors=[{id:'near',position:{x:0,y:0,z:0}}];step(powers,context,300);expect(part.sleeping,JSON.stringify(part)).toBe(true);const count=powers.snapshot('a').physics!.historyFrames;step(powers,context,150);expect(powers.snapshot('a').physics!.historyFrames).toBeLessThanOrEqual(count);powers.applyImpulse(part.id,{x:2,y:1,z:0});expect(part.sleeping).toBe(false);
});
it('releases both seats safely when their assembly overturns, then permits lease-owned upright recovery',()=>{
 const parts:SkyPart[]=[{id:1,kind:'slab',material:'wood',mass:8,position:{x:3,y:2,z:0},velocity:{x:0,y:0,z:0},rotation:0,links:[2,3],epoch:0},{id:2,kind:'seat',material:'wood',mass:4,position:{x:2.5,y:2.375,z:0},velocity:{x:0,y:0,z:0},rotation:0,links:[1],epoch:0},{id:3,kind:'seat',material:'wood',mass:4,position:{x:3.5,y:2.375,z:0},velocity:{x:0,y:0,z:0},rotation:0,links:[1],epoch:0}];
 const powers=new SkyboundPowers({version:1,parts,blueprints:[],fusions:{}}),context:SkyContext={tick:0,bounds:WORLD,player:{x:0,y:0,z:0},inventory:{},actors:[],solid:p=>p.y<0};
 powers.action('a','sky-ride','2',undefined,aim,context);powers.action('b','sky-ride','3',undefined,aim,context);expect(()=>powers.action('a','sky-upright','1',undefined,aim,context)).toThrow('搭乗中');
 const a={x:0,y:0,z:0,vy:0,heading:0,grounded:true},b={...a};powers.drive('a',{x:0,z:0},a);powers.drive('b',{x:0,z:0},b);context.actors=[{id:'a',position:a},{id:'b',position:b}];powers.applyImpulse(1,{x:0,y:30,z:0},{x:5,y:2,z:0});step(powers,context,45);
 expect(powers.snapshot('a').riding).toBeUndefined();expect(powers.snapshot('b').riding).toBeUndefined();expect([a,b].every(p=>[p.x,p.y,p.z].every(Number.isFinite))).toBe(true);
 Object.assign(a,{x:0,y:0,z:-3});Object.assign(b,{x:0,y:0,z:-4});const root=powers.state.parts[0];powers.action('a','sky-grab','1',undefined,aim,context);powers.action('a','sky-move','1',{x:root.position.x,y:4,z:root.position.z},aim,context);powers.action('a','sky-upright','1',undefined,aim,context);expect(rotate({x:0,y:1,z:0},orientation(root)).y).toBeCloseTo(1,6);
});
