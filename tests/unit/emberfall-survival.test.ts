import { describe, expect, it } from 'vitest';
import { CellWorld, Material } from '../../src/emberfall/materials';
import { idleInput } from '../../src/emberfall/simulation';
import { MAX_RESOURCE, RECIPES, SurvivalRun, TOOL_RANGE } from '../../src/emberfall/survival';
import { editWand } from '../../src/emberfall/wands';

function arena(): SurvivalRun {
  const run = new SurvivalRun(19);
  run.world = new CellWorld(96, 96, 19);
  run.world.fillRect(0, 60, 96, 36, Material.Rock);
  Object.assign(run.player, { x: 25, y: 55, vx: 0, vy: 0, grounded: true });
  run.spawn = { x: 25, y: 55 }; run.enemies = [];
  return run;
}
function tick(run: SurvivalRun, count = 20) { for (let i = 0; i < count; i++) run.step(1 / 60, idleInput()); }
function resetCooldown(run: SurvivalRun) { tick(run, 21); }

describe('persistent survival crafting rules', () => {
  it('keeps a seeded world without gates, shops, perks, descent or terminal wins', () => {
    const a = new SurvivalRun(17), b = new SurvivalRun(17);
    expect(a.world.cells).toEqual(b.world.cells); expect(a.mode).toBe('survival');
    const world = a.world;
    expect(a.enterRefuge()).toBe(false); expect(a.descend()).toBe(false);
    expect(a.choosePerk('heart')).toBe(false); expect(a.buySpell('bomb', 30)).toBe(false);
    a.player.x = a.portal.x; a.player.y = a.portal.y;
    a.step(1 / 60, { ...idleInput(), interact: true });
    expect(a.world).toBe(world); expect(a.level).toBe(0); expect(a.phase).toBe('playing');
  });
  it('mines only actual visible close cells, observes cooldown and cannot farm empty or hard terrain', () => {
    const run = arena(); run.world.fillRect(35, 51, 3, 3, Material.Wood);
    expect(run.mine(35, 52)).toBe(true); expect(run.resources.wood).toBe(6);
    expect(run.mine(37, 52)).toBe(false); expect(run.resources.wood).toBe(6);
    resetCooldown(run); expect(run.mine(37, 52)).toBe(true); expect(run.resources.wood).toBe(9);
    resetCooldown(run); expect(run.mine(37, 52)).toBe(false); expect(run.resources.wood).toBe(9);
    run.world.set(25 + TOOL_RANGE + 2, 54, Material.Gold);
    expect(run.mine(25 + TOOL_RANGE + 2, 54)).toBe(false);
    run.world.fillRect(31, 42, 1, 18, Material.HardRock); run.world.set(35, 54, Material.Gold);
    expect(run.mine(35, 54)).toBe(false); expect(run.mine(31, 54)).toBe(false);
    expect(run.resources.ore).toBe(0); expect(run.mine(NaN, 54)).toBe(false);
  });
  it('completes actual mining, crafting, placement, lethal damage and continued play without resetting inventory or terrain', () => {
    const run = arena();
    run.world.fillRect(35, 48, 7, 12, Material.Wood);
    for (let x = 35; x <= 41; x += 2) for (let y = 49; y <= 58; y += 3) {
      run.mine(x, y); resetCooldown(run);
    }
    expect(run.resources.wood).toBeGreaterThanOrEqual(34);
    for (const x of [30, 33]) { expect(run.mine(x, 60)).toBe(true); resetCooldown(run); }
    expect(run.resources.stone).toBeGreaterThanOrEqual(12);
    expect(run.craft('camp')).toBe(true);
    expect(run.place('camp', 14, 59)).toBe(true);
    expect(run.camp).toEqual({ x: 14, y: 55 }); expect(run.resources.camp).toBe(0);
    const world = run.world, cells = run.world.cells.slice(), resources = { ...run.resources }, wands = structuredClone(run.wands);
    run.damage(200, '落盤');
    expect(run.phase).toBe('playing'); expect(run.deaths).toBe(1); expect(run.player.hp).toBe(run.player.maxHp);
    expect(run.player.x).toBe(14); expect(run.player.y).toBe(55); expect(run.notice).toContain('復帰');
    expect(run.world).toBe(world); expect(run.world.cells).toEqual(cells); expect(run.resources).toEqual(resources); expect(run.wands).toEqual(wands);
    run.damage(1000, '溶岩', true); expect(run.deaths).toBe(1);
    tick(run, 190); run.damage(1000, '溶岩', true); expect(run.deaths).toBe(2);
  });
  it('conserves exactly nine cells per placed block, refuses embedded/occupied/liquid targets and leaves failures atomic', () => {
    const run = arena(); run.resources.wood = 18;
    expect(run.place('wood', 35, 53)).toBe(true); expect(run.resources.wood).toBe(9);
    expect(Array.from(run.world.cells).filter(m => m === Material.Wood)).toHaveLength(9);
    resetCooldown(run); expect(run.place('wood', 35, 53)).toBe(false);
    expect(run.place('wood', 25, 55)).toBe(false);
    run.world.set(34, 48, Material.Water); expect(run.place('wood', 35, 48)).toBe(false);
    expect(run.resources.wood).toBe(9);
    expect(run.mine(34, 53)).toBe(true); resetCooldown(run); expect(run.mine(36, 53)).toBe(true);
    expect(run.resources.wood).toBe(18);
  });
  it('retains actual sand gravity, water flow and wood burning while stone dams remain solid', () => {
    const run = arena(); run.resources.wood = 9; run.resources.stone = 9; run.resources.sand = 9;
    expect(run.place('wood', 35, 53)).toBe(true); resetCooldown(run);
    expect(run.place('stone', 35, 47)).toBe(true); resetCooldown(run);
    expect(run.place('sand', 15, 47)).toBe(true);
    run.world.set(33, 53, Material.Fire); run.world.set(33, 47, Material.Fire);
    for (let i = 0; i < 8; i++) run.world.step();
    expect(run.world.get(34, 53)).not.toBe(Material.Wood); expect(run.world.get(34, 47)).toBe(Material.Rock);
    expect(run.world.get(15, 47)).toBe(Material.Air);
    expect(Array.from(run.world.cells).filter(m => m === Material.Sand)).toHaveLength(9);
    const seeded = new SurvivalRun(3); const before = Array.from(seeded.world.cells).filter(m => m === Material.Water).length;
    seeded.world.set(110, 32, Material.Air); seeded.world.set(111, 32, Material.Air);
    for (let i = 0; i < 30; i++) seeded.world.step();
    expect(Array.from(seeded.world.cells).filter(m => m === Material.Water)).toHaveLength(before);
    expect(seeded.world.get(110, 32)).toBe(Material.Water);
  });
  it('lets a built stone dam hold actual water, then releases the conserved reservoir when mined', () => {
    const run = arena(); run.resources.stone = 9;
    expect(run.place('stone', 35, 54)).toBe(true);
    run.world.fillRect(37, 52, 8, 1, Material.Rock);
    run.world.fillRect(44, 53, 1, 4, Material.Rock);
    run.world.fillRect(34, 56, 11, 1, Material.Rock);
    run.world.fillRect(37, 53, 7, 3, Material.Water);
    for (let i = 0; i < 30; i++) run.world.step();
    expect(Array.from(run.world.cells).filter(m => m === Material.Water)).toHaveLength(21);
    expect(run.world.get(33, 54)).toBe(Material.Air);
    resetCooldown(run); expect(run.mine(34, 54)).toBe(true); resetCooldown(run);
    expect(run.mine(36, 54)).toBe(true);
    for (let i = 0; i < 30; i++) run.world.step();
    expect(Array.from(run.world.cells).filter(m => m === Material.Water)).toHaveLength(21);
    expect(Array.from(run.world.cells).some((m, index) => m === Material.Water && index % run.world.width < 34)).toBe(true);
    expect(run.resources.stone).toBe(9);
  });
  it('requires a nearby visible workbench for upgrading, refilling and finite card editing', () => {
    const run = arena(); Object.assign(run.resources, { wood: 100, stone: 100, sand: 30, ore: 30 });
    expect(run.craft('pickaxe')).toBe(false); expect(run.canEditWands()).toBe(false);
    expect(run.craft('workbench')).toBe(true); expect(run.place('workbench', 14, 59)).toBe(true);
    expect(run.canEditWands()).toBe(true); expect(run.craft('pickaxe')).toBe(true); expect(run.pickaxeLevel).toBe(1);
    const resources = { ...run.resources }; expect(run.craft('pickaxe')).toBe(false); expect(run.resources).toEqual(resources);
    expect(run.craft('ammo')).toBe(false);
    run.selected = 1; editWand(run.wands[1], ['bomb']); run.castSelectedWand();
    expect(run.ammo.bomb).toBe(5); expect(run.craft('ammo')).toBe(true); expect(run.ammo.bomb).toBe(6);
    for (const wand of [...run.wands, ...run.wandPickups.map(p => p.wand)]) expect(wand.charges.bomb).toBe(6);
    run.world.fillRect(20, 40, 1, 20, Material.Rock); expect(run.canEditWands()).toBe(false); expect(run.canCraft('ammo')).toBe(false);
  });
  it('rejects resource overflow and never duplicates structures or spent ingredients', () => {
    const run = arena(); run.world.fillRect(35, 51, 3, 3, Material.Wood); run.resources.wood = MAX_RESOURCE;
    expect(run.mine(35, 52)).toBe(false); expect(run.world.get(35, 52)).toBe(Material.Wood);
    run.resources.wood = RECIPES.torch.cost.wood; run.resources.sand = RECIPES.torch.cost.sand;
    expect(run.craft('torch')).toBe(true); expect(run.craft('torch')).toBe(false); expect(run.resources.torch).toBe(2);
    expect(run.place('torch', 15, 59)).toBe(true); resetCooldown(run); expect(run.place('torch', 15, 59)).toBe(false);
    expect(run.resources.torch).toBe(1); expect(run.structures).toHaveLength(1);
  });
  it('safely recovers a completely embedded lava camp without giving free materials', () => {
    const run = arena(); run.resources.camp = 1; expect(run.place('camp', 14, 59)).toBe(true);
    run.world.fillRect(3, 25, 45, 40, Material.Lava); run.world.fillRect(5, 35, 36, 25, Material.Rock);
    const resources = { ...run.resources }; run.damage(1000, '溶岩');
    expect(run.collides(run.player.x, run.player.y)).toBe(false); expect(run.player.oxygen).toBe(100); expect(run.player.burning).toBe(0);
    expect(run.world.get(run.player.x, run.player.y + 5)).toBe(Material.HardRock);
    expect(run.resources).toEqual(resources); expect(run.deaths).toBe(1); expect(run.phase).toBe('playing');
    tick(run, 120); expect(run.deaths).toBe(1);
  });
  it('resolves lethal projectile collisions once without invalidating the simulation loop', () => {
    const run = arena(); run.player.hp = 1;
    for (let i = 0; i < 10; i++) run.projectiles.push({ x: 25, y: 55, vx: 0, vy: 0, enemy: true, spell: 'ember', damage: 20, speed: 0, radius: 1, life: 2, blast: 8, dig: 1, fire: false, angle: 0 });
    expect(() => run.step(1 / 60, idleInput())).not.toThrow(); expect(run.deaths).toBe(1); expect(run.phase).toBe('playing');
  });
  it('uses ordinary held-fire input to gather the reachable starter tree and stone', () => {
    const run = new SurvivalRun(23); run.enemies = []; tick(run, 50);
    for (let pass = 0; pass < 3; pass++) for (const y of [24, 28, 32, 26, 30, 21]) {
      const input = { ...idleInput(), fire: true, aimX: 55 - run.player.x, aimY: y - (run.player.y - 1) };
      for (let frame = 0; frame < 22; frame++) run.step(1 / 60, input);
    }
    expect(run.resources.wood).toBeGreaterThanOrEqual(34);
    for (const x of [49, 52, 55]) {
      const input = { ...idleInput(), fire: true, aimX: x - run.player.x, aimY: 34 - (run.player.y - 1) };
      for (let frame = 0; frame < 22; frame++) run.step(1 / 60, input);
    }
    expect(run.resources.stone).toBeGreaterThanOrEqual(21);
    expect(run.deaths).toBe(0); expect(run.player.x).toBe(40);
  });
});
