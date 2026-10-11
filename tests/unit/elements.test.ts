import { describe,expect,it } from 'vitest';
import { ElementSystem } from '../../src/prototype/core/elements';
import { materialDefinition } from '../../src/prototype/core/materials';
import { VoxelField, type Cell, type Hit } from '../../src/prototype/core/voxel';
import { VoxelWater } from '../../src/prototype/core/water';
const make=()=>{const field=new VoxelField();const water=new VoxelWater(field);water.volume.fill(0);return {field,water,elements:new ElementSystem(field,water)};};
const hit=(cell:Cell):Hit=>({cell,point:{x:(cell.x+.5)*.25,y:(cell.y+.5)*.25,z:(cell.z+.5)*.25},normal:{x:0,y:1,z:0},distance:1});
const forward={x:1,y:0,z:0};
describe('material sample durability and local elements',()=>{
 it('persists damage, removes only depleted sample, and yields exactly once',()=>{
  const {field,elements}=make();field.box({x:0,y:0,z:0},{x:1,y:1,z:1},3);
  const cell=field.get(1,1,1)!,neighbor=field.get(2,1,1)!,target=hit(cell),before=field.sample(2,1,1);
  expect(elements.damage(target,40,0)).toEqual({damaged:1,destroyed:0});
  expect(elements.getDurability(cell)).toEqual({hp:50,max:90});expect(field.sample(1,1,1)).toBeLessThan(0);
  expect(elements.damage(target,50,0).destroyed).toBe(1);expect(field.distance(target.point)).toBe(.125);
  expect(field.sample(2,1,1)).toBe(before);expect(elements.getDurability(neighbor).hp).toBe(90);
  expect(elements.drainDrops()).toEqual([{material:3,position:target.point,count:1}]);
  expect(elements.damage(target,1000,0).destroyed).toBe(0);expect(elements.drainDrops()).toEqual([]);
 });
 it('reveals underlying material without destroying its durability or duplicating layers',()=>{
  const {field,elements}=make();field.box({x:0,y:0,z:0},{x:1,y:1,z:1},3);field.box({x:0,y:0,z:0},{x:1,y:1,z:1},4,'wood');
  // Equal-distance authored overlays may select the base; consume whichever composition owns the sample first.
  const first=field.get(1,1,1)!;elements.damage(hit(first),1000,0);const next=field.get(1,1,1)!;expect(next).toBeDefined();expect(next.material).not.toBe(first.material);expect(elements.getDurability(next).hp).toBe(materialDefinition(next.material).durability);
  elements.damage(hit(next),1000,0);expect(field.get(1,1,1)).toBeUndefined();const drops=elements.drainDrops();expect(drops.map(d=>d.material).sort()).toEqual([3,4]);elements.damage(hit(next),1000,0);expect(elements.drainDrops()).toEqual([]);
 });
 it('retains prior damage when an overlapping layer is harvested',()=>{const {field,elements}=make();field.set(0,0,0,3);const stone=field.get(0,0,0)!;elements.damage(hit(stone),40,0);field.box({x:-.25,y:-.25,z:-.25},{x:.5,y:.5,z:.5},4,'overlay');const wood=field.get(0,0,0)!;expect(wood.material).toBe(4);elements.damage(hit(wood),1000,0);expect(field.get(0,0,0)?.material).toBe(3);expect(elements.getDurability(field.get(0,0,0)!).hp).toBe(50);});
 it('does not turn SDF support samples into collectible solids',()=>{
  const {field,elements}=make();field.set(0,0,0,4);const support=field.cells.get('1,0,0')!;expect(support.distance).toBeGreaterThan(0);
  expect(elements.damage(hit(support),1000,0).destroyed).toBe(0);expect(elements.drainDrops()).toEqual([]);
  expect(materialDefinition(8).name).toBe('祭壇石');expect(materialDefinition(9).collectible).toBe(false);
 });
 it('marks damaged authored objects and prevents crafted-object harvest arbitrage',()=>{
  const {field,elements}=make();field.set(0,0,0,4,'build:wall:1');const cell=field.get(0,0,0)!;
  elements.damage(hit(cell),1000,0);expect(elements.damagedObjects.has('build:wall:1')).toBe(true);expect(elements.drainDrops()).toEqual([]);
 });
 it('burns combustible samples, spreads deterministically, and water extinguishes',()=>{
  const run=()=>{const setup=make();setup.field.box({x:0,y:0,z:0},{x:2,y:.25,z:.25},4);setup.elements.cast('fire',hit(setup.field.get(0,0,0)!),forward);return setup;};
  const a=run(),b=run();a.elements.tick(.5);for(let i=0;i<5;i++)b.elements.tick(.1);
  expect([...a.elements.states]).toEqual([...b.elements.states]);expect(a.elements.getDurability(a.field.get(0,0,0)!).hp).toBeLessThan(45);
  expect(a.elements.states.get('4,0,0')?.fire).toBe(1);
  a.elements.cast('water',hit(a.field.get(0,0,0)!),forward);expect(a.elements.states.get('0,0,0')?.fire).toBe(0);
  const hp=a.elements.getDurability(a.field.get(0,0,0)!).hp;a.elements.tick(.5);expect(a.elements.getDurability(a.field.get(0,0,0)!).hp).toBe(hp);
  a.elements.cast('fire',hit(a.field.get(0,0,0)!),forward);expect(a.elements.states.get('0,0,0')?.fire).toBe(0);
 });
 it('earth chips stone and smothers fire while wind propagates fire directionally',()=>{
  const {field,elements}=make();field.box({x:0,y:0,z:0},{x:3,y:.25,z:.25},4);const first=hit(field.get(0,0,0)!);
  elements.cast('fire',first,forward);expect(elements.states.has('5,0,0')).toBe(false);elements.cast('wind',first,forward);expect(elements.states.get('5,0,0')?.fire).toBe(1);
  elements.cast('earth',first,forward);expect(elements.states.get('0,0,0')?.fire).toBe(0);
  field.set(0,2,0,3);const stone=field.get(0,2,0)!;elements.cast('earth',hit(stone),forward);expect(elements.getDurability(stone).hp).toBe(62);
 });
 it('actual SDF surface rays map to occupied metal durability samples',()=>{
  const {field,elements}=make();field.box({x:0,y:0,z:0},{x:2,y:.3,z:.3},6);
  const target=field.ray({x:1,y:1,z:.15},{x:0,y:-1,z:0},2)!;expect(target).not.toBeNull();expect(target.cell.distance).toBeLessThan(0);
  elements.cast('lightning',target,forward);expect(elements.states.size).toBeGreaterThan(1);
 });
 it('lightning follows only connected metal and decays without changing solid material',()=>{
  const {field,elements}=make();field.box({x:0,y:0,z:0},{x:1,y:.25,z:.25},6);field.set(5,0,0,6);field.set(0,1,0,4);
  elements.cast('lightning',hit(field.get(0,0,0)!),forward);expect(elements.states.get('0,0,0')?.charge).toBe(1);
  expect(elements.states.get('3,0,0')!.charge).toBeLessThan(1);expect(elements.states.has('5,0,0')).toBe(false);expect(elements.states.has('0,1,0')).toBe(false);
  elements.tick(.5);elements.tick(.5);expect([...elements.states.values()].every(s=>s.charge===0)).toBe(true);expect(field.get(0,0,0)?.material).toBe(6);
 });
 it('bounds active state and transient effect counts under repeated casts',()=>{
  const {field,elements}=make();field.box({x:0,y:0,z:0},{x:4,y:2,z:4},4);
  for(let x=0;x<16;x++)for(let z=0;z<16;z++)elements.cast('fire',hit(field.get(x,0,z)!),forward);
  elements.tick(.5);expect(elements.states.size).toBeLessThanOrEqual(elements.maxStates);expect(elements.effects.length).toBeLessThanOrEqual(elements.maxEffects);
 });
});

it('protected quest objects neither ignite nor relay fire from adjacent wood or wind',()=>{
 const {field,elements}=make();for(let i=0;i<12;i++)field.set(i,0,0,4,i===4?'quest':undefined);elements.protectedObjects.add('quest');
 const first=hit(field.get(0,0,0)!);elements.cast('fire',first,forward);elements.cast('wind',first,forward);elements.tick(.5);
 expect(elements.states.get('4,0,0')?.fire??0).toBe(0);expect(elements.getDurability(field.get(4,0,0)!).hp).toBe(45);
});
