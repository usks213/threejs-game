import { describe, expect, it } from 'vitest';
import { drawPixelEnvironment, ENVIRONMENT_BUDGET } from '../../src/emberfall/pixel-environment';
import { CellWorld, Material } from '../../src/emberfall/materials';
import { TerrainWindow } from '../../src/emberfall/terrain-window';
import { Run } from '../../src/emberfall/simulation';
import type { GraphicsQuality } from '../../src/emberfall/lighting';

const rgba = (window: TerrainWindow, x: number, y: number) => Array.from(window.pixels.slice(((y - window.y) * window.width + x - window.x) * 4, ((y - window.y) * window.width + x - window.x) * 4 + 4));
function recorder() {
  const commands: Array<readonly [string, number, number, number, number]> = [];
  const context = { fillStyle: '', fillRect(x: number, y: number, w: number, h: number) { commands.push([this.fillStyle, x, y, w, h]); } };
  return { ctx: context as unknown as CanvasRenderingContext2D, commands };
}

describe('original pixel terrain treatment', () => {
  it('preserves material silhouettes, deterministic texture and simulation state', () => {
    const world = new CellWorld(96, 80, 471);
    world.fillRect(10, 10, 70, 50, Material.Rock);
    world.fillRect(21, 22, 9, 7, Material.Gold);
    const cells = world.cells.slice(), life = world.life.slice(), rng = world.rngState;
    const window = new TerrainWindow();
    window.update(world, { x: 0, y: 0, width: 96, height: 80 });
    const first = window.pixels.slice();
    expect(rgba(window, 4, 4)).toEqual([0, 0, 0, 0]);
    for (let i = 0; i < cells.length; i++) expect(window.pixels[i * 4 + 3]).toBe(cells[i] === Material.Air ? 0 : 255);
    world.markAllDirty(); window.update(world, { x: 0, y: 0, width: 96, height: 80 });
    expect(window.pixels).toEqual(first);
    expect(world.cells).toEqual(cells); expect(world.life).toEqual(life); expect(world.rngState).toBe(rng); expect(world.tick).toBe(0);
    const colors = new Set<string>();
    for (let y = 32; y < 52; y++) for (let x = 15; x < 70; x++) colors.add(rgba(window, x, y).join(','));
    expect(colors.size).toBeGreaterThan(30);
  });

  it('refreshes newly exposed two-cell bevels across a dirty chunk border', () => {
    const world = new CellWorld(96, 96);
    world.fillRect(0, 0, 96, 96, Material.Rock);
    const window = new TerrainWindow(), view = { x: 0, y: 0, width: 96, height: 96 };
    window.update(world, view);
    const before = rgba(window, 32, 33);
    world.set(32, 31, Material.Air);
    const dirty = window.update(world, view);
    expect(dirty).not.toBeNull(); expect(window.cellsWritten).toBeLessThanOrEqual(5 * 16 * 16);
    expect(rgba(window, 32, 33)[0]).toBeGreaterThan(before[0]);
    expect(rgba(window, 32, 31)).toEqual([0, 0, 0, 0]);
    expect(window.update(world, view)).toBeNull(); expect(window.cellsWritten).toBe(0);
  });

  it('gives liquids a bright actual surface and deeper colored body', () => {
    const world = new CellWorld(96, 64), window = new TerrainWindow();
    for (const [i, material] of [Material.Water, Material.Oil, Material.Toxic, Material.Lava].entries()) world.fillRect(8 + i * 20, 10, 12, 20, material);
    window.update(world, { x: 0, y: 0, width: 96, height: 64 });
    for (const x of [8, 28, 48, 68]) {
      const surface = rgba(window, x, 10), body = rgba(window, x, 24);
      expect(surface[0] + surface[1] + surface[2]).toBeGreaterThan(body[0] + body[1] + body[2]);
      expect(surface[3]).toBe(255); expect(body[3]).toBe(255);
    }
    const water = rgba(window, 10, 24), toxic = rgba(window, 50, 24), lava = rgba(window, 70, 24);
    expect(water[2]).toBeGreaterThan(water[0]); expect(toxic[1]).toBeGreaterThan(toxic[0]); expect(lava[0]).toBeGreaterThan(lava[2]);
  });

  it('retains the bounded viewport buffer in a large world after far camera movement', () => {
    const world = new CellWorld(1536, 768), window = new TerrainWindow();
    world.cells.fill(Material.Rock);
    window.update(world, { x: 0, y: 0, width: 160, height: 347 });
    const bytes = window.pixels.byteLength;
    const before = world.cells.slice();
    window.update(world, { x: 1280, y: 410, width: 160, height: 347 });
    expect(window.pixels.byteLength).toBe(bytes);
    expect(window.width * window.height).toBeLessThanOrEqual(208 * 400);
    expect(window.cellsWritten).toBeLessThanOrEqual(208 * 400);
    expect(world.cells).toEqual(before);
  });
});

describe('bounded original environment artwork', () => {
  it.each<GraphicsQuality>(['low', 'balanced', 'high'])('is deterministic, pixel-aligned and simulation-independent at %s quality', quality => {
    const run = new Run(3397), a = recorder(), b = recorder(), view = { x: 53, y: 68, width: 240, height: 160 };
    const cells = run.world.cells.slice(), dirty = [...run.world.dirty], rng = run.world.rngState;
    drawPixelEnvironment(a.ctx, run, view, quality); drawPixelEnvironment(b.ctx, run, view, quality);
    expect(a.commands).toEqual(b.commands);
    expect(a.commands.length).toBeGreaterThan(150);
    expect(a.commands.length).toBeLessThan(12000);
    for (const command of a.commands) {
      expect(command.slice(1).every(Number.isInteger)).toBe(true);
      expect(command[3]).toBeGreaterThan(0); expect(command[4]).toBeGreaterThan(0);
    }
    expect(run.world.cells).toEqual(cells); expect([...run.world.dirty]).toEqual(dirty); expect(run.world.rngState).toBe(rng);
  });

  it('uses different palettes and motifs for all six large-world regions', () => {
    const run = new Run(3397); run.world = new CellWorld(1536, 768);
    const backgrounds = new Set<string>(), compositions = new Set<string>();
    for (let region = 0; region < 6; region++) {
      run.player.x = region * 256 + 80;
      const { ctx, commands } = recorder();
      drawPixelEnvironment(ctx, run, { x: region * 256, y: 70, width: 240, height: 160 }, 'balanced');
      backgrounds.add(commands[0][0]); compositions.add(JSON.stringify(commands.slice(-25)));
    }
    expect(backgrounds.size).toBe(6); expect(compositions.size).toBe(6);
  });

  it('bounds work even for oversized viewport inputs and keeps all three quality tiers', () => {
    const run = new Run(471), count: number[] = [];
    for (const quality of ['low', 'balanced', 'high'] as const) {
      const { ctx, commands } = recorder();
      drawPixelEnvironment(ctx, run, { x: 1200, y: 350, width: 100000, height: 100000 }, quality);
      expect(commands[0].slice(1)).toEqual([0, 0, ENVIRONMENT_BUDGET.maxWidth, ENVIRONMENT_BUDGET.maxHeight]);
      expect(commands.length).toBeLessThan(12000); count.push(commands.length);
    }
    expect(count[0]).toBeLessThan(count[1]); expect(count[1]).toBeLessThan(count[2]);
  });
});
