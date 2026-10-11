import { describe,it,expect } from 'vitest';
import { CoreSimulation,type Controls } from '../../src/prototype/core/simulation';
import type { Vec3 } from '../../src/prototype/core/voxel';
const idle:Controls={x:0,z:0,sprint:false,block:false,water:false};
const advance=(s:CoreSimulation,seconds:number)=>{for(let i=0;i<Math.ceil(seconds*60);i++)s.tick(1/60,idle);};
const aim=(s:CoreSimulation,p:Vec3)=>{const e=s.eye(),x=p.x-e.x,y=p.y-e.y,z=p.z-e.z;s.player.yaw=Math.atan2(-x,-z);s.player.pitch=Math.atan2(y,Math.hypot(x,z));};
const quiet=()=>{const s=new CoreSimulation();for(const e of s.enemies)e.hp=0;return s;};
describe('playable elemental survival event integration',()=>{
 it('chisel action depletes authored wood, collects its material once and builds a workbench',()=>{
  const s=quiet();s.player.position={x:-.65,y:.25,z:6.25};aim(s,{x:-1.6,y:.58,z:6.25});
  expect(s.target()?.hit.cell.object).toBe('sample-wood');s.action('chisel',idle);const revision=s.arena.field.revision;
  s.action('heavy',idle);advance(s,.2);expect(s.arena.field.revision).toBe(revision);advance(s,2);
  expect(s.arena.field.revision).toBeGreaterThan(revision);expect(s.events.some(e=>e.kind==='break')).toBe(true);
  expect(s.survival.inventory[4]).toBeGreaterThanOrEqual(8);
  s.player.position={x:0,y:.25,z:6};aim(s,{x:0,y:.25,z:4.3});const before=s.survival.inventory[4];
  s.action('build',idle);expect(s.survival.inventory[4]).toBe(before-8);expect([...s.arena.field.cells.values()].some(c=>c.object?.startsWith('build:workbench:'))).toBe(true);
  s.action('build',idle);expect(s.survival.inventory[4]).toBe(before-8);
 });
 it('fire cast ignites target wood, water cast extinguishes it, and cast spam is committed',()=>{
  const s=quiet();aim(s,{x:-1.6,y:.58,z:6.25});s.action('cast',idle);const stamina=s.player.stamina;
  expect([...s.elements.states.values()].some(v=>v.fire>0)).toBe(false);advance(s,.45);expect([...s.elements.states.values()].some(v=>v.fire>0)).toBe(true);s.action('cast',idle);expect(s.player.stamina).toBe(stamina);
  s.action('element-next',idle);expect(s.selectedElement).toBe('fire');advance(s,.8);s.action('element-next',idle);expect(s.selectedElement).toBe('water');
  s.action('cast',idle);advance(s,.45);expect([...s.elements.states.values()].some(v=>v.wet>0)).toBe(true);
  const hit=s.target()!;expect(s.elements.states.get(`${hit.hit.cell.x},${hit.hit.cell.y},${hit.hit.cell.z}`)?.fire??0).toBe(0);
 });
 it('physical sword contact damages a wall only once per swing',()=>{
  const s=quiet();s.player.position={x:0,y:.25,z:2.2};s.action('heavy',idle);advance(s,1.2);
  expect(s.elements.damagedObjects.has('door')).toBe(true);const sum=s.survival.inventory[4]+s.survival.drops.reduce((n,d)=>n+(d.material===4?d.count:0),0);
  expect(sum).toBeGreaterThan(0);advance(s,1);expect(s.survival.inventory[4]+s.survival.drops.reduce((n,d)=>n+(d.material===4?d.count:0),0)).toBe(sum);
 });
 it('never regenerates harvested door voxels through interaction',()=>{
  const s=quiet();s.player.position.z=3;s.action('chisel',idle);s.action('heavy',idle);advance(s,2.2);
  const damaged=s.arena.field.revision;expect(s.elements.damagedObjects.has('door')).toBe(true);s.action('interact',idle);
  expect(s.arena.field.revision).toBe(damaged);expect(s.arena.objects.get('door')?.open).toBe(false);
 });
 it('cast respects obstruction and inability to act while dead or insufficient stamina',()=>{
  const s=quiet();aim(s,{x:-1.6,y:.58,z:6.25});s.player.stamina=17;s.action('cast',idle);expect(s.elements.states.size).toBe(0);
  s.player.stamina=100;s.player.hp=0;s.action('cast',idle);expect(s.elements.states.size).toBe(0);
  s.player.hp=100;s.arena.field.box({x:-.5,y:.25,z:5},{x:-.25,y:2,z:7},3);s.action('cast',idle);expect([...s.elements.states.values()].some(v=>v.fire>0)).toBe(false);
 });
});
