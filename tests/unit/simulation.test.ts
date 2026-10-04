import { describe, it, expect } from 'vitest';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { terrainHeight, SdfWorld } from '../../src/world/density';
import { validateSave } from '../../src/save/format';
import { FluidGrid, MAX_FLUID_CELLS } from '../../src/fluid/fluid';
import { stepSphere, type SphereBody } from '../../src/physics/sphere';
const idle = { x: 0, z: 0, jump: false };
describe('browser/Node shared authority simulation', () => {
 it('moves at fixed ticks without diagonal acceleration and ignores invalid axes', () => {
  const axis = new GameSimulation(), diagonal = new GameSimulation();
  axis.world.density = p => p.y; diagonal.world.density = p => p.y;
  axis.step({ ...idle, x: 1 }); diagonal.step({ ...idle, x: 1, z: 1 });
  expect(Math.hypot(diagonal.player.x, diagonal.player.z - 8)).toBeCloseTo(axis.player.x, 5);
  axis.step({ ...idle, x: NaN, z: 1 }); expect(Number.isFinite(axis.player.x)).toBe(true);
 });
 it('settles on terrain and jumps under gravity', () => {
  const sim = new GameSimulation();
  // This dry-land character test must not also simulate the entire starting river
  // for 181 ticks. Fluid conservation/immersion are covered separately below.
  sim.fluid.restore([]);
  for (let i = 0; i < 60; i++) sim.step(idle);
  const ground = sim.player.y; expect(sim.player.grounded).toBe(true);
  sim.step({ ...idle, jump: true }); expect(sim.player.y).toBeGreaterThan(ground);
  for (let i = 0; i < 120; i++) sim.step(idle);
  expect(sim.player.grounded).toBe(true); expect(sim.player.y).toBeCloseTo(ground, 2); expect(sim.metrics.jumpHeight).toBeGreaterThan(1);
 });
 it('validates edit reach, cooldown and edit sequence', () => {
  const sim = new GameSimulation(), target = { x: 0, y: terrainHeight(0, 5), z: 5 };
  expect(() => sim.act('dig', { ...target, x: 100 })).toThrow();
  expect(sim.act('dig', target).dirty.length).toBeGreaterThan(0);
  expect(() => sim.act('add', target)).toThrow();
  for (let i = 0; i < 8; i++) sim.step(idle);
  sim.act('add', target); expect(sim.world.edits.map(e => e.id)).toEqual([1, 2]);
 });
 it('round-trips terrain, water, player and physics through a versioned save', () => {
  const sim = new GameSimulation(), target = { x: 0, y: terrainHeight(0, 5), z: 5 };
  sim.act('dig', target); for (let i = 0; i < 9; i++) sim.step(idle);
  sim.act('water', target); for (let i = 0; i < 9; i++) sim.step(idle);
  sim.act('rock', target);
  const saved = validateSave(JSON.parse(JSON.stringify(sim.save()))), restored = new GameSimulation(saved);
  expect(restored.world.density(target)).toBe(sim.world.density(target));
  expect(restored.fluid.snapshot()).toEqual(sim.fluid.snapshot()); expect(restored.bodies).toEqual(sim.bodies);
  expect(restored.player.x).toBe(sim.player.x); expect(restored.world.edits).toEqual(sim.world.edits);
 });
 it('rejects unknown save versions, duplicate fluids, bad seeds and nonfinite positions', () => {
  const save = new GameSimulation().save();
  expect(() => validateSave({ ...save, version: 99 })).toThrow(); expect(() => validateSave({ ...save, seed: 0 })).toThrow();
  expect(() => validateSave({ ...save, player: { x: NaN, y: 0, z: 0 } })).toThrow();
  const cell = { x: 0, y: 8, z: 0, volume: 1 };
  expect(() => validateSave({ ...save, fluids: [cell, cell] })).toThrow();
 });
});
describe('water and physics', () => {
 it('flows down while conserving volume', () => {
  const fluid = new FluidGrid(new SdfWorld()); fluid.add({ x: 0, y: 9, z: 0 });
  for (let i = 0; i < 10; i++) fluid.step();
  expect(fluid.snapshot().some(c => c.y < 9)).toBe(true);
  expect(fluid.snapshot().reduce((sum, c) => sum + c.volume, 0)).toBeCloseTo(1, 8);
 });
 it('blocks solid terrain but keeps water beyond the active rendering budget', () => {
  const fluid = new FluidGrid(new SdfWorld()); expect(fluid.add({ x: 0, y: -10, z: 0 })).toBe(0);
  for (let i = 0; i < MAX_FLUID_CELLS + 20; i++) fluid.add({ x: i % 128, y: 25, z: Math.floor(i / 128) });
  expect(fluid.cells.size).toBe(MAX_FLUID_CELLS + 20);
  expect(fluid.snapshot({x:20,y:25,z:8}).length).toBeLessThanOrEqual(MAX_FLUID_CELLS);
  const saved=validateSave({...new GameSimulation().save(), fluids:fluid.snapshot()});
  expect(saved.fluids).toHaveLength(MAX_FLUID_CELLS+20);
 });
 it('redistributes water instead of deleting it when raised terrain occupies a cell', () => {
  const world = new SdfWorld(), fluid = new FluidGrid(world);
  fluid.add({ x: 0, y: 6, z: 0 });
  world.apply({ id: 1, kind: 'add', position: { x: 0.5, y: 6.5, z: 0.5 }, radius: 1.7, material: 'stone', tick: 0 });
  fluid.step(); expect(fluid.displaced).toBeGreaterThan(0); expect(fluid.snapshot().reduce((sum, c) => sum + c.volume, 0)).toBeCloseTo(1, 8);
 });
 it('settles a sphere on the SDF and falls again after local support removal', () => {
  const world = new SdfWorld(); const b: SphereBody = { id: 1, position: { x: 1, y: 9, z: 4 }, velocity: { x: 0, y: 0, z: 0 }, radius: 0.55, sleeping: false };
  for (let i = 0; i < 200; i++) stepSphere(b, world, 1 / 30);
  const initial = b.position.y; expect(b.sleeping).toBe(true);
  world.apply({ id: 1, kind: 'dig', position: { x: 1, y: initial - 0.5, z: 4 }, radius: 2.5, material: 'stone', tick: 1 }); b.sleeping = false;
  for (let i = 0; i < 12; i++) stepSphere(b, world, 1 / 30);
  expect(b.position.y).toBeLessThan(initial - 0.3);
 });
});


it('always pours after another action, repeatedly, without a valid terrain aim or resources', () => {
 const sim = new GameSimulation();
 sim.act('dig', {x:0,y:sim.player.y,z:5}); sim.adventure.state.mana=0;sim.adventure.state.stamina=0;sim.adventure.state.inventory={};
 const total=()=>[...sim.fluid.cells.values()].reduce((n,c)=>n+c.volume,0);
 for(let i=0;i<4;i++) { const before=total();sim.act('water',{x:10000,y:10000,z:10000});expect(total()-before).toBeCloseTo(12); }
});
it('water carries the player, a sleeping rock and an enemy without movement input', () => {
 const sim=new GameSimulation();sim.world.density=p=>p.y;sim.groundAt=()=>0;
 Object.assign(sim.player,{x:.5,y:0,z:.5});
 const enemy=sim.adventure.state.enemies[0];Object.assign(enemy,{x:2.5,y:0,z:.5,cooldown:10});
 sim.bodies.push({id:100,radius:.55,sleeping:true,position:{x:4.5,y:.6,z:.5},velocity:{x:0,y:0,z:0}});
 sim.fluid.cells.clear();for(let x=0;x<6;x+=.5)for(let y=0;y<2;y+=.5)for(let z=0;z<1;z+=.5){sim.fluid.add({x,y,z});sim.fluid.cells.get(`${x},${y},${z}`)!.vx=5;}
 sim.step(idle);
 expect(sim.player.x).toBeGreaterThan(.6);expect(enemy.x).toBeGreaterThan(2.5);
 expect(sim.bodies[0].position.x).toBeGreaterThan(4.5);expect(sim.bodies[0].sleeping).toBe(false);
});
it('actual horizontal water transfer produces downstream current and conserves volume', () => {
 const world=new SdfWorld();world.density=p=>p.y;
 const fluid=new FluidGrid(world);fluid.add({x:0,y:0,z:0});const before=fluid.snapshot().reduce((n,c)=>n+c.volume,0);fluid.step();
 expect(fluid.current({x:1.5,y:0,z:.5}).x).toBeGreaterThan(0);
 expect(fluid.snapshot().reduce((n,c)=>n+c.volume,0)).toBeCloseTo(before,8);
});
