import { describe, expect, it, vi } from 'vitest';
import { drawPixelEnemy, drawPixelKeeper, keeperPose, pixelLine } from '../../src/emberfall/pixel-actors';
import { drawPixelFlame, drawPixelProjectiles, PixelCastFeedback, PixelMaterialEffects, PIXEL_EFFECT_BUDGETS, wandAimTarget } from '../../src/emberfall/pixel-effects';
import { CellWorld, Material } from '../../src/emberfall/materials';
import { idleInput, Run } from '../../src/emberfall/simulation';
import type { Enemy, Player } from '../../src/emberfall/simulation';

const player = (): Player => ({ x: 20, y: 20, vx: 0, vy: 0, hp: 100, maxHp: 100, fuel: 100, maxFuel: 100, wet: 0, burning: 0, toxic: 0, oxygen: 100, invulnerable: 0, grounded: true });
function context() {
  const colors: string[] = [], rects: number[][] = [];
  const ctx = { fillRect: vi.fn((...args: number[]) => rects.push(args)), globalAlpha: 1, set fillStyle(value: string) { colors.push(value); } };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, colors, rects };
}

describe('original articulated pixel actors', () => {
  it('poses breathing, separate walking legs, airborne hems and actual-cast recoil without mutating inputs', () => {
    const p = player(), input = idleInput(), snapshot = JSON.stringify({ p, input });
    expect(keeperPose(p, input, 0).breath).not.toBe(keeperPose(p, input, 0.4).breath);
    expect(keeperPose({ ...p, vx: 38 }, input, 0.1).stride).not.toBe(keeperPose({ ...p, vx: 38 }, input, 0.4).stride);
    expect(keeperPose({ ...p, grounded: false, vy: -20 }, input, 0.1)).toMatchObject({ airborne: true, hem: -1 });
    expect(keeperPose(p, { ...input, aimX: -1 }, 1, 1.1)).toMatchObject({ facing: -1 });
    expect(keeperPose(p, input, 1, 1.1).recoil).toBeGreaterThan(0);
    expect(keeperPose(p, input, 2, 1.1).recoil).toBe(0);
    expect(JSON.stringify({ p, input })).toBe(snapshot);
  });
  it('draws detailed copper/green sprites on the half-cell grid with bounded work', () => {
    const p = player(), input = { ...idleInput(), fire: true, fly: true }, { ctx, rects, colors } = context();
    p.wet = 2; p.burning = 2; p.vx = 21; p.grounded = false;
    const snapshot = JSON.stringify(p);
    drawPixelKeeper(ctx, p, input, 0.137, 'pick', 0.2);
    expect(rects.length).toBeGreaterThan(80); expect(rects.length).toBeLessThan(260);
    expect(colors).toContain('#67b3a1'); expect(colors).toContain('#efb86e');
    expect(colors.every(color => typeof color === 'string' && color.startsWith('#'))).toBe(true);
    expect(rects.every(rect => rect.every(n => Number.isFinite(n) && Number.isInteger(n * 2)))).toBe(true);
    expect(JSON.stringify(p)).toBe(snapshot);
  });
  it('has distinct crawler, moth, sentry and warden clusters with animated poses', () => {
    const shapes: string[] = [];
    for (const kind of ['crawler', 'moth', 'sentry', 'warden'] as const) {
      const enemy: Enemy = { id: 2, x: 20, y: 20, vx: 10, vy: 0, hp: 20, maxHp: 30, kind, cooldown: 0.2, flash: 0 };
      const first = context(), second = context();
      drawPixelEnemy(first.ctx, enemy, 0); drawPixelEnemy(second.ctx, enemy, 0.2);
      expect(first.rects.length).toBeGreaterThan(20); expect(first.rects.length).toBeLessThan(300);
      expect(first.colors.every(color => typeof color === 'string')).toBe(true);
      expect(first.rects.every(rect => rect.every(n => Number.isInteger(n * 2)))).toBe(true);
      shapes.push(JSON.stringify(first.rects));
      if (kind !== 'sentry') expect(second.rects).not.toEqual(first.rects);
    }
    expect(new Set(shapes).size).toBe(4);
  });
  it('bounds rasterized lines even for extreme endpoints', () => {
    const { ctx, rects } = context(); pixelLine(ctx, 0, 0, 100000, 100000, '#ffffff'); expect(rects).toHaveLength(160);
  });
});

describe('bounded read-only material and spell accents', () => {
  it('keeps all material/lifetime/RNG/dirty state unchanged across moving water, fire and smoke renders', () => {
    const world = new CellWorld(96, 64, 77);
    for (let x = 3; x < 90; x++) { world.set(x, 20, Material.Water); world.set(x, 21, Material.Water); world.set(x, 22, Material.Water); world.set(x, 35, Material.Fire); world.set(x, 40, Material.Smoke); }
    const cells = world.cells.slice(), life = world.life.slice(), rng = world.rngState, dirty = [...world.dirty];
    const effects = new PixelMaterialEffects(), first = context(), second = context(), view = { x: 0, y: 0, width: 96, height: 64 };
    effects.update(world, view, 0, 'balanced'); effects.draw(first.ctx, world, 0); effects.draw(second.ctx, world, 0.3);
    expect(effects.count).toBeGreaterThan(20); expect(effects.count).toBeLessThanOrEqual(144);
    expect(first.rects.length).toBeGreaterThan(20); expect(second.rects).not.toEqual(first.rects);
    expect(world.cells).toEqual(cells); expect(world.life).toEqual(life); expect(world.rngState).toBe(rng); expect([...world.dirty]).toEqual(dirty);
  });
  it('caps all three tiers by viewport dimensions and fixed anchor storage in a maximum-size world', () => {
    const world = new CellWorld(1536, 768), effects = new PixelMaterialEffects();
    world.cells.fill(Material.Fire);
    for (const quality of ['low', 'balanced', 'high'] as const) {
      effects.update(world, { x: 500, y: 100, width: 10000, height: 10000 }, 0, quality);
      expect(effects.count).toBeLessThanOrEqual(PIXEL_EFFECT_BUDGETS[quality].anchors);
      expect(effects.cellsScanned).toBeLessThanOrEqual(Math.ceil(320 / PIXEL_EFFECT_BUDGETS[quality].step) * 512);
      expect(effects.count).toBeGreaterThan(0);
    }
  });
  it('refreshes quality/camera/run changes but skips redundant source scans', () => {
    const world = new CellWorld(64, 64), effects = new PixelMaterialEffects(), view = { x: 0, y: 0, width: 32, height: 32 };
    effects.update(world, view, 0, 'balanced'); world.cells.fill(Material.Fire);
    effects.update(world, view, 0.02, 'balanced'); expect(effects.count).toBe(0);
    effects.update(world, view, 0.02, 'low'); expect(effects.count).toBeGreaterThan(0);
    world.cells.fill(Material.Air); effects.update(world, { ...view, x: 9 }, 0.03, 'low'); expect(effects.count).toBe(0);
    world.cells.fill(Material.Fire); effects.update(world, view, 0, 'low'); expect(effects.count).toBeGreaterThan(0);
  });
  it('only recoils for fresh nearby player shots and resets on replay/rewind', () => {
    const run = new Run(1), feedback = new PixelCastFeedback(); feedback.update(run); expect(feedback.castUntil).toBe(-Infinity);
    const shot = { spell: 'shard' as const, speed: 100, radius: 1, damage: 1, life: 1, blast: 0, dig: 0, fire: false, angle: 0 };
    run.addShot(shot, run.player.x, run.player.y, 0, true); feedback.update(run); expect(feedback.castUntil).toBe(-Infinity);
    run.addShot(shot, run.player.x, run.player.y, 0); feedback.update(run); expect(feedback.castUntil).toBe(0.12);
    run.time = 0.2; feedback.update(run); expect(feedback.castUntil).toBe(0.12);
    feedback.update(new Run(1)); expect(feedback.castUntil).toBe(-Infinity);
  });
  it('keeps sight before terrain, handles zero direction and does not change the world', () => {
    const world = new CellWorld(80, 80), p = player(), input = idleInput();
    expect(wandAimTarget(world, p, input)).toMatchObject({ x: 44, y: 19, distance: 24 });
    world.set(35, 19, Material.Rock);
    expect(wandAimTarget(world, p, input)).toMatchObject({ x: 34.5, y: 19, distance: 14.5 });
    expect(wandAimTarget(world, p, { aimX: 0, aimY: 0 })).toEqual(wandAimTarget(world, p, input));
    expect(world.get(35, 19)).toBe(Material.Rock);
  });
  it('renders pixel-snapped fire and culls offscreen projectile/impact detail', () => {
    const first = context(); drawPixelFlame(first.ctx, 10, 20, 0.137, 0.75);
    expect(first.rects.length).toBeLessThan(30); expect(first.rects.every(rect => rect.every(n => Number.isInteger(n * 2)))).toBe(true);
    const run = new Run(1), shot = { spell: 'shard' as const, speed: 100, radius: 1, damage: 1, life: 1, blast: 0, dig: 0, fire: false, angle: 0 };
    run.addShot(shot, 800, 800, 0); const second = context(); drawPixelProjectiles(second.ctx, run.projectiles, [{ x: 800, y: 800, vx: 10, vy: 10, life: 0.4, color: '#ffffff' }], 0, { x: 0, y: 0, width: 240, height: 135 }, 'high');
    expect(second.rects).toHaveLength(0);
  });
});
