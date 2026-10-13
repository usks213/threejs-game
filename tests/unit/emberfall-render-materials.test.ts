import { describe, expect, it } from 'vitest';
import { CellWorld, Material } from '../../src/emberfall/materials';
import { scattering, surfaceNormal, surfaceResponse, SURFACE_MATERIALS } from '../../src/emberfall/render-materials';
import { QualityGovernor } from '../../src/emberfall/render-quality';
import { TerrainWindow } from '../../src/emberfall/terrain-window';
import { CaveLighting, collectCaveLights, DEFAULT_GRAPHICS, GRAPHICS_PRESETS, LIGHT_BUDGET, traceLight } from '../../src/emberfall/lighting';
import type { GraphicsQuality } from '../../src/emberfall/lighting';

const sum = (bytes: Uint8ClampedArray) => bytes.reduce((total, value, i) => total + (i % 4 === 3 ? 0 : value), 0);
const light = { x: 16.5, y: 15.5, radius: 45, strength: 1, color: [1, 0.75, 0.4] as const, emission: 0.4 };
const view = { x: 0, y: 0, width: 64, height: 40 };
const pixel = (field: CaveLighting, x: number, y: number) => (Math.floor((y - field.y) / field.cellSize) * field.width + Math.floor((x - field.x) / field.cellSize)) * 4;

describe('actual material and participating-medium response', () => {
  it('roughness changes the GGX peak and metalness changes colored specular and removes diffuse', () => {
    const base = { ...SURFACE_MATERIALS[Material.Rock], albedo: [0.8, 0.35, 0.05] as const };
    const polished = surfaceResponse({ ...base, roughness: 0.18 }, [0, 0, 1], [0, 0, 1]);
    const rough = surfaceResponse({ ...base, roughness: 0.95 }, [0, 0, 1], [0, 0, 1]);
    expect(polished.specular[0]).toBeGreaterThan(rough.specular[0] * 20);
    const metal = surfaceResponse({ ...base, roughness: 0.4, metalness: 1 }, [0, 0, 1], [0, 0, 1]);
    expect(metal.diffuse).toEqual([0, 0, 0]); expect(metal.specular[0]).toBeGreaterThan(metal.specular[2] * 5);
    expect(surfaceResponse(base, [0, 0, 1], [0, 0, -1]).diffuse).toEqual([0, 0, 0]);
  });
  it('uses terrain edges and moving water normals in the actual lighting direction', () => {
    const world = new CellWorld(32, 32); world.fillRect(16, 3, 8, 26, Material.Rock);
    const n = surfaceNormal(world, 16, 14); expect(n[0]).toBeLessThan(-0.3); expect(Math.hypot(...n)).toBeCloseTo(1);
    const facing = surfaceResponse(SURFACE_MATERIALS[Material.Rock], n, [-1, 0, 0.5]);
    const away = surfaceResponse(SURFACE_MATERIALS[Material.Rock], n, [1, 0, 0.5]);
    expect(facing.diffuse[0]).toBeGreaterThan(away.diffuse[0]);
    world.fillRect(4, 20, 8, 6, Material.Water);
    expect(surfaceNormal(world, 8, 20, 0)).not.toEqual(surfaceNormal(world, 8, 20, 1));
  });
  it('integrates physical ray length, attenuates through smoke and prevents scattering across a wall', () => {
    const world = new CellWorld(64, 40);
    const air = traceLight(world, 10.5, 15.5, 30.5, 15.5, true);
    expect(air.opticalDepth).toBeCloseTo(20 * 0.006);
    const diagonal = traceLight(world, 10.5, 10.5, 20.5, 20.5, true);
    expect(diagonal.opticalDepth).toBeCloseTo(Math.hypot(10, 10) * 0.006);
    world.fillRect(18, 10, 5, 10, Material.Smoke);
    expect(traceLight(world, 10.5, 15.5, 30.5, 15.5, true).opticalDepth).toBeGreaterThan(air.opticalDepth!);
    expect(scattering(0.1, 0.02, 0.5)).toBeGreaterThan(scattering(1, 0.02, 0.5));
    expect(scattering(0.1, 0, 0.5)).toBe(0);
    world.fillRect(25, 0, 1, 40, Material.Rock);
    const field = new CaveLighting(); field.update(world, [light], view);
    expect(field.volume[pixel(field, 19.5, 16.5)]).toBeGreaterThan(0);
    expect(field.volume[pixel(field, 34.5, 16.5)]).toBe(0);
    world.set(25, 15, Material.Air); world.set(25, 16, Material.Air);
    field.update(world, [light], view);
    expect(field.volume[pixel(field, 34.5, 16.5)]).toBeGreaterThan(0);
  });
  it('independently disables PBR, volume and emitter bloom with real pixel-buffer differences', () => {
    const world = new CellWorld(64, 40); world.fillRect(4, 22, 52, 5, Material.Water); world.fillRect(23, 10, 2, 8, Material.Gold);
    const enabled = new CaveLighting(); enabled.update(world, [light], view);
    expect(sum(enabled.specular)).toBeGreaterThan(0); expect(sum(enabled.volume)).toBeGreaterThan(0); expect(sum(enabled.emission)).toBeGreaterThan(0);
    for (const effect of ['pbr', 'volumetric', 'bloom'] as const) {
      const field = new CaveLighting(); field.update(world, [light], view, { ...DEFAULT_GRAPHICS, [effect]: false });
      expect(sum(effect === 'pbr' ? field.specular : effect === 'volumetric' ? field.volume : field.emission)).toBe(0);
      expect(Buffer.from(field.effects).equals(Buffer.from(enabled.effects))).toBe(false);
    }
  });
  it.each(['low', 'balanced', 'high'] as GraphicsQuality[])('respects %s budgets without partially rasterizing a source', quality => {
    const field = new CaveLighting(), world = new CellWorld(256, 384), preset = GRAPHICS_PRESETS[quality];
    field.update(world, Array.from({ length: 30 }, () => ({ ...light, x: 120, y: 120, radius: 60 })), { x: 0, y: 0, width: 240, height: 320 }, { ...DEFAULT_GRAPHICS, quality });
    expect(field.metrics.rays).toBeLessThanOrEqual(preset.maxRays); expect(field.metrics.lights).toBeLessThanOrEqual(preset.maxLights);
    expect(field.metrics.rays % field.metrics.lights).toBe(0);
    expect(field.metrics.raySteps).toBeLessThanOrEqual(LIGHT_BUDGET.maxRays * LIGHT_BUDGET.maxRaySteps);
    expect(field.metrics.pbrSamples + field.metrics.volumeSamples).toBeLessThanOrEqual(field.metrics.rays);
  });
  it('falls back only after repeated slow updates and restores an explicit quality choice', () => {
    const governor = new QualityGovernor(); governor.set('high');
    for (let i = 0; i < 5; i++) expect(governor.observe(15)).toBe(false);
    expect(governor.observe(15)).toBe(true); expect(governor.effective).toBe('balanced'); expect(governor.requested).toBe('high');
    for (let i = 0; i < 6; i++) governor.observe(15);
    expect(governor.effective).toBe('low'); governor.set('high'); expect(governor.effective).toBe('high');
    for (let i = 0; i < 20; i++) governor.observe(1); expect(governor.effective).toBe('high');
  });
});

describe('large-world viewport work', () => {
  it('allocates and shades only the chunk window; unseen edits appear on arrival', () => {
    const world = new CellWorld(1536, 768), raster = new TerrainWindow(), view = { x: 700, y: 300, width: 240, height: 135 };
    const first = raster.update(world, view); expect(first).not.toBeNull();
    expect(raster.width).toBe(288); expect(raster.height).toBe(192); expect(raster.cellsWritten).toBe(288 * 192);
    expect(raster.pixels.byteLength).toBeLessThan(230_000); expect(raster.chunksChecked).toBeLessThan(250);
    const memory = raster.pixels; expect(raster.update(world, view)).toBeNull(); expect(raster.cellsWritten).toBe(0);
    world.set(1450, 650, Material.Gold); expect(raster.update(world, view)).toBeNull();
    raster.update(world, { ...view, x: 1290, y: 600 });
    expect(raster.pixels).toBe(memory);
    const index = ((650 - raster.y) * raster.width + 1450 - raster.x) * 4;
    expect(raster.pixels[index + 3]).toBe(255); expect(raster.pixels[index]).toBeGreaterThan(raster.pixels[index + 2]);
    world.set(1450, 650, Material.Air); expect(raster.update(world, { ...view, x: 1290, y: 600 })).not.toBeNull();
    expect(raster.cellsWritten).toBeLessThanOrEqual(5 * 16 * 16); expect(raster.pixels[index + 3]).toBe(0);
  });
  it('keeps environmental-light scans local and clusters correctly beyond x384', () => {
    const world = new CellWorld(1536, 768), scan = { cells: 0 };
    world.set(750, 330, Material.Fire); world.set(10, 10, Material.Lava);
    const lights = collectCaveLights(world, { x: 730, y: 330 }, [], { x: 690, y: 280, width: 240, height: 180 }, 7, scan);
    expect(lights).toHaveLength(2); expect(lights[1].x).toBe(750.5);
    expect(scan.cells).toBeLessThanOrEqual(304 * 244); expect(scan.cells).toBeLessThan(world.width * world.height / 10);
  });
});
