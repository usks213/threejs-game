import { describe, expect, it } from 'vitest';
import { MAX_LOOSE_SPELLS, SPELL_PRICES } from '../../src/emberfall/inventory';
import { Material } from '../../src/emberfall/materials';
import { idleInput, Run } from '../../src/emberfall/simulation';
import { tickWand } from '../../src/emberfall/wands';
import type { SpellId } from '../../src/emberfall/wands';

function cards(run: Run): SpellId[] {
  return [...run.spells, ...run.wands.flatMap(wand => wand.spells), ...run.wandPickups.flatMap(pickup => pickup.wand.spells)].sort();
}
function inventory(run: Run) {
  return structuredClone({ spells: run.spells, wands: run.wands, pickups: run.wandPickups, gold: run.gold, stock: run.shopStock, ammo: run.ammo });
}
function reachCache(run: Run): void {
  for (let frame = 0; frame < 120 && run.player.x < 66; frame++) run.step(1 / 60, { ...idleInput(), move: 1 });
  for (let frame = 0; frame < 90; frame++) run.step(1 / 60, idleInput());
}

describe('finite owned spell cards', () => {
  it('starts with one loose ember and distinct equipped starter copies', () => {
    const run = new Run(1);
    expect(run.spells).toEqual(['ember']);
    expect(run.wands[0].spells).toEqual(['shard', 'shard']);
    expect(run.wands[1].spells).toEqual(['excavate', 'bomb']);
  });
  it('rejects overdraw, unknown cards, excess slots, and an invalid wand atomically', () => {
    const run = new Run(2); run.enterRefuge(); const before = inventory(run);
    for (const replacement of [['shard', 'shard', 'shard'], ['ember', 'ember'], ['pebble'], ['unknown'], Array(7).fill('shard')] as SpellId[][]) {
      expect(run.editRunWand(0, replacement)).toBe(false); expect(inventory(run)).toEqual(before);
    }
    for (const index of [-1, 2, 0.5, NaN]) { expect(run.editRunWand(index, [])).toBe(false); expect(inventory(run)).toEqual(before); }
  });
  it('returns removed copies and consumes exactly the replacement multiset', () => {
    const run = new Run(2); run.enterRefuge(); const all = cards(run);
    expect(run.editRunWand(0, ['shard', 'ember'])).toBe(true);
    expect(run.spells).toEqual(['shard']);
    expect(run.editRunWand(1, ['shard', 'bomb'])).toBe(true);
    expect(run.spells).toEqual(['excavate']); expect(cards(run)).toEqual(all);
    expect(run.editRunWand(1, ['ember'])).toBe(false);
    expect(run.editRunWand(0, [])).toBe(true);
    expect(run.editRunWand(1, ['ember'])).toBe(true); expect(cards(run)).toEqual(all);
  });
  it('preserves card conservation across repeated reorder, remove, and failed replacement', () => {
    const run = new Run(8); run.enterRefuge(); const all = cards(run);
    for (let attempt = 0; attempt < 150; attempt++) {
      const index = attempt % 2;
      const available = [...run.spells, ...run.wands[index].spells];
      const replacement = available.slice(0, attempt % (run.wands[index].capacity + 1)).reverse();
      expect(run.editRunWand(index, replacement)).toBe(true); expect(cards(run)).toEqual(all);
      const before = inventory(run);
      expect(run.editRunWand(index, ['lance'])).toBe(false); expect(inventory(run)).toEqual(before);
    }
  });
  it('bounds loose-card capacity without losing removed equipment or money', () => {
    const run = new Run(3); run.enterRefuge(); run.spells = Array(MAX_LOOSE_SPELLS).fill('pebble'); run.gold = 100;
    const before = inventory(run);
    expect(run.editRunWand(0, [])).toBe(false);
    expect(run.buySpell('ember', SPELL_PRICES.ember)).toBe(false); expect(inventory(run)).toEqual(before);
  });
  it('sells two physical copies per type per refuge and refreshes only on descent', () => {
    const run = new Run(3); run.enterRefuge(); run.gold = 500;
    const all = cards(run); const before = inventory(run);
    expect(run.buySpell('lance', 1)).toBe(false); expect(inventory(run)).toEqual(before);
    expect(run.buySpell('lance', SPELL_PRICES.lance)).toBe(true);
    expect(run.buySpell('lance', SPELL_PRICES.lance)).toBe(true);
    expect(run.spells.filter(id => id === 'lance')).toHaveLength(2);
    expect(cards(run)).toEqual([...all, 'lance', 'lance'].sort());
    const soldOut = inventory(run);
    expect(run.buySpell('lance', SPELL_PRICES.lance)).toBe(false); expect(inventory(run)).toEqual(soldOut);
    expect(run.enterRefuge()).toBe(false); expect(run.shopStock.lance).toBe(0);
    run.choosePerk(run.perkOffers[0]); expect(run.descend()).toBe(true); expect(run.shopStock.lance).toBe(2);
    expect(run.buySpell('lance', SPELL_PRICES.lance)).toBe(false);
  });
});

describe('ordinary world wand exchanges', () => {
  it.each([3397, 1, 7, 42, 2026])('seed %i reaches and exchanges the grounded entrance cache with movement alone', seed => {
    const run = new Run(seed); expect(run.nearbyWand()).toBeUndefined(); reachCache(run);
    expect(run.player.grounded).toBe(true); expect(run.player.y).toBeLessThan(31);
    const pickup = run.nearbyWand()!; expect(pickup).toBeDefined();
    expect(pickup.wand.shuffle).toBe(true);
    expect(pickup.wand.spells).toEqual(['echo', 'twin', 'pebble', 'shard', 'haste']);
    const all = cards(run), starter = run.wands[0], found = pickup.wand;
    expect(run.exchangeWand(pickup.id, 0)).toBe(true);
    expect(run.wands[0]).toBe(found); expect(pickup.wand).toBe(starter);
    expect(run.exchangeWand(pickup.id, 0)).toBe(true); expect(run.wands[0]).toBe(starter);
    expect(run.wands).toHaveLength(2); expect(cards(run)).toEqual(all);
  });
  it('preserves mana, cursor, RNG, cooldown, and the full dropped card deck on repeated swaps', () => {
    const run = new Run(3397); reachCache(run);
    const pickup = run.nearbyWand()!; run.wands[0].mana = 17; run.wands[0].cursor = 1; run.wands[0].cooldown = 0.33;
    const before = inventory(run);
    for (let i = 0; i < 20; i++) expect(run.exchangeWand(pickup.id, 0)).toBe(true);
    expect(inventory(run)).toEqual(before);
  });
  it('rejects remote, obstructed, counterfeit, invalid-slot, and terminal-phase pickups without mutation', () => {
    const run = new Run(3397), id = run.wandPickups[0].id;
    expect(run.exchangeWand(id, 0)).toBe(false); reachCache(run);
    const before = inventory(run);
    expect(run.exchangeWand('counterfeit', 0)).toBe(false);
    for (const index of [-1, 2, NaN, 0.5]) expect(run.exchangeWand(id, index)).toBe(false);
    run.world.fillRect(73, 0, 1, 40, Material.HardRock);
    expect(run.nearbyWand()).toBeUndefined(); expect(run.exchangeWand(id, 0)).toBe(false);
    run.phase = 'dead'; expect(run.exchangeWand(id, 0)).toBe(false); expect(inventory(run)).toEqual(before);
  });
  it('gives each layer a distinct cache and applies reservoir once to all physical wands', () => {
    const run = new Run(4), id = run.wandPickups[0].id;
    run.enterRefuge(); run.perkOffers = ['reservoir']; run.choosePerk('reservoir');
    expect(run.wandPickups[0].wand.maxMana).toBe(150);
    run.descend(); expect(run.wandPickups[0].id).not.toBe(id); expect(run.wandPickups).toHaveLength(1);
    expect(run.wandPickups[0].wand.maxMana).toBe(150);
  });
});

describe('run-wide limited ammunition', () => {
  it('cannot refill bombs by transferring cards, buying copies, or swapping physical wands', () => {
    const run = new Run(3397); reachCache(run); run.enterRefuge(); run.perkOffers = ['workshop']; run.choosePerk('workshop');
    run.gold = 100; expect(run.buySpell('bomb', SPELL_PRICES.bomb)).toBe(true);
    run.phase = 'playing'; expect(run.editRunWand(1, ['bomb'])).toBe(true); run.selected = 1;
    for (let shot = 0; shot < 6; shot++) {
      tickWand(run.wands[run.selected], 10);
      expect(run.castSelectedWand().map(child => child.spell)).toEqual(['bomb']);
      expect(run.ammo.bomb).toBe(5 - shot);
      expect(run.editRunWand(run.selected, [])).toBe(true); run.selected = 1 - run.selected;
      expect(run.editRunWand(run.selected, ['bomb'])).toBe(true);
    }
    const pickup = run.nearbyWand()!;
    expect(run.exchangeWand(pickup.id, run.selected)).toBe(true);
    expect(run.editRunWand(run.selected, ['bomb'])).toBe(true); tickWand(run.wands[run.selected], 10);
    expect(run.castSelectedWand()).toEqual([]); expect(run.ammo.bomb).toBe(0);
    expect([...run.wands, pickup.wand].map(wand => wand.charges.bomb)).toEqual([0, 0, 0]);
    expect(run.enterRefuge()).toBe(true); expect(run.ammo.bomb).toBe(6);
    expect([...run.wands, pickup.wand].map(wand => wand.charges.bomb)).toEqual([6, 6, 6]);
  });
  it('does not consume the shared reserve on mana-starved or cooldown-blocked casts', () => {
    const run = new Run(3); run.enterRefuge(); run.editRunWand(1, ['bomb']); run.phase = 'playing'; run.selected = 1;
    run.wands[1].mana = 0; expect(run.castSelectedWand()).toEqual([]); expect(run.ammo.bomb).toBe(6);
    run.wands[1].mana = 130; run.wands[1].cooldown = 0.1;
    expect(run.castSelectedWand()).toEqual([]); expect(run.ammo.bomb).toBe(6);
  });
});

it('uses acquired finite cache cards and a bought modifier for a prepaid two-shot trigger at the actual impact', () => {
  const run = new Run(3397); reachCache(run);
  const pickup = run.nearbyWand()!; expect(run.exchangeWand(pickup.id, 1)).toBe(true);
  run.enterRefuge(); run.gold = SPELL_PRICES.force;
  expect(run.buySpell('force', SPELL_PRICES.force)).toBe(true);
  expect(run.editRunWand(1, [])).toBe(true);
  expect(run.editRunWand(0, ['echo', 'force', 'twin', 'pebble', 'shard'])).toBe(true);
  const all = cards(run); run.phase = 'playing';
  const mana = run.wands[0].mana, shots = run.castSelectedWand();
  expect(shots).toHaveLength(1); expect(shots[0].spell).toBe('echo');
  expect(shots[0].trigger?.map(shot => [shot.spell, shot.damage])).toEqual([['pebble', 28], ['shard', 24]]);
  expect(run.wands[0].mana).toBe(mana - 31); expect(run.wands[0].cursor).toBe(5);
  expect(run.projectiles).toHaveLength(0);
  run.addShot(shots[0], run.player.x, run.player.y - 1, 0);
  for (let frame = 0; frame < 120 && !run.lastTriggerImpact; frame++) run.step(1 / 60, idleInput());
  const impact = run.lastTriggerImpact!; expect(impact).not.toBeNull(); expect(impact.sequence).toBe(1);
  expect(Math.hypot(impact.x - impact.playerX, impact.y - impact.playerY)).toBeGreaterThan(8);
  expect(impact.payload.map(shot => [shot.spell, shot.damage])).toEqual([['pebble', 28], ['shard', 24]]);
  for (const child of impact.payload) expect(Math.hypot(child.x - impact.x, child.y - impact.y)).toBeLessThanOrEqual(3);
  expect(cards(run)).toEqual(all); expect(run.ammo.bomb).toBe(6);
});
