import { describe,it,expect } from 'vitest';
import { VoxelField } from '../../src/prototype/core/voxel';
import { SurvivalSystem } from '../../src/prototype/core/survival';
const floor=()=>{const f=new VoxelField();f.box({x:-8,y:-1,z:-8},{x:8,y:.25,z:8},3);return f;};
describe('bounded survival collection and construction',()=>{
 it('rejects malformed and duplicate pickup events and normalizes wood',()=>{
  const s=new SurvivalSystem(new VoxelField()),entry={id:'cell:1',material:5,count:3,position:{x:0,y:.7,z:0}};
  expect(s.addDrops([entry,entry,{...entry},{material:4,count:-1,position:entry.position},{material:99,count:20,position:entry.position}])).toBe(3);
  expect(s.tick(.1,{x:0,y:0,z:0})).toBe(3);expect(s.inventory[4]).toBe(3);expect(s.drops).toHaveLength(0);expect(s.tick(.1,{x:0,y:0,z:0})).toBe(0);
 });
 it('preserves every collectible material, including altar stone and cloth',()=>{const s=new SurvivalSystem(new VoxelField());for(const material of [1,8,10])s.addDrops([{material,count:1,position:{x:0,y:.7,z:0}}]);expect(s.tick(.1,{x:0,y:0,z:0})).toBe(3);expect(s.inventory[2]).toBe(1);expect(s.inventory[3]).toBe(1);expect(s.inventory[10]).toBe(1);});
 it('keeps resource units conserved while nearby chunks aggregate',()=>{
  const s=new SurvivalSystem(new VoxelField());for(let i=0;i<50;i++)s.addDrops([{material:4,count:1,position:{x:i*.001,y:.7,z:0}}]);
  expect(s.drops).toHaveLength(1);expect(s.drops[0].count).toBe(50);expect(s.tick(.1,{x:0,y:0,z:0})).toBe(50);expect(s.inventory[4]).toBe(50);
 });
 it('does not collect through a wall or while embedded in solid',()=>{
  const f=new VoxelField();f.box({x:-.1,y:0,z:-1},{x:.2,y:2,z:1},3);const s=new SurvivalSystem(f);
  s.addDrops([{material:4,count:2,position:{x:.5,y:.85,z:0}},{material:3,count:1,position:{x:0,y:.85,z:0}}]);
  expect(s.tick(.1,{x:-.5,y:0,z:0})).toBe(0);expect(s.inventory[4]).toBe(0);
 });
 it('keeps visible chunk storage bounded',()=>{
  const s=new SurvivalSystem(new VoxelField());for(let i=0;i<1000;i++)s.addDrops([{material:3,count:1,position:{x:i*2,y:1,z:0}}]);expect(s.drops.length).toBe(s.maxDrops);expect(s.drops.reduce((n,d)=>n+d.count,0)+s.pendingDrops.reduce((n,d)=>n+d.count,0)).toBe(1000);
 });
 it('lets high chunks fall onto solids without penetrating the floor',()=>{
  const s=new SurvivalSystem(floor());s.addDrops([{material:4,count:1,position:{x:0,y:3,z:0}}]);for(let i=0;i<30;i++)s.tick(.1,{x:6,y:.25,z:6});expect(s.drops[0].position.y).toBeGreaterThan(.25);expect(s.drops[0].position.y).toBeLessThan(.4);expect(s.tick(.1,{x:0,y:.25,z:0})).toBe(1);
 });
 it('wind cannot push dropped resources through solid walls',()=>{
  const f=floor();f.box({x:.5,y:.25,z:-1},{x:.8,y:2,z:1},3);const s=new SurvivalSystem(f);s.addDrops([{material:4,count:1,position:{x:0,y:1,z:0}}]);s.pushDrops({x:0,y:1,z:0},{x:1,y:0,z:0});expect(s.drops[0].position.x).toBeLessThan(.5);expect(f.distance(s.drops[0].position)).toBeGreaterThan(0);
 });
 it('prioritizes nearby overflow instead of starving behind distant debris',()=>{const s=new SurvivalSystem(new VoxelField());for(let i=0;i<192;i++)s.addDrops([{material:4,count:1,position:{x:20+i,y:1,z:0}}]);s.addDrops([{material:3,count:2,position:{x:0,y:.7,z:0}}]);expect(s.pendingDrops).toHaveLength(1);expect(s.tick(.1,{x:0,y:0,z:0})).toBe(2);expect(s.inventory[3]).toBe(2);expect([...s.drops,...s.pendingDrops].reduce((n,d)=>n+d.count,0)).toBe(192);});
 it('counts ruined construction toward the session layer cap',()=>{const s=new SurvivalSystem(floor()),p={x:0,y:.25,z:2.2};expect(s.maxBuildings).toBe(64);Object.defineProperty(s,'maxBuildings',{value:1});s.inventory[4]=40;expect(s.place({x:0,y:.25,z:0},p).ok).toBe(true);s.field.carve({x:0,y:1,z:0},.3);expect([...s.field.cells.values()].some(c=>c.object?.startsWith('build:')&&c.distance<0)).toBe(true);expect(s.place({x:1.5,y:.25,z:1},p).ok).toBe(false);expect(s.inventory[4]).toBe(32);});
 it('does not consume inventory for invalid, unsupported, occupied or body-overlapping placement',()=>{
  const s=new SurvivalSystem(floor());s.inventory[4]=80;const p={x:0,y:.25,z:2};
  expect(s.place({x:0,y:2,z:0},p).ok).toBe(false);
  expect(s.place({x:0,y:.25,z:2},p).ok).toBe(false);
  expect(s.place({x:0,y:.25,z:0},p,[{x:0,y:.25,z:0}]).ok).toBe(false);
  expect(s.place({x:20,y:.25,z:0},p).ok).toBe(false);expect(s.inventory[4]).toBe(80);
 });
 it('requires a nearby live workbench, places rounded SDF and consumes only once',()=>{
  const s=new SurvivalSystem(floor()),p={x:0,y:.25,z:2.2};s.inventory[4]=24;s.selected='wall';
  expect(s.place({x:0,y:.25,z:0},p).ok).toBe(false);expect(s.inventory[4]).toBe(24);
  s.selected='workbench';expect(s.place({x:0,y:.25,z:0},p)).toMatchObject({ok:true});expect(s.inventory[4]).toBe(16);
  expect(s.place({x:0,y:.25,z:0},p).ok).toBe(false);expect(s.inventory[4]).toBe(16);
  s.selected='floor';expect(s.place({x:1.5,y:.25,z:.5},p)).toMatchObject({ok:true});expect(s.inventory[4]).toBe(12);
  const build=Array.from(s.field.cells.values()).find(c=>c.object?.startsWith('build:workbench:'))!;s.field.removeObject(build.object!);
  expect(s.hasWorkbench({x:0,y:.25,z:0})).toBe(false);
 });
});
