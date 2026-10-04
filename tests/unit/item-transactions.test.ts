import { describe, expect, it, vi } from 'vitest';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { newMeadows } from '../../src/game/meadows/state';
import { canCarry, carryAmount } from '../../src/game/meadows/inventory';
import { changeLayout, reconcileSlots } from '../../src/game/meadows/inventory-layout';
import { dropItem, pickupItem, stepDrops } from '../../src/game/interaction/drops';
import { buildingPose, buildingVoxels, carveVoxels, worldPoint } from '../../src/game/voxel/model';
import type { BuildingState } from '../../src/game/types';

function game() {
 const sim = new GameSimulation();
 Object.assign(sim.player, {x: 0, y: 0, z: 0});
 sim.adventure.state.resources = [];
 sim.adventure.state.buildings = [];
 sim.adventure.state.inventory = {};
 vi.spyOn(sim, 'groundAt').mockReturnValue(0);
 vi.spyOn(sim.fluid, 'immersion').mockReturnValue(0);
 return sim.adventure;
}
function building(definition: string, y = 2, rotation = 0): BuildingState {
 return {id: 12, definition, x: 0, y, z: 0, rotation, support: 4, contents: {}};
}
function settle(g: ReturnType<typeof game>, frames = 90) {
 for (let i = 0; i < frames; i++) stepDrops(g, 1 / 30);
}

describe('inventory transactions', () => {
 it('checks current totals even when the saved layout is stale in either direction', () => {
  const m = newMeadows(), items = {axe: 32};
  reconcileSlots(m, items);
  const before = structuredClone(m.slots);
  items.axe--;
  expect(canCarry(items, 'hammer', 1, m)).toBe(true);
  expect(m.slots).toEqual(before);
  m.slots = Array(32).fill(null);
  items.axe = 32;
  expect(canCarry(items, 'hammer', 1, m)).toBe(false);
 });
 it('keeps split stacks and quick-slot positions across reconciliation and gains', () => {
  const m = newMeadows(), items = {wood: 50};
  changeLayout(m, items, 'split', '0');
  changeLayout(m, items, 'move', '1:7');
  for (let i = 0; i < 5; i++) reconcileSlots(m, items);
  expect(m.slots).toHaveLength(32);
  expect(m.slots![0]).toEqual({id: 'wood', count: 25});
  expect(m.slots![7]).toEqual({id: 'wood', count: 25});
  items.wood++;
  reconcileSlots(m, items);
  expect(m.slots![0]?.count).toBe(26);
  expect(m.slots![7]?.count).toBe(25);
  expect(items.wood).toBe(51);
 });
 it('accounts for all deliberately occupied split slots instead of packed stack totals', () => {
  const m = newMeadows(), items = {wood: 64};
  m.slots = Array.from({length: 32}, () => ({id: 'wood', count: 2}));
  expect(canCarry(items, 'berry', 1, m)).toBe(false);
  expect(canCarry(items, 'wood', 1, m)).toBe(true);
  expect(m.slots.every(slot => slot?.count === 2)).toBe(true);
 });
 it('rejects invalid transaction counts and does not treat empty move indices as zero', () => {
  const m = newMeadows(), items = {wood: 10};
  for (const count of [-1, .5, Infinity, NaN]) {
   expect(canCarry(items, 'wood', count, m)).toBe(false);
   expect(carryAmount(items, 'wood', count, m)).toBe(0);
  }
  expect(canCarry({wood: -100}, 'stone', 1, m)).toBe(false);
  changeLayout(m, items, 'move', '0:7');
  changeLayout(m, items, 'move', '7:');
  expect(m.slots![7]?.count).toBe(10);
  expect(m.slots![0]).toBeNull();
  expect(() => changeLayout(m, items, 'split', '')).toThrow();
 });
 it('finds bounded partial capacity including zero-weight items', () => {
  expect(carryAmount({wood: 149}, 'wood', 100)).toBe(1);
  expect(carryAmount({}, 'coins', Number.MAX_SAFE_INTEGER)).toBe(32 * 999);
  expect(carryAmount({stone: 149, feathers: 20}, 'feathers', 100)).toBe(0);
 });
 it('merges into partly filled ground stacks before creating a remainder', () => {
  const g = game();
  dropItem(g, 'wood', 90, {x: 0, y: 0, z: 0});
  dropItem(g, 'wood', 90, {x: 1, y: 0, z: 0});
  dropItem(g, 'wood', 25, {x: .5, y: 0, z: 0});
  expect(g.state.resources.map(n => n.amount)).toEqual([100, 100, 5]);
  expect(g.state.inventory.wood).toBeUndefined();
  const before = structuredClone(g.state.resources);
  for (const count of [-1, .5, Infinity, NaN, Number.MAX_SAFE_INTEGER]) expect(() => dropItem(g, 'wood', count, g.sim.player)).toThrow();
  expect(g.state.resources).toEqual(before);
 });
 it('transfers only the fitting count, retains the remainder, and cannot pick up twice', () => {
  const g = game();
  g.state.inventory = {wood: 149};
  dropItem(g, 'wood', 10, g.sim.player);
  const node = g.state.resources[0];
  expect(pickupItem(g, node.id)).toBe(1);
  expect(node.amount).toBe(9);
  expect(g.state.inventory.wood).toBe(150);
  expect(() => pickupItem(g, node.id)).toThrow('空き');
  g.state.inventory.wood = 0;
  expect(pickupItem(g, node.id)).toBe(9);
  expect(g.state.resources).toEqual([]);
  expect(g.state.inventory.wood).toBe(9);
  expect(() => pickupItem(g, node.id)).toThrow('もうありません');
 });
 it('rejects unavailable, distant, or corrupt ground drops without changing ownership', () => {
  const g = game();
  dropItem(g, 'wood', 10, {x: 4, y: 0, z: 0});
  const node = g.state.resources[0];
  expect(() => pickupItem(g, node.id)).toThrow('近づいて');
  node.x = 0;
  node.ready = g.state.seconds + 1;
  expect(() => pickupItem(g, node.id)).toThrow('もうありません');
  node.ready = 0;
  for (const amount of [Infinity, NaN, .5, 0]) {
   node.amount = amount;
   expect(() => pickupItem(g, node.id)).toThrow('もうありません');
  }
  expect(g.state.inventory).toEqual({});
  expect(g.state.resources).toHaveLength(1);
 });
});

describe('drop collision with shared building cells', () => {
 it('lands on the visible voxel floor instead of falling to terrain', () => {
  const g = game();
  g.state.buildings = [building('floor')];
  dropItem(g, 'wood', 1, {x: 0, y: 3, z: 0});
  settle(g);
  expect(g.state.resources[0].y).toBeCloseTo(2.25 + .08, 4);
  expect(g.state.resources[0].velocity!.y).toBe(0);
 });
 it('falls through a removed floor opening, including a change to a cached piece', () => {
  const g = game(), floor = building('floor');
  g.state.buildings = [floor];
  dropItem(g, 'wood', 1, {x: 0, y: 3, z: 0});
  settle(g);
  floor.removed = [];
  carveVoxels(buildingVoxels('floor'), {x: 0, y: .125, z: 0}, .6, floor.removed);
  settle(g);
  expect(g.state.resources[0].y).toBeCloseTo(.08, 4);
 });
 it('sweeps fast drops against thin rotated walls without tunneling', () => {
  for (const rotation of [0, Math.PI / 2, Math.PI / 4]) {
   const g = game(), wall = building('wall', 1, rotation), pose = buildingPose(wall);
   g.state.buildings = [wall];
   const start = worldPoint({x: 0, y: 1, z: .7}, pose, pose.rotation);
   dropItem(g, 'wood', 1, start);
   const node = g.state.resources[0];
   node.velocity = worldPoint({x: 0, y: 0, z: -30}, {x: 0, y: 0, z: 0}, pose.rotation);
   stepDrops(g, 1 / 30);
   const expected = worldPoint({x: 0, y: 0, z: .125 + .08}, pose, pose.rotation);
   expect(node.x).toBeCloseTo(expected.x, 4);
   expect(node.z).toBeCloseTo(expected.z, 4);
  }
 });
 it('uses the hinged visible pose of an open door', () => {
  const g = game(), door = {...building('door', 1), open: true}, pose = buildingPose(door);
  g.state.buildings = [door];
  dropItem(g, 'wood', 1, worldPoint({x: 0, y: 1, z: .7}, pose, pose.rotation));
  const node = g.state.resources[0];
  node.velocity = worldPoint({x: 0, y: 0, z: -30}, {x: 0, y: 0, z: 0}, pose.rotation);
  stepDrops(g, 1 / 30);
  const expected = worldPoint({x: 0, y: 0, z: .125 + .08}, pose, pose.rotation);
  expect(node.x).toBeCloseTo(expected.x, 4);
  expect(node.z).toBeCloseTo(expected.z, 4);
 });
 it('lets drops pass through a carved wall opening', () => {
  const g = game(), wall = building('wall', 1);
  wall.removed = [];
  carveVoxels(buildingVoxels('wall'), {x: 0, y: 1, z: 0}, .6, wall.removed);
  g.state.buildings = [wall];
  dropItem(g, 'wood', 1, {x: 0, y: 2, z: .7});
  g.state.resources[0].velocity = {x: 0, y: 0, z: -30};
  stepDrops(g, 1 / 30);
  expect(g.state.resources[0].z).toBeLessThan(-.1);
 });
 it('recovers a newly produced item from inside a floor and keeps it supported', () => {
  const g = game();
  g.state.buildings = [building('floor')];
  dropItem(g, 'wood', 1, {x: 0, y: 2.02, z: 0});
  settle(g);
  expect(g.state.resources[0].y).toBeCloseTo(2.33, 4);
 });
 it('does not lift an item underneath a raised floor onto its top', () => {
  const g = game();
  g.state.buildings = [building('floor', 3)];
  dropItem(g, 'wood', 1, {x: 0, y: 2.8, z: 0});
  g.state.resources[0].velocity = {x: 0, y: 6, z: 0};
  stepDrops(g, 1 / 30);
  expect(g.state.resources[0].y).toBeLessThan(3);
  expect(g.state.resources[0].velocity!.y).toBe(0);
  settle(g);
  expect(g.state.resources[0].y).toBeCloseTo(.08, 4);
 });
});
