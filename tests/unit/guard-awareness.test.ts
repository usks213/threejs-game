import {describe,it,expect} from 'vitest';
import {createGuardAwareness,updateGuardAwareness} from '../../src/prototype/core/guard-awareness';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {VoxelField} from '../../src/prototype/core/voxel';
const home={x:0,y:.25,z:-3},target={x:0,y:.25,z:2};
describe('ordinary campaign sentry perception',()=>{
 it('connects perception to the real campaign door without changing trial combat',()=>{
  const sim=new CoreSimulation(true,false,true),idle={x:0,z:0,sprint:false,block:false,water:false};sim.player.position={x:0,y:.25,z:3.2};
  for(let i=0;i<60;i++)sim.tick(1/30,idle);expect(sim.enemyAwareness(sim.enemies[0])).toBe('idle');expect(sim.enemies[0].position.z).toBe(-6);
  sim.look(0,.18);expect(sim.target()?.hit.cell.object).toBe('door');sim.action('interact',idle);expect(sim.arena.objects.get('door')?.open).toBe(true);sim.tick(1/30,idle);expect(sim.enemyAwareness(sim.enemies[0])).toBe('alert');
  for(let i=0;i<20;i++)sim.tick(1/30,idle);expect(sim.enemyAwareness(sim.enemies[0])).toBe('chase');expect(sim.enemies[0].position.z).toBeGreaterThan(-6);
 });
 it('shares real SDF occlusion and becomes alert only after a doorway opens',()=>{
  const field=new VoxelField(.25);field.box({x:-2,y:0,z:0},{x:2,y:3,z:.4},3,'wall');const state=createGuardAwareness(home);
  for(let i=0;i<20;i++)updateGuardAwareness(state,home,target,true,field,.1);expect(state.mode).toBe('idle');expect(state.visible).toBe(false);
  field.removeObject('wall');expect(updateGuardAwareness(state,home,target,true,field,.1).noticed).toBe(true);expect(state.mode).toBe('alert');
  for(let i=0;i<5;i++)updateGuardAwareness(state,home,target,true,field,.1);expect(state.mode).toBe('chase');expect(state.lastSeen).toEqual(target);
 });
 it('searches the last visible point instead of tracking a player through walls, then returns',()=>{
  const field=new VoxelField(.25),state=createGuardAwareness(home);for(let i=0;i<8;i++)updateGuardAwareness(state,home,target,true,field,.1);
  field.box({x:-3,y:0,z:0},{x:3,y:3,z:.4},3,'wall');const hidden={x:2,y:.25,z:2};for(let i=0;i<7;i++)updateGuardAwareness(state,home,hidden,true,field,.1);
  expect(state.mode).toBe('search');expect(state.lastSeen).toEqual(target);expect(updateGuardAwareness(state,home,hidden,true,field,.1).canAttack).toBe(false);
  for(let i=0;i<40;i++)updateGuardAwareness(state,home,hidden,true,field,.1);expect(state.mode).toBe('idle');
 });
 it('bounds sight probes and leashes without modifying actor health',()=>{
  let rays=0;const field={ray:()=>{rays++;return null;}},state=createGuardAwareness(home);for(let i=0;i<120;i++)updateGuardAwareness(state,home,target,true,field,1/120);expect(rays).toBeLessThanOrEqual(11);
  const result=updateGuardAwareness(state,{x:20,y:.25,z:-3},{x:21,y:.25,z:-3},true,field,.1);expect(result.mode).toBe('return');expect(result.target).toEqual(home);expect(result.canAttack).toBe(false);
 });
});
