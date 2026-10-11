import { describe, expect, it } from 'vitest';
import { CellWorld, Material } from '../../src/emberfall/materials';
import { Run, idleInput } from '../../src/emberfall/simulation';
import { SurvivalRun } from '../../src/emberfall/survival';
import { createOpenWorld, focusWorld, LEGACY_EXITS, MAX_ACTIVE_CELLS, OPEN_CHUNK_SIZE, OPEN_WORLD_HEIGHT, OPEN_WORLD_WIDTH, surfaceAt } from '../../src/emberfall/open-world';
import { loadSurvival, saveSurvival, SURVIVAL_BACKUP_KEY, SURVIVAL_LEGACY_BACKUP_KEY, SURVIVAL_LEGACY_KEY, SURVIVAL_SAVE_KEY } from '../../src/emberfall/survival-save';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function tick(run: SurvivalRun, count = 25) { for (let i = 0; i < count; i++) run.step(1 / 60, idleInput()); }
function count(world: CellWorld, material: Material) { let result = 0; for (const cell of world.cells) if (cell === material) result++; return result; }
function bytes(a: Uint8Array, b: Uint8Array) { return Buffer.from(a).equals(Buffer.from(b)); }

describe('finite continuous chunk world', () => {
  it('expands only survival, with deterministic terrain and a hard finite world/physics budget', () => {
    const run = new SurvivalRun(63), same = new SurvivalRun(63), expedition = new Run(63);
    expect([run.world.width, run.world.height]).toEqual([1536, 768]);
    expect(bytes(run.world.cells, same.world.cells)).toBe(true);
    expect([expedition.world.width, expedition.world.height]).toEqual([256, 384]);
    expect(run.world.cells.length + run.world.life.length).toBe(2_359_296);
    for (const [x, y] of [[40, 27], [512, 256], [1000, 700], [1530, 760]]) {
      focusWorld(run.world, x, y); run.world.step();
      expect(run.world.lastStepCells).toBeLessThanOrEqual(MAX_ACTIVE_CELLS);
      expect(run.world.activeRegion!.x % OPEN_CHUNK_SIZE).toBe(0); expect(run.world.activeRegion!.y % OPEN_CHUNK_SIZE).toBe(0);
    }
    expect(MAX_ACTIVE_CELLS).toBe(50_176);
    expect(() => new CellWorld(OPEN_WORLD_WIDTH + 1, OPEN_WORLD_HEIGHT)).toThrow(RangeError);
  });
  it('migrates every legacy editable cell/lifetime and archives both original records without writes during load', () => {
    const legacy = new SurvivalRun(41, false), storage = new MemoryStorage();
    legacy.resources.camp = 1; expect(legacy.place('camp', 25, 33)).toBe(true);
    legacy.world.carveCircle(100, 150, 12, 10); legacy.world.set(84, 27, Material.Water); legacy.world.set(90, 24, Material.Fire);
    legacy.world.tick = 123; legacy.world.rngState = 9876;
    legacy.resources.wood = 9; expect(saveSurvival(legacy, storage).ok).toBe(true);
    legacy.resources.wood = 12; expect(saveSurvival(legacy, storage).ok).toBe(true);
    const oldPrimary = storage.getItem(SURVIVAL_SAVE_KEY), oldBackup = storage.getItem(SURVIVAL_BACKUP_KEY), before = new Map(storage.values);
    const result = loadSurvival(storage), loaded = result.run!;
    expect(result.message).toContain('移行'); expect(storage.values).toEqual(before);
    let differences = 0;
    for (let y = 0; y < 384; y++) for (let x = 0; x < 256; x++) {
      const index = y * 256 + x, exit = LEGACY_EXITS.some(e => x >= e.x && x < e.x + e.width && y >= e.y && y < e.y + e.height);
      const opened = exit && legacy.world.cells[index] === Material.HardRock;
      if (loaded.world.get(x, y) !== (opened ? Material.Air : legacy.world.cells[index]) || loaded.world.life[y * loaded.world.width + x] !== (opened ? 0 : legacy.world.life[index])) differences++;
    }
    expect(differences).toBe(0); expect(loaded.resources).toEqual(legacy.resources); expect(loaded.structures).toEqual(legacy.structures);
    expect(loaded.player).toEqual(legacy.player); expect(loaded.wands).toEqual(legacy.wands); expect(loaded.camp).toEqual(legacy.camp);
    expect(loaded.enemies.slice(0, legacy.enemies.length)).toEqual(legacy.enemies);
    expect(loaded.world.tick).toBe(123); expect(loaded.world.rngState).toBe(9876);
    expect(saveSurvival(loaded, storage).ok).toBe(true);
    expect(storage.getItem(SURVIVAL_LEGACY_KEY)).toBe(oldPrimary); expect(storage.getItem(SURVIVAL_LEGACY_BACKUP_KEY)).toBe(oldBackup);
    expect(JSON.parse(storage.getItem(SURVIVAL_SAVE_KEY)!).version).toBe(2);
  });
  it('freezes remote cells and gas lifetimes, then resumes their actual state on return', () => {
    const run = new SurvivalRun(13); run.enemies = [];
    run.world.fillRect(990, 90, 30, 40, Material.Air); run.world.fillRect(990, 130, 30, 2, Material.Rock);
    run.world.set(1000, 100, Material.Sand); run.world.set(1004, 100, Material.Water); run.world.set(1008, 100, Material.Fire);
    const life = run.world.life[100 * run.world.width + 1008]; tick(run, 60);
    expect(run.world.get(1000, 100)).toBe(Material.Sand); expect(run.world.get(1004, 100)).toBe(Material.Water); expect(run.world.life[100 * run.world.width + 1008]).toBe(life);
    run.player.x = 1000; run.player.y = 94; tick(run, 30);
    expect(run.world.get(1000, 100)).not.toBe(Material.Sand); expect(run.world.get(1008, 100)).not.toBe(Material.Fire);
    expect(run.world.lastStepCells).toBeLessThanOrEqual(MAX_ACTIVE_CELLS);
  });
  it('moves sand and water across chunk seams once and conserves both at a sleeping edge', () => {
    const world = new CellWorld(96, 96, 7); world.setActiveRegion({ x: 0, y: 0, width: 64, height: 64 });
    world.fillRect(0, 41, 96, 1, Material.Rock); world.set(30, 40, Material.Rock);
    world.set(31, 31, Material.Sand); world.set(31, 40, Material.Water); world.step();
    expect(world.get(31, 32)).toBe(Material.Sand); expect(world.get(32, 40)).toBe(Material.Water);
    for (let i = 0; i < 200; i++) world.step();
    expect(count(world, Material.Sand)).toBe(1); expect(count(world, Material.Water)).toBe(1);
    expect(Array.from(world.cells).some((m, i) => m === Material.Water && i % world.width >= 64)).toBe(false);
    world.setActiveRegion({ x: 0, y: 0, width: 96, height: 64 });
    for (let i = 0; i < 200; i++) world.step();
    expect(count(world, Material.Sand)).toBe(1); expect(count(world, Material.Water)).toBe(1);
  });
  it('pauses cross-edge reactions and both ends of density swaps until both cells are active', () => {
    const world = new CellWorld(64, 64, 4); world.fillRect(29, 19, 6, 3, Material.Rock);
    world.set(31, 20, Material.Lava); world.set(32, 20, Material.Water); world.setActiveRegion({ x: 0, y: 0, width: 32, height: 32 });
    for (let i = 0; i < 5; i++) world.step();
    expect(world.get(31, 20)).toBe(Material.Lava); expect(world.get(32, 20)).toBe(Material.Water);
    world.setActiveRegion({ x: 0, y: 0, width: 64, height: 32 }); world.step();
    expect(count(world, Material.Lava)).toBe(0); expect(count(world, Material.Steam)).toBe(1);
    const swap = new CellWorld(64, 64, 4); swap.fillRect(30, 19, 3, 4, Material.Rock); swap.set(31, 20, Material.Sand); swap.set(31, 21, Material.Water);
    swap.setActiveRegion({ x: 0, y: 0, width: 64, height: 21 }); swap.step();
    expect(swap.get(31, 20)).toBe(Material.Sand); expect(swap.get(31, 21)).toBe(Material.Water);
    swap.setActiveRegion({ x: 0, y: 0, width: 64, height: 32 }); swap.step();
    expect(swap.get(31, 21)).toBe(Material.Sand); expect(swap.get(31, 20)).toBe(Material.Water);
  });
  it('preserves far edits, remote camps and deterministic physics across save and return trips', () => {
    const run = new SurvivalRun(51), storage = new MemoryStorage(); run.enemies = []; run.resources.camp = 2;
    expect(run.place('camp', 25, 33)).toBe(true); tick(run);
    run.world.fillRect(1285, 70, 35, 14, Material.Air); run.world.fillRect(1285, 84, 35, 3, Material.Rock);
    run.player.x = 1300; run.player.y = 79; tick(run);
    expect(run.place('camp', 1290, 83)).toBe(true); tick(run);
    run.world.fillRect(1310, 76, 3, 3, Material.Wood); expect(run.mine(1310, 77)).toBe(true); expect(run.resources.wood).toBe(6);
    run.world.set(1318, 75, Material.Water); run.world.set(1317, 75, Material.Sand);
    expect(saveSurvival(run, storage).ok).toBe(true); const loaded = loadSurvival(storage).run!;
    expect(loaded.player.x).toBe(1300); expect(loaded.camp).toEqual({ x: 1290, y: 79 }); expect(loaded.structures).toEqual(run.structures);
    for (let i = 0; i < 30; i++) { run.step(1 / 60, idleInput()); loaded.step(1 / 60, idleInput()); }
    expect(bytes(loaded.world.cells, run.world.cells)).toBe(true); expect(bytes(loaded.world.life, run.world.life)).toBe(true); expect(loaded.world.rngState).toBe(run.world.rngState);
    loaded.player.x = 40; loaded.player.y = 29; tick(loaded, 60); expect(loaded.world.get(1310, 77)).toBe(Material.Air);
    loaded.player.invulnerable = 0; loaded.damage(1000, '事故'); expect(loaded.player.x).toBe(1290); expect(loaded.camp?.x).toBe(1290); expect(loaded.resources.wood).toBe(6);
  });
  it('freezes far enemies and projectiles without letting dormant bullets block new local shots', () => {
    const run = new SurvivalRun(71); const enemy = run.enemies.find(e => e.x > 1000)!;
    const before = { ...enemy }; tick(run, 100); expect(enemy).toEqual(before);
    run.projectiles = [];
    const shot = { spell: 'shard' as const, damage: 1, speed: 30, radius: 1, life: 2, blast: 0, dig: 0, fire: false, angle: 0 };
    for (let i = 0; i < 128; i++) run.addShot(shot, 1100 + i % 4, 88, 0);
    const old = structuredClone(run.projectiles); tick(run, 20); expect(run.projectiles).toEqual(old);
    run.addShot(shot, run.player.x, run.player.y - 1, 0); expect(run.projectiles).toHaveLength(128);
    expect(run.projectiles.some(p => p.x === run.player.x)).toBe(true); expect(run.projectiles.filter(p => p.x > 1000)).toHaveLength(127);
    run.player.x = 1100; run.player.y = 85; focusWorld(run.world, run.player.x, run.player.y); tick(run, 5);
    expect(run.projectiles.some(p => p.x > 1104 || p.life < 2)).toBe(true);
  });
  it('keeps terrain unchanged when an explosive projectile reaches the sleeping boundary', () => {
    const run = new SurvivalRun(91); run.enemies = []; run.projectiles = [];
    focusWorld(run.world, 40, 27); const edge = run.world.activeRegion!.x + run.world.activeRegion!.width;
    run.addShot({ spell: 'bomb', damage: 65, speed: 105, radius: 4, life: 1, blast: 23, dig: 23, fire: true, angle: 0 }, edge - 24, 26, 0);
    const saved = { ...run.projectiles[0] }, cells = run.world.cells.slice(); tick(run, 4);
    expect(run.projectiles[0]).toEqual(saved);
    // Ambient local water can move; the entire sleeping region must stay exact.
    for (let y = 0; y < run.world.height; y++) expect(bytes(run.world.cells.subarray(y * run.world.width + edge, (y + 1) * run.world.width), cells.subarray(y * run.world.width + edge, (y + 1) * run.world.width))).toBe(true);
  });
  it('keeps the last valid primary and backup when highly fragmented terrain exceeds the save budget', () => {
    const run = new SurvivalRun(63), storage = new MemoryStorage(); expect(saveSurvival(run, storage).ok).toBe(true);
    const before = new Map(storage.values);
    for (let i = 0; i < run.world.cells.length; i++) run.world.cells[i] = i % 2 ? Material.Water : Material.Rock;
    expect(saveSurvival(run, storage).ok).toBe(false); expect(storage.values).toEqual(before);
    expect(loadSurvival(storage).run).not.toBeNull();
  });
  it('supports ordinary movement and levitation across two regions and back without regenerating the base', () => {
    const run = new SurvivalRun(27); run.enemies = []; run.resources.camp = 1; expect(run.place('camp', 25, 33)).toBe(true);
    const home = { ...run.structures[0] }; run.world.set(70, 30, Material.Wood); tick(run, 30);
    function travel(target: number) {
      const direction = target > run.player.x ? 1 : -1; let lift = 0;
      for (let n = 0; n < 2400 && (target - run.player.x) * direction > 0; n++) {
        if (run.player.grounded && run.player.fuel < 95) { run.step(1 / 30, idleInput()); continue; }
        if (run.player.grounded && (Array.from({ length: 10 }, (_, i) => 4 + i * 2).some(distance => run.solid(run.player.x + direction * distance, run.player.y)) || !run.solid(run.player.x + direction * 7, run.player.y + 5))) lift = 35;
        run.step(1 / 30, { ...idleInput(), move: direction, fly: lift-- > 0 });
        expect(run.world.lastStepCells).toBeLessThanOrEqual(MAX_ACTIVE_CELLS);
      }
      expect((run.player.x - target) * direction, JSON.stringify({x:run.player.x,y:run.player.y,fuel:run.player.fuel,target})).toBeGreaterThanOrEqual(0);
    }
    travel(570); expect(surfaceAt(run.player.x)).toBeLessThan(45); travel(80);
    // The entrance tree has a wide overhang: stop outside it, refuel on the
    // ground, then rise before crossing. These are still only normal inputs.
    tick(run, 180);
    for (let i = 0; i < 45; i++) run.step(1 / 60, { ...idleInput(), fly: true });
    for (let i = 0; i < 120 && run.player.x > 40; i++) run.step(1 / 60, { ...idleInput(), move: -1, fly: true });
    expect(run.player.x).toBeLessThanOrEqual(40);
    expect(run.structures).toEqual([home]); expect(run.world.get(70, 30)).toBe(Material.Wood); expect(run.deaths).toBe(0);
  }, 20_000);
  it('rejects invalid active rectangles without changing the current physics window', () => {
    const world = new CellWorld(64, 64); world.setActiveRegion({ x: 0, y: 0, width: 32, height: 32 }); const previous = world.activeRegion;
    expect(() => world.setActiveRegion({ x: -100, y: 0, width: 1, height: 32 })).toThrow(RangeError); expect(world.activeRegion).toBe(previous);
    expect(() => world.setActiveRegion({ x: NaN, y: 0, width: 32, height: 32 })).toThrow(RangeError);
  });
});
