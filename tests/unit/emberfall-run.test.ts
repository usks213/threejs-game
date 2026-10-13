import { describe, expect, it } from 'vitest';
import { generateLevel } from '../../src/emberfall/generation';
import { CellWorld, Material, MATERIALS } from '../../src/emberfall/materials';
import { Run, idleInput } from '../../src/emberfall/simulation';
import type { Perk, Projectile } from '../../src/emberfall/simulation';

function arena(seed = 12): Run {
  const run = new Run(seed);
  run.world = new CellWorld(96, 96, seed);
  run.world.fillRect(0, 80, 96, 16, Material.HardRock);
  run.player.x = 20; run.player.y = 75;
  run.enemies = []; run.portal = { x: 85, y: 75 };
  return run;
}
function ticks(run: Run, n: number, input = idleInput()): void {
  for (let i = 0; i < n; i++) run.step(1 / 60, input);
}
function enemy(run: Run, x: number, y: number, kind: 'crawler' | 'sentry' | 'warden' = 'sentry') {
  run.setEnemies([{ x, y, kind }]);
  return run.enemies[0];
}
function shot(x: number, y: number, overrides: Partial<Projectile> = {}): Projectile {
  return { x, y, vx: 210, vy: 0, spell: 'shard', damage: 13, speed: 210, radius: 2, life: 1, blast: 0, dig: 0, fire: false, angle: 0, enemy: false, ...overrides };
}
function grant(run: Run, perk: Perk) {
  run.enterRefuge(); run.perkOffers = [perk];
  expect(run.choosePerk(perk)).toBe(true);
}

/** Clearance flood-fill for the actual 5×9-cell actor, not a point agent. */
function hasDownhillRoute(world: CellWorld, start: { x: number; y: number }, end: { x: number; y: number }): boolean {
  const stride = world.width + 1;
  const sums = new Uint32Array(stride * (world.height + 1));
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
    const index = (y + 1) * stride + x + 1;
    sums[index] = Number(MATERIALS[world.get(x, y)].solid) + sums[index - 1] + sums[index - stride] - sums[index - stride - 1];
  }
  const clear = (x: number, y: number): boolean => {
    if (x < 2 || x + 2 >= world.width || y < 4 || y + 4 >= world.height) return false;
    const left = x - 2, right = x + 3, top = y - 4, bottom = y + 5;
    return sums[bottom * stride + right] - sums[top * stride + right] - sums[bottom * stride + left] + sums[top * stride + left] === 0;
  };
  const visited = new Uint8Array(world.width * world.height);
  const queue = new Int32Array(visited.length);
  let head = 0, tail = 1; queue[0] = start.y * world.width + start.x; visited[queue[0]] = 1;
  while (head < tail) {
    const index = queue[head++], x = index % world.width, y = Math.floor(index / world.width);
    if (Math.hypot(x - end.x, y - end.y) < 10) return true;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1]]) {
      const nx = x + dx, ny = y + dy, next = ny * world.width + nx;
      if (clear(nx, ny) && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
    }
  }
  return false;
}

describe('generated journey', () => {
  it('has player-width downhill paths from the start to each portal across seeds', () => {
    for (const seed of [1, 2, 7, 42, 2026, 0x7fffffff]) for (let level = 0; level < 3; level++) {
      const map = generateLevel(seed, level);
      expect(hasDownhillRoute(map.world, map.spawn, map.portal), `seed ${seed}, level ${level}`).toBe(true);
      for (const e of map.enemies) expect(MATERIALS[map.world.get(e.x, e.y)].solid).toBe(false);
    }
  });

  it('is deterministic but distinct across seeds and biomes', () => {
    expect(generateLevel(42, 0).world.cells).toEqual(generateLevel(42, 0).world.cells);
    expect(generateLevel(42, 0).world.cells).not.toEqual(generateLevel(43, 0).world.cells);
    expect(generateLevel(42, 1).world.cells).not.toEqual(generateLevel(42, 0).world.cells);
    expect(generateLevel(42, 2).enemies.some(e => e.kind === 'warden')).toBe(true);
  });
});

describe('actor, combat, and hazards', () => {
  it('stops fast actors at thin walls and supports floor/fuel recovery', () => {
    const run = arena(); run.world.fillRect(30, 0, 1, 80, Material.HardRock);
    run.player.vx = 300; run.moveBody(run.player, 1 / 30);
    expect(run.player.x).toBeLessThan(28);
    run.player.fuel = 20; ticks(run, 120);
    expect(run.player.grounded).toBe(true);
    expect(run.player.fuel).toBe(100);
    expect(run.collides(run.player.x, run.player.y)).toBe(false);
  });

  it('cannot shoot through an adjacent wall or damage a nearby target behind it', () => {
    const run = arena();
    run.world.fillRect(23, 0, 1, 80, Material.HardRock);
    const target = enemy(run, 26, 75); target.cooldown = 99;
    ticks(run, 90, { ...idleInput(), fire: true });
    expect(target.hp).toBe(target.maxHp); expect(run.player.hp).toBe(100);
    expect(run.lineOfSight(20, 74, 26, 74)).toBe(false);
  });

  it('supports held-fire combat, enemy defeat, and collectible gold', () => {
    const run = arena(); const target = enemy(run, 44, 75); target.cooldown = 99;
    ticks(run, 100, { ...idleInput(), fire: true });
    expect(run.kills).toBe(1); expect(run.enemies).toHaveLength(0);
    expect(run.loot).toHaveLength(1);
    run.player.x = run.loot[0].x; ticks(run, 1);
    expect(run.gold).toBe(15);
  });

  it('applies explosive damage once on a direct hit', () => {
    const run = arena(); const target = enemy(run, 48, 75); target.cooldown = 99;
    target.hp = target.maxHp = 200;
    run.projectiles.push(shot(44, 75, { damage: 65, blast: 8 }));
    ticks(run, 1);
    expect(target.hp).toBe(135);
  });

  it('blocks hostile projectiles at solid terrain', () => {
    const run = arena(); run.world.fillRect(25, 0, 1, 80, Material.HardRock);
    run.projectiles.push(shot(30, 75, { enemy: true, vx: -210 }));
    ticks(run, 8); expect(run.player.hp).toBe(100); expect(run.projectiles).toHaveLength(0);
  });

  it('awards gold ore only when a strong enough hit actually mines it', () => {
    const run = arena(); run.world.fillRect(50, 50, 3, 3, Material.Gold);
    run.impact(shot(51, 51, { dig: 1 })); expect(run.loot).toHaveLength(0);
    run.impact(shot(51, 51, { dig: 3 }));
    expect(run.world.get(51, 51)).toBe(Material.Air);
    expect(run.loot).toEqual([{ x: 51, y: 51, value: 18 }]);
    run.impact(shot(51, 51, { dig: 3 })); expect(run.loot).toHaveLength(1);
  });

  it('registers ankle-deep lava and clean water removes burning', () => {
    const run = arena(); run.world.fillRect(18, 79, 5, 1, Material.Lava);
    ticks(run, 1); expect(run.player.hp).toBeLessThan(100); expect(run.player.burning).toBeGreaterThan(0);
    run.world.fillRect(18, 70, 5, 10, Material.Water);
    ticks(run, 1); expect(run.player.burning).toBe(0); expect(run.player.wet).toBe(5);
  });

  it('poisons and suffocates submerged actors', () => {
    const run = arena(); run.world.fillRect(0, 0, 96, 80, Material.Toxic);
    run.player.oxygen = 0; ticks(run, 1);
    expect(run.player.toxic).toBe(3); expect(run.player.hp).toBeLessThan(99.9);
  });

  it('does not attack, heal, collect loot, or win after a lethal hit in the same tick', () => {
    const run = arena(); run.level = 2; run.portal = { x: run.player.x, y: run.player.y };
    run.player.hp = 0.01; run.player.burning = 2; run.loot = [{ x: 20, y: 75, value: 50 }];
    ticks(run, 1, { ...idleInput(), fire: true, interact: true });
    expect(run.phase).toBe('dead'); expect(run.player.hp).toBe(0); expect(run.gold).toBe(0);
    expect(run.projectiles).toHaveLength(0); expect(run.enterRefuge()).toBe(false);
    ticks(run, 100); expect(run.time).toBe(1 / 60);
  });

  it('ignores invalid time and damage without corrupting the run', () => {
    const run = arena(); run.step(NaN, idleInput()); run.step(-1, idleInput()); run.damage(NaN, 'bad'); run.damage(-30, 'bad');
    expect(run.player.hp).toBe(100); expect(run.time).toBe(0); expect(run.player.x).toBe(20);
  });
});

describe('refuge, progression, and all six perks', () => {
  it('pauses in the refuge, restores resources, and requires a perk before descending', () => {
    const run = arena(); run.player.hp = 15; run.flask = 0; run.wands[1].charges.bomb = 0;
    expect(run.enterRefuge()).toBe(true); expect(run.phase).toBe('refuge');
    expect(run.player.hp).toBe(100); expect(run.flask).toBe(180); expect(run.wands[1].charges.bomb).toBe(6);
    ticks(run, 20); expect(run.time).toBe(0);
    expect(run.descend()).toBe(false);
    expect(run.choosePerk(run.perkOffers[0])).toBe(true);
    expect(run.choosePerk(run.perkOffers[0])).toBe(false);
    expect(run.descend()).toBe(true); expect(run.level).toBe(1); expect(run.phase).toBe('playing');
    expect(run.enemies.length).toBeGreaterThan(0); expect(run.player.grounded).toBe(false);
  });

  it('heart increases maximum and current health exactly once', () => {
    const run = arena(); grant(run, 'heart');
    expect(run.player.maxHp).toBe(125); expect(run.player.hp).toBe(125);
    expect(run.choosePerk('heart')).toBe(false); expect(run.player.maxHp).toBe(125);
  });
  it('reservoir expands and fills every owned wand', () => {
    const run = arena(); const before = run.wands.map(w => w.maxMana); grant(run, 'reservoir');
    run.wands.forEach((w, i) => { expect(w.maxMana).toBe(before[i] + 40); expect(w.mana).toBe(w.maxMana); });
  });
  it('ascent expands flight fuel by 35 percent', () => {
    const run = arena(); grant(run, 'ascent'); expect(run.player.maxFuel).toBe(135); expect(run.player.fuel).toBe(135);
  });
  it('heat reduces fire damage by 70 percent', () => {
    const plain = arena(), protectedRun = arena(); grant(protectedRun, 'heat'); protectedRun.phase = 'playing';
    plain.player.burning = protectedRun.player.burning = 3;
    ticks(plain, 10); ticks(protectedRun, 10);
    expect(100 - protectedRun.player.hp).toBeCloseTo((100 - plain.player.hp) * 0.3);
  });
  it('magnet attracts distant coins outside the ordinary range', () => {
    const plain = arena(), magnetic = arena(); grant(magnetic, 'magnet'); magnetic.phase = 'playing';
    plain.loot = [{ x: 55, y: 75, value: 15 }]; magnetic.loot = [{ x: 55, y: 75, value: 15 }];
    ticks(plain, 90); ticks(magnetic, 90);
    expect(plain.gold).toBe(0); expect(magnetic.gold).toBe(15);
  });
  it('workshop permits owned-spell editing in caves without giving free charges', () => {
    const run = arena(); expect(run.editSelectedWand(['ember'])).toBe(false);
    grant(run, 'workshop'); run.phase = 'playing'; run.wands[0].mana = 4;
    expect(run.editSelectedWand(['ember'])).toBe(true); expect(run.wands[0].mana).toBe(4);
    expect(run.editRunWand(1, ['excavate', 'bomb'])).toBe(true);
    expect(run.selected).toBe(0); expect(run.editRunWand(-1, ['shard'])).toBe(false);
    expect(run.editSelectedWand(['lance'])).toBe(false);
    run.phase = 'dead'; expect(run.canEditWands()).toBe(false);
  });
  it('checks shop prices and the final warden gate', () => {
    const run = arena(); run.enterRefuge(); run.gold = 35;
    expect(run.buySpell('lance', 1)).toBe(false); expect(run.buySpell('lance', 35)).toBe(true);
    expect(run.gold).toBe(0); expect(run.buySpell('lance', 35)).toBe(false);
    run.phase = 'playing'; run.level = 2; enemy(run, 50, 75, 'warden');
    expect(run.enterRefuge()).toBe(false); run.enemies = [];
    expect(run.enterRefuge()).toBe(true); expect(run.phase).toBe('won');
  });
});
