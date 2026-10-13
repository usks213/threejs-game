import { describe, it, expect } from 'vitest';
import { allowsAssistedFire, findCombatTarget, readCombatAssist, readCombatSnapshot } from '../../src/emberfall/combat-assist';
import { SurvivalRun } from '../../src/emberfall/survival';
import { encodeRunSnapshot } from '../../src/emberfall/save';
import { Material } from '../../src/emberfall/materials';
import { createWand, editWand } from '../../src/emberfall/wands';
describe('safe one-thumb combat assistance', () => {
  it('copies bounded snapshots on demand without exposing or mutating run state', () => {
    const run = new SurvivalRun(3397, false), view = { x: 0, y: 0, width: 160, height: 100 };
    run.enemies = Array.from({ length: 20 }, (_, id) => ({ id, x: 50, y: 25, hp: 22, maxHp: 22, kind: 'moth' as const, vx: 0, vy: 0, cooldown: 1, flash: 0 }));
    const shot = run.castSelectedWand()[0];
    run.projectiles = Array.from({ length: 30 }, () => ({ ...shot, x: 45, y: 25, vx: 10, vy: 0, enemy: false }));
    const target = { id: 0, x: 50, y: 25, aimX: 10, aimY: -4 };
    const before = encodeRunSnapshot(run), sequence = run.castSequence;
    const snapshot = readCombatSnapshot(run, view, true, target);
    expect(snapshot.enemies).toHaveLength(16); expect(snapshot.projectiles).toHaveLength(24);
    snapshot.ammo.bomb = 999; snapshot.wands[0].spells.length = 0; snapshot.wands[0].mana = 999;
    snapshot.enemies[0].hp = 0; snapshot.projectiles[0].damage = 999; snapshot.assistedTarget!.x = 999;
    expect(target.x).toBe(50); expect(run.castSequence).toBe(sequence);
    expect(encodeRunSnapshot(run)).toBe(before);
  });
  it('records one successful cast for a whole multicast, never for cooldown or mana rejection', () => {
    const run = new SurvivalRun(3397, false), wand = run.wands[0];
    editWand(wand, ['twin', 'shard', 'shard']);
    expect(run.castSelectedWand()).toHaveLength(2); expect(run.castSequence).toBe(1);
    expect(run.castSelectedWand()).toHaveLength(0); expect(run.castSequence).toBe(1);
    wand.cooldown = 0; wand.mana = 0;
    expect(run.castSelectedWand()).toHaveLength(0); expect(run.castSequence).toBe(1);
  });
  it('preserves explicit assistance preference and safely accepts old settings', () => {
    expect(readCombatAssist({ version: 1, combatAssist: false })).toBe(false);
    expect(readCombatAssist({ version: 1, combatAssist: true })).toBe(true);
    for (const value of [null, {}, { version: 1 }, { version: 1, combatAssist: 'false' }, { version: 2, combatAssist: false }]) expect(readCombatAssist(value)).toBe(false);
  });
  it('never automatically casts mining, fire, explosive or finite payload decks', () => {
    expect(allowsAssistedFire(createWand(0, 7))).toBe(true);
    expect(allowsAssistedFire(createWand(1, 7))).toBe(false);
    expect(allowsAssistedFire(createWand(2, 7))).toBe(false);
    for (const spells of [[], ['force'], ['echo', 'bomb'], ['twin', 'shard', 'ember'], ['excavate']])
      expect(allowsAssistedFire({ spells } as ReturnType<typeof createWand>)).toBe(false);
    expect(allowsAssistedFire({ spells: ['echo', 'haste', 'lance'] })).toBe(true);
  });
  it('requires a living, active, on-screen enemy within range and unobstructed sight', () => {
    const run = new SurvivalRun(3397, false); run.world.fillRect(15, 8, 180, 90, Material.Air);
    run.player.x = 40; run.player.y = 30;
    run.enemies = [{ id: 1, x: 70, y: 29, hp: 22, maxHp: 22, kind: 'moth', vx: 0, vy: 0, cooldown: 1, flash: 0 }];
    const view = { x: 0, y: 0, width: 160, height: 100 };
    expect(findCombatTarget(run, view)?.id).toBe(1);
    const before = run.world.cells.slice(); const mana = run.wands[0].mana;
    for (let i = 0; i < 20; i++) findCombatTarget(run, view);
    expect(run.world.cells.every((cell, i) => cell === before[i])).toBe(true); expect(run.wands[0].mana).toBe(mana);
    run.world.fillRect(55, 10, 2, 50, Material.Rock); expect(findCombatTarget(run, view)).toBeNull();
    run.world.fillRect(55, 10, 2, 50, Material.Air);
    expect(findCombatTarget(run, { ...view, width: 65 })).toBeNull();
    run.enemies[0].x = 120; expect(findCombatTarget(run, view)).toBeNull();
    run.enemies[0].x = 70; run.enemies[0].hp = 0; expect(findCombatTarget(run, view)).toBeNull();
    run.enemies[0].hp = 22; run.world.activeRegion = { x: 0, y: 0, width: 64, height: 64 };
    expect(findCombatTarget(run, view)).toBeNull();
  });
});
