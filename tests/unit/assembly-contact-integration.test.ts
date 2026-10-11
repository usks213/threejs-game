import { expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { ASSEMBLY_CONTACT_BUDGET, skyPartsOverlap } from '../../src/game/skybound/assembly-contacts';
import { RIGID_BUDGET } from '../../src/game/skybound/rigid';
import { SkyboundPowers } from '../../src/game/skybound/powers';
import { global, orientation, rotate } from '../../src/game/skybound/orientation';
import { PART_HALF } from '../../src/game/skybound/types';
import type { SkyContext, SkyPart } from '../../src/game/skybound/types';
import { WORLD } from '../../src/world/types';
const aim={x:0,y:0,z:1};
function fixture(){
  const parts:SkyPart[]=[{id:1,kind:'block',material:'wood',mass:6,position:{x:-.51,y:4,z:0},velocity:{x:3,y:0,z:0},rotation:0,links:[],epoch:0,creator:'owner'},{id:2,kind:'block',material:'wood',mass:6,position:{x:.51,y:4,z:0},velocity:{x:0,y:0,z:0},rotation:0,links:[],epoch:0,creator:'owner'}];
  const powers=new SkyboundPowers({version:1,parts,blueprints:[],fusions:{}});
  const context:SkyContext={tick:0,bounds:WORLD,player:{x:0,y:0,z:0},inventory:{},actors:[],solid:p=>p.y<0};
  return{powers,context,a:powers.state.parts[0],b:powers.state.parts[1]};
}
function step(powers:SkyboundPowers,context:SkyContext){context.tick++;powers.step(1/30,context);}
function maxX(part:SkyPart){const h=PART_HALF[part.kind];let max=-Infinity;for(const x of[-h.x,h.x])for(const y of[-h.y,h.y])for(const z of[-h.z,h.z])max=Math.max(max,global({x,y,z},part).x);return max;}

it('integrates conservative dynamic transfer before static guards and records it separately in authority metrics',()=>{
  const {powers,context,a,b}=fixture(),before=b.position.x;
  step(powers,context);
  expect(powers.snapshot('owner').physics!.dynamicContacts).toBeGreaterThan(0);
  expect(b.velocity.x).toBeGreaterThan(.1);expect(b.position.x).toBeGreaterThan(before);
  for(let tick=0;tick<9;tick++)step(powers,context);
  expect(b.position.x).toBeGreaterThan(before+.1);
  expect(b.position.x-a.position.x).toBeGreaterThanOrEqual(.98);
  expect(powers.state.parts.every(p=>[p.position.x,p.position.y,p.position.z,p.velocity.x,p.velocity.y,p.velocity.z].every(Number.isFinite))).toBe(true);
  // Deliberately no whole-world momentum assertion: sequential static guards and drag dissipate momentum.
});

it('keeps terrain, occupied-building and protected-area guards when a neighboring body receives momentum',()=>{
  for(const wall of['solid','occupied','protected']as const){
    const {powers,context,b}=fixture();
    if(wall==='solid')context.solid=p=>p.y<0||p.x>1.05;
    else context[wall]=p=>p.x>1.05;
    for(let tick=0;tick<10;tick++){step(powers,context);expect(maxX(b),`${wall} tick=${tick}`).toBeLessThanOrEqual(1.05+1e-8);}
  }
});

it('does not push the receiving body through a nearby actor capsule',()=>{
  const {powers,context,b}=fixture();context.actors=[{id:'bystander',position:{x:1.35,y:3.5,z:0}}];
  for(let tick=0;tick<10;tick++){step(powers,context);expect(maxX(b)).toBeLessThanOrEqual(1.05+1e-8);}
  expect(context.actors[0].position).toEqual({x:1.35,y:3.5,z:0});
});

it('does not transfer to a lease, tow or occupied seat, or a far-sleeping group',()=>{
  for(const status of['lease','tow','rider','far']as const){
    const {powers,context,a,b}=fixture();
    if(status==='lease')powers.action('owner','sky-grab','2',undefined,aim,context);
    if(status==='tow')powers.setTow('owner',2);
    if(status==='rider'){
      b.kind='seat';b.mass=4;a.position.x=-.41;
      powers.action('owner','sky-ride','2',undefined,aim,context);
      const rider={x:0,y:0,z:0,heading:0,vy:0,grounded:true};powers.drive('owner',{x:0,z:0},rider);context.actors=[{id:'owner',position:rider}];
    }
    if(status==='far')context.actors=[{id:'far',position:{x:100,y:0,z:0}}];
    const beforeX=b.position.x;step(powers,context);
    expect(powers.snapshot('owner').physics!.dynamicContacts).toBe(0);expect(b.velocity.x).toBe(0);expect(b.position.x,status).toBe(beforeX);
    if(status==='rider'){expect(powers.isRiding('owner')).toBe(true);expect(rotate({x:0,y:1,z:0},orientation(b)).y).toBeCloseTo(1);}
  }
});

it('keeps recall exclusive and never adds collision movement or restores unrelated fields',()=>{
  const {powers,context,a,b}=fixture();a.position.x=-5;a.velocity.x=0;
  for(let tick=0;tick<4;tick++)step(powers,context);
  powers.action('owner','sky-recall','2',undefined,aim,context);
  a.position={x:b.position.x-1.02,y:b.position.y,z:0};a.velocity={x:3,y:0,z:0};b.integrity=70;
  const beforeX=b.position.x;step(powers,context);
  expect(powers.snapshot('owner').physics!.dynamicContacts).toBe(0);expect(b.position.x).toBe(beforeX);expect(b.velocity.x).toBe(0);expect(b.integrity).toBe(70);
});

it('does not push another creator’s private body, including through a shared source body',()=>{
  for(const shared of[false,true]){
    const {powers,context,a,b}=fixture();b.creator='other';a.shared=shared;
    const beforeX=b.position.x;step(powers,context);
    expect(powers.snapshot('owner').physics!.dynamicContacts).toBe(0);expect(b.velocity.x).toBe(0);expect(b.position.x).toBe(beforeX);expect(b.creator).toBe('other');expect(b.shared).not.toBe(true);
  }
});

it('records dense 64-body authority-step cost with actual contact transfer and strict clearance intact',()=>{
  const parts:SkyPart[]=Array.from({length:64},(_,i)=>({id:i+1,kind:'block',material:'wood',mass:6,position:{x:(i%8)*1.05-4,y:3,z:Math.floor(i/8)*1.05-4},velocity:{x:i%2?-.5:.5,y:0,z:0},rotation:0,links:[],epoch:0,creator:'owner'}));
  const powers=new SkyboundPowers({version:1,parts,blueprints:[],fusions:{}}),context:SkyContext={tick:0,bounds:WORLD,player:{x:10,y:0,z:0},inventory:{},actors:[{id:'observer',position:{x:10,y:0,z:0}}],solid:p=>p.y<0};
  const elapsed:number[]=[];let maxStatic=0,maxDynamic=0,maxHistory=0;
  for(let tick=0;tick<150;tick++){
    if(tick%15===0)for(const p of powers.state.parts)powers.applyImpulse(p.id,{x:p.id%2?.4:-.4,y:0,z:0});
    const start=performance.now();step(powers,context);elapsed.push(performance.now()-start);
    const metrics=powers.snapshot('owner').physics!;maxStatic=Math.max(maxStatic,metrics.contacts);maxDynamic=Math.max(maxDynamic,metrics.dynamicContacts??0);maxHistory=Math.max(maxHistory,metrics.historyFrames);
    expect(metrics.contacts).toBeLessThanOrEqual(64*RIGID_BUDGET.contacts*RIGID_BUDGET.substeps);
    expect(metrics.dynamicContacts??0).toBeLessThanOrEqual(64*ASSEMBLY_CONTACT_BUDGET.contactsPerAssembly/2);
    expect(powers.state.parts.every(p=>[p.position.x,p.position.y,p.position.z,...Object.values(p.velocity),...Object.values(p.angularVelocity!)].every(Number.isFinite))).toBe(true);
  }
  expect(maxDynamic).toBeGreaterThan(0);expect(maxHistory).toBeLessThanOrEqual(64*121);
  for(let i=0;i<64;i++)for(let j=i+1;j<64;j++)expect(skyPartsOverlap(powers.state.parts[i],powers.state.parts[j])).toBe(false);
  elapsed.sort((a,b)=>a-b);
  writeFileSync('/tmp/voxel-assembly-contact-integration-budget.json',JSON.stringify({scope:'Node authority-step only, 64 closely spaced free blocks, synthetic flat terrain, 150 ticks with alternating repeated impulses. Includes dynamic/static contact and full-volume clearance; excludes real terrain cache, browser GPU/network and device FPS.',parts:64,ticks:150,p50Ms:elapsed[75],p95Ms:elapsed[142],maxMs:elapsed[149],maxStaticContacts:maxStatic,maxDynamicContacts:maxDynamic,maxHistoryFrames:maxHistory,snapshotBytes:JSON.stringify(powers.snapshot('owner')).length},null,2));
},20000);
