import { describe, expect, it } from 'vitest';
import { CellWorld, Material } from '../../src/emberfall/materials';
import { CaveLighting, collectCaveLights, LIGHT_BUDGET, traceLight } from '../../src/emberfall/lighting';
import type { CaveLight, LightStructure } from '../../src/emberfall/lighting';

const warm: CaveLight = { x: 10.5, y: 15.5, radius: 40, strength: 1, color: [1, 0.6, 0.2], emission: 0.5 };
const viewport = { x: 0, y: 0, width: 60, height: 36 };
const sample = (field: CaveLighting, data: Uint8ClampedArray, x: number, y: number) => {
  const index = (Math.floor((y - field.y) / LIGHT_BUDGET.cellSize) * field.width + Math.floor((x - field.x) / LIGHT_BUDGET.cellSize)) * 4;
  return [...data.slice(index, index + 3)];
};

describe('cellular local-light visibility', () => {
  it.each([Material.Rock, Material.HardRock, Material.Wood, Material.Sand, Material.Gold])('a single-cell %i wall blocks light but its front surface is illuminated', material => {
    const world = new CellWorld(60, 36); world.fillRect(20, 0, 1, 36, material);
    expect(traceLight(world, 10.5, 15.5, 20.5, 15.5).visible).toBe(true);
    expect(traceLight(world, 10.5, 15.5, 30.5, 15.5).visible).toBe(false);
    expect(traceLight(world, 30.5, 15.5, 10.5, 15.5).visible).toBe(false);
    world.set(20, 15, Material.Air);
    expect(traceLight(world, 10.5, 15.5, 30.5, 15.5).visible).toBe(true);
  });
  it('traces water, oil, fire and steam without inventing solid occluders', () => {
    const world = new CellWorld(60, 36);
    [Material.Water, Material.Oil, Material.Fire, Material.Steam].forEach((m, i) => world.set(15 + i, 15, m));
    expect(traceLight(world, 10.5, 15.5, 30.5, 15.5).visible).toBe(true);
  });
  it('does not leak through a diagonal solid corner or beyond a bounded ray', () => {
    const world = new CellWorld(256, 36); world.set(11, 10, Material.Rock);
    expect(traceLight(world, 10.5, 10.5, 12.5, 12.5).visible).toBe(false);
    const long = traceLight(world, 1.5, 20.5, 255.5, 20.5);
    expect(long.visible).toBe(false); expect(long.steps).toBe(LIGHT_BUDGET.maxRaySteps);
    expect(traceLight(world, NaN, 1, 2, 2)).toEqual({ visible: false, steps: 0 });
  });
  it('produces actual occluded lighting and emitter-only bloom with readable ambient', () => {
    const world = new CellWorld(60, 36); world.fillRect(20, 0, 1, 36, Material.Rock);
    const field = new CaveLighting(); field.update(world, [warm], viewport);
    expect(sample(field, field.illumination, 10, 15)[0]).toBeGreaterThan(200);
    expect(sample(field, field.illumination, 30, 15)).toEqual([139, 157, 186]);
    expect(sample(field, field.emission, 10, 15)[0]).toBeGreaterThan(45);
    expect(sample(field, field.emission, 30, 15)).toEqual([0, 0, 0]);
    field.update(world, [{ ...warm, emission: 0 }], viewport);
    expect(sample(field, field.emission, 10, 15)).toEqual([0, 0, 0]);
    world.set(20, 15, Material.Air); world.set(20, 16, Material.Air);
    field.update(world, [warm], viewport);
    expect(sample(field, field.illumination, 30, 15)[0]).toBeGreaterThan(139);
  });
  it('is deterministic and caps sources, rays, ray traversal and light-map memory', () => {
    const world = new CellWorld(256, 384), field = new CaveLighting(), repeat = new CaveLighting();
    const sources = Array.from({ length: 500 }, (_, i) => ({ ...warm, x: 80 + i % 3, y: 90 + i % 3, radius: 500 }));
    const view = { x: 0, y: 0, width: 240, height: 320 };
    field.update(world, sources, view); repeat.update(world, sources, view);
    expect(field.illumination).toEqual(repeat.illumination); expect(field.emission).toEqual(repeat.emission);
    expect(field.metrics.lights).toBeLessThanOrEqual(LIGHT_BUDGET.maxLights);
    expect(field.metrics.rays).toBeLessThanOrEqual(LIGHT_BUDGET.maxRays);
    expect(field.metrics.raySteps).toBeLessThanOrEqual(LIGHT_BUDGET.maxRays * LIGHT_BUDGET.maxRaySteps);
    expect(field.metrics.samples).toBeLessThanOrEqual(LIGHT_BUDGET.maxGridCells);
    expect(field.metrics.budgetLimited).toBe(true);
    const memory = field.illumination; field.update(world, sources, view); expect(field.illumination).toBe(memory);
  });
  it('collects the hero, real structures and even single-particle fire, with a firm source cap', () => {
    const world = new CellWorld(60, 36), player = { x: 10, y: 15 };
    world.set(30, 15, Material.Gold); world.set(31, 15, Material.Water);
    expect(collectCaveLights(world, player, [], viewport)).toHaveLength(1);
    world.set(34, 15, Material.Fire);
    const loneFire = collectCaveLights(world, player, [], viewport);
    expect(loneFire).toHaveLength(2); expect(loneFire[1].x).toBe(34.5);
    const structures: LightStructure[] = [{ type: 'workbench', x: 10, y: 20 }, { type: 'torch', x: 15, y: 20 }, { type: 'camp', x: 25, y: 20 }];
    const sources = collectCaveLights(world, player, structures, viewport);
    expect(sources).toHaveLength(4); expect(sources.find(light => light.x === 15)?.y).toBe(16);
    expect(sources.find(light => light.x === 25)?.y).toBe(18);
    world.fillRect(0, 0, 60, 36, Material.Lava);
    expect(collectCaveLights(world, player, Array.from({ length: 100 }, () => structures[1]), viewport)).toHaveLength(LIGHT_BUDGET.maxLights);
  });
});
