import { describe, expect, it } from 'vitest';
import { CellWorld, MATERIALS, Material } from '../../src/emberfall/materials';

function count(world: CellWorld, material: Material): number {
  let result = 0;
  for (const cell of world.cells) if (cell === material) result++;
  return result;
}
function step(world: CellWorld, ticks: number): void {
  for (let i = 0; i < ticks; i++) world.step();
}
function box(width = 24, height = 24, seed = 17): CellWorld {
  const world = new CellWorld(width, height, seed);
  world.fillRect(0, 0, width, 1, Material.HardRock);
  world.fillRect(0, height - 1, width, 1, Material.HardRock);
  world.fillRect(0, 0, 1, height, Material.HardRock);
  world.fillRect(width - 1, 0, 1, height, Material.HardRock);
  return world;
}

describe('Emberfall cellular materials', () => {
  it('has stable numeric materials and complete render metadata', () => {
    expect(Material.Air).toBe(0);
    expect(Material.Gold).toBe(12);
    expect(MATERIALS).toHaveLength(13);
    for (const info of MATERIALS) expect(info.color.every((v) => v >= 0 && v <= 255)).toBe(true);
  });

  it('treats out-of-bounds coordinates as immutable hard rock', () => {
    const world = new CellWorld(8, 8);
    for (const [x, y] of [[-1, 0], [0, -1], [8, 0], [0, 8], [NaN, 0]]) {
      world.set(x, y, Material.Water);
      expect(world.get(x, y)).toBe(Material.HardRock);
    }
    expect(count(world, Material.Water)).toBe(0);
    expect(() => new CellWorld(1537, 768)).toThrow(RangeError);
  });

  it('tracks only changed 16×16 chunks after the initial upload', () => {
    const world = new CellWorld(33, 33);
    expect(world.dirty.size).toBe(9);
    world.dirty.clear();
    world.set(17, 18, Material.Wood);
    expect([...world.dirty]).toEqual([4]);
    world.dirty.clear();
    world.set(17, 18, Material.Wood);
    expect(world.dirty.size).toBe(0);
  });

  it('moves a particle at most once in one tick', () => {
    const world = box();
    world.set(10, 2, Material.Sand);
    world.step();
    expect(world.get(10, 3)).toBe(Material.Sand);
    expect(count(world, Material.Sand)).toBe(1);
    world.set(5, 20, Material.Smoke);
    world.step();
    expect(world.get(5, 19)).toBe(Material.Smoke);
  });

  it('settles sand onto floors and conserves inert material', () => {
    const world = box();
    world.fillRect(7, 2, 8, 5, Material.Sand);
    world.fillRect(2, 12, 16, 4, Material.Water);
    step(world, 240);
    expect(count(world, Material.Sand)).toBe(40);
    expect(count(world, Material.Water)).toBe(64);
    expect(world.get(10, 22)).toBe(Material.Sand);
    expect(count(world, Material.HardRock)).toBe(92);
  });

  it('spreads liquid sideways while leaving no gaps below it', () => {
    const world = box(12, 12);
    world.fillRect(4, 1, 1, 8, Material.Water);
    step(world, 80);
    expect(count(world, Material.Water)).toBe(8);
    let floorWater = 0;
    for (let x = 1; x < 11; x++) if (world.get(x, 10) === Material.Water) floorWater++;
    expect(floorWater).toBe(8);
  });

  it('sorts heavier sand and water beneath oil without losing mass', () => {
    const world = box(5, 12);
    world.fillRect(1, 7, 3, 4, Material.Oil);
    world.fillRect(1, 3, 3, 4, Material.Water);
    world.set(2, 2, Material.Sand);
    step(world, 140);
    expect(count(world, Material.Oil)).toBe(12);
    expect(count(world, Material.Water)).toBe(12);
    expect(count(world, Material.Sand)).toBe(1);
    expect(world.get(2, 10)).toBe(Material.Sand);
    expect(world.get(1, 9)).toBe(Material.Water);
  });

  it('ignites both wood and oil and eventually exhausts fuel', () => {
    const world = box(12, 12);
    world.set(5, 8, Material.Fire);
    world.set(4, 8, Material.Wood);
    world.set(6, 8, Material.Oil);
    // Prevent oil falling away before the neighboring flame is processed.
    world.set(6, 9, Material.HardRock);
    world.set(7, 9, Material.HardRock);
    world.set(7, 8, Material.HardRock);
    world.set(5, 9, Material.HardRock);
    world.step();
    expect(count(world, Material.Wood)).toBe(0);
    expect(count(world, Material.Oil)).toBe(0);
    expect(count(world, Material.Fire)).toBe(3);
    step(world, 240);
    expect(count(world, Material.Fire)).toBe(0);
    expect(count(world, Material.Smoke)).toBe(0);
  });

  it('water extinguishes flames into steam and smoke', () => {
    const world = box(9, 9);
    world.set(4, 5, Material.Fire);
    world.set(4, 4, Material.Water);
    world.step();
    expect(count(world, Material.Fire)).toBe(0);
    expect(count(world, Material.Steam)).toBe(1);
    expect(count(world, Material.Smoke)).toBe(1);
  });

  it('water purifies toxic liquid while retaining the total liquid volume', () => {
    const world = box(9, 9);
    world.fillRect(2, 5, 4, 3, Material.Toxic);
    world.set(3, 4, Material.Water);
    step(world, 50);
    expect(count(world, Material.Toxic)).toBe(0);
    expect(count(world, Material.Water)).toBe(13);
  });

  it.each([Material.Water, Material.Toxic])('cools lava with material %i into rock and steam', (coolant) => {
    const world = box(9, 9);
    world.set(4, 6, Material.Lava);
    world.set(4, 5, coolant);
    world.step();
    expect(count(world, Material.Lava)).toBe(0);
    expect(count(world, Material.Rock)).toBe(1);
    expect(count(world, Material.Steam)).toBe(1);
    step(world, 110);
    expect(count(world, Material.Steam)).toBe(0);
    expect(count(world, Material.Water)).toBe(1);
  });

  it('carves by hardness without breaching hard rock or the world rim', () => {
    const world = new CellWorld(9, 9);
    world.fillRect(0, 0, 9, 9, Material.Rock);
    world.set(3, 4, Material.Wood);
    world.set(4, 4, Material.Sand);
    world.set(5, 4, Material.Gold);
    world.set(4, 3, Material.HardRock);
    expect(world.carveCircle(4, 4, 2, 1)).toBe(2);
    expect(world.carveCircle(4, 4, 2, 3)).toBe(1);
    expect(world.get(4, 3)).toBe(Material.HardRock);
    world.carveCircle(4, 4, 20, 100);
    expect(count(world, Material.Rock)).toBe(32);
    expect(world.get(4, 3)).toBe(Material.HardRock);
  });

  it('replays identically and resumes from saved cells, life, tick, and RNG', () => {
    const a = box(32, 32, 12345);
    const b = box(32, 32, 12345);
    for (const world of [a, b]) {
      world.fillRect(3, 4, 10, 3, Material.Sand);
      world.fillRect(12, 16, 8, 4, Material.Water);
      world.fillRect(20, 12, 6, 2, Material.Oil);
      world.set(21, 13, Material.Fire);
      step(world, 30);
    }
    expect(a.cells).toEqual(b.cells);
    expect(a.life).toEqual(b.life);
    expect(a.rngState).toBe(b.rngState);
    const restored = new CellWorld(32, 32);
    restored.cells.set(a.cells); restored.life.set(a.life);
    restored.tick = a.tick; restored.rngState = a.rngState;
    step(a, 70); step(restored, 70);
    expect(restored.cells).toEqual(a.cells);
    expect(restored.life).toEqual(a.life);
    expect(restored.rngState).toBe(a.rngState);
  });
});
