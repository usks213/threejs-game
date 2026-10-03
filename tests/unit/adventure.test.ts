import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { validateSave } from '../../src/save/format';
import { BIOMES, BOSSES } from '../../src/content/catalog';
import { environmentAt, DAY_SECONDS } from '../../src/environment/time';
const idle = { x: 0, z: 0, jump: false };
describe('survival gameplay', () => {
 it('gathers, crafts gear, builds a workbench and uses its recipes', () => {
  const sim = new GameSimulation(), game = sim.adventure, node = game.state.resources.find(n => n.kind === 'wood')!;
  Object.assign(sim.player, { x: node.x, z: node.z, y: node.y }); game.action('gather'); expect(game.state.inventory.wood).toBe(3);
  game.state.inventory.wood = 30; game.state.inventory.stone = 20; game.state.inventory.resin = 5;
  game.action('craft', 'sword'); expect(game.state.equipment).toBe('sword');
  expect(() => game.action('craft', 'staff')).toThrow('作業台');
  game.action('build', 'bench', { x: node.x + 3, y: sim.groundAt(node.x + 3, node.z), z: node.z });
  expect(game.state.buildings).toHaveLength(1); game.action('craft', 'staff'); expect(game.state.inventory.staff).toBe(1);
 });
 it('requires offerings, summons all five bosses, and persists progression', () => {
  const sim = new GameSimulation(), game = sim.adventure;
  for (const biome of BIOMES) {
   game.state.unlocked = biome.tier; sim.player.x = biome.center.x; sim.player.z = biome.center.z - 14; sim.player.y = sim.groundAt(sim.player.x, sim.player.z);
   expect(() => game.action('summon')).toThrow();
   const boss = BOSSES.find(b => b.id === biome.boss)!; Object.assign(game.state.inventory, boss.summon); game.action('summon');
   const enemy = game.state.enemies.find(e => e.definition === boss.id && e.boss)!;
   enemy.health = 1; enemy.x = sim.player.x; enemy.z = sim.player.z - 1; enemy.y = sim.player.y;
   game.state.equipment = 'aetherSword'; game.state.stamina = 100; game.step(1); game.action('attack');
   expect(game.state.defeated).toContain(boss.id);
  }
  const saved = validateSave(JSON.parse(JSON.stringify(sim.save()))), restored = new GameSimulation(saved);
  expect(restored.adventure.state.defeated).toHaveLength(5); expect(restored.adventure.state.inventory).toEqual(game.state.inventory);
 });
 it('migrates old terrain-only saves and permits more than twelve rocks', () => {
  const sim = new GameSimulation(); const save = sim.save(); delete save.adventure; save.version = 1;
  const migrated = new GameSimulation(validateSave(save)); expect(migrated.adventure.state.health).toBe(100);
  for (let i = 0; i < 30; i++) { const target = { x: 0, y: sim.player.y, z: 5 }; sim.act('rock', target); sim.tick += 8; }
  expect(sim.bodies).toHaveLength(30); expect(validateSave(sim.save()).bodies).toHaveLength(30);
 });
 it('exposes daylight, nighttime and reproducible weather', () => {
  expect(environmentAt(0).daylight).toBeGreaterThan(0.5); expect(environmentAt(DAY_SECONDS * 0.6).daylight).toBe(0);
  expect(environmentAt(180).weather).toBe('cloud'); expect(environmentAt(0, 4).weather).toBe('snow');
 });
 it('water slows walking and permits swimming jumps without ground support', () => {
  const dry = new GameSimulation(), wet = new GameSimulation(); dry.world.density = p => p.y; wet.world.density = p => p.y;
  Object.assign(dry.player, { x: 0.5, y: 0, z: 0.5 }); Object.assign(wet.player, { x: 0.5, y: 0, z: 0.5 });
  wet.fluid.add({ x: 0, y: 0, z: 0 }); wet.fluid.add({ x: 0, y: 1, z: 0 });
  expect(wet.fluid.immersion(wet.player, 1.45)).toBeGreaterThan(0.8);
  dry.step({ ...idle, x: 1 }); wet.step({ ...idle, x: 1 }); expect(wet.player.x).toBeLessThan(dry.player.x);
  wet.player.grounded = false; wet.step({ ...idle, jump: true }); expect(wet.player.vy).toBeGreaterThan(0);
 });
 it('rejects corrupt progression data without silently loading it', () => {
  const save = new GameSimulation().save(); save.adventure!.health = NaN; expect(() => validateSave(save)).toThrow();
 });
});

it('freezes water temporarily and then restores flow', () => {
 const sim = new GameSimulation(); sim.world.density = p => p.y;
 sim.fluid.add({ x: 0, y: 1, z: 0 }); sim.fluid.freeze({ x: 0.5, y: 1.5, z: 0.5 }, 2);
 expect(sim.fluid.iceHeight({ x: 0.5, y: 0, z: 0.5 })).toBe(2);
 for (let i = 0; i < 50; i++) sim.fluid.step(); expect(sim.fluid.snapshot()[0].y).toBe(1);
 for (let i = 0; i < 40; i++) sim.fluid.step(); expect(sim.fluid.iceHeight({ x: 0.5, y: 0, z: 0.5 })).toBeNull();
});

it('connects portal pairs, protects against immediate bounce, and preserves death recovery',()=>{
 const sim=new GameSimulation(),game=sim.adventure;
 game.state.buildings.push(
 {id:3000050,definition:'portal',x:0,y:sim.groundAt(0,8),z:8,rotation:0,support:3,contents:{}},
 {id:3000051,definition:'portal',x:20,y:sim.groundAt(20,8),z:8,rotation:0,support:3,contents:{}});
 game.action('portal'); expect(sim.player.x).toBe(20); expect(()=>game.action('portal')).toThrow('安定');
 game.state.inventory.wood=10; game.hurtPlayer(1000,'physical'); expect(game.state.inventory.wood).toBe(8); expect(game.state.grave?.wood).toBe(2);
 const saved=validateSave(sim.save()); expect(saved.adventure?.grave?.wood).toBe(2);
 game.stepPersonal(4); Object.assign(sim.player,game.state.death); game.action('gather'); expect(game.state.inventory.wood).toBe(10);
});
it('uses data-driven weapon reach and keeps poison finite',()=>{
 const sim=new GameSimulation(),game=sim.adventure;
 game.state.inventory.spear=1; game.action('equip','spear');
 const enemy=game.state.enemies[0]; enemy.x=sim.player.x; enemy.z=sim.player.z-3.8; enemy.y=sim.player.y;
 const health=enemy.health; game.action('attack'); expect(enemy.health).toBeLessThan(health);
 game.hurtPlayer(2,'poison'); for(let i=0;i<300;i++)game.stepPersonal(1/30);
 expect(game.state.poison).toBe(0); expect(game.state.health).toBeGreaterThan(60);
});
it('adds and removes water through built sources and drains',()=>{
 const sim=new GameSimulation(); sim.world.density=p=>p.y; const game=sim.adventure;
 game.state.buildings.push({id:3000500,definition:'spring',x:5,y:0,z:5,rotation:0,support:3,contents:{}});
 sim.tick=30; game.step(1/30); expect(sim.fluid.snapshot().length).toBeGreaterThan(0);
 expect(sim.fluid.drain({x:5.5,y:1.5,z:5.5},2)).toBeGreaterThan(0); expect(sim.fluid.snapshot()).toHaveLength(0);
});
