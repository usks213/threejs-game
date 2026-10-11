import { describe, expect, it } from 'vitest';
import { castWand, createWand, editWand, resetWand, SPELLS, tickWand } from '../../src/emberfall/wands';
import type { SpellId, Wand } from '../../src/emberfall/wands';

function prepared(spells: SpellId[]): Wand {
  const wand = createWand(0, 421);
  wand.capacity = 16;
  wand.maxMana = wand.mana = 1000;
  editWand(wand, spells);
  return wand;
}
function ready(wand: Wand): void { tickWand(wand, wand.cooldown); }

describe('emberfall spell decks', () => {
  it('has ten original spells and three distinct wands with independent state', () => {
    expect(Object.keys(SPELLS)).toHaveLength(10);
    const wands = [createWand(0, 1), createWand(1, 1), createWand(2, 1)];
    expect(new Set(wands.map(w => w.name)).size).toBe(3);
    expect(wands.map(w => w.shuffle)).toEqual([false, false, true]);
    wands[0].spells.pop();
    expect(createWand(0, 1).spells).toHaveLength(2);
  });
  it('ordered cards advance once with cast delay, then recharge at deck end', () => {
    const wand = prepared(['shard', 'lance']);
    expect(castWand(wand).map(s => s.spell)).toEqual(['shard']);
    expect(wand.cooldown).toBe(wand.castDelay);
    expect(castWand(wand)).toEqual([]);
    expect(wand.cursor).toBe(1);
    ready(wand);
    expect(castWand(wand)[0].spell).toBe('lance');
    expect(wand.cooldown).toBe(wand.recharge);
    ready(wand);
    expect(castWand(wand)[0].spell).toBe('shard');
  });
  it('regenerates and clamps mana, rejects invalid delta times', () => {
    const wand = prepared(['shard']);
    wand.mana = 0; wand.cooldown = 2;
    tickWand(wand, 0.5);
    expect(wand.mana).toBe(wand.regen * 0.5);
    expect(wand.cooldown).toBe(1.5);
    const before = { ...wand };
    for (const dt of [-1, NaN, Infinity]) tickWand(wand, dt);
    expect(wand).toEqual(before);
    tickWand(wand, 100);
    expect(wand.mana).toBe(wand.maxMana);
    expect(wand.cooldown).toBe(0);
  });
  it('enforces mana atomically without losing a spell', () => {
    const wand = prepared(['force', 'lance']);
    wand.mana = 27;
    const before = structuredClone(wand);
    expect(castWand(wand)).toEqual([]);
    expect(wand).toEqual(before);
    wand.mana = 28;
    expect(castWand(wand)[0].damage).toBe(47);
    expect(wand.mana).toBe(0);
  });
  it('modifiers apply to the casting block without leaking into the next cast', () => {
    const wand = prepared(['force', 'haste', 'twin', 'shard', 'pebble', 'shard']);
    const shots = castWand(wand);
    expect(shots.map(s => s.damage)).toEqual([24, 28]);
    expect(shots[0].speed).toBe(294);
    ready(wand);
    expect(castWand(wand)[0]).toMatchObject({ spell: 'shard', damage: 13, speed: 210 });
  });
  it('multicast reads subsequent cards and never repeats a card or wraps mid-cast', () => {
    const wand = prepared(['twin', 'shard', 'ember', 'twin', 'lance']);
    expect(castWand(wand).map(s => s.spell)).toEqual(['shard', 'ember']);
    ready(wand);
    expect(castWand(wand).map(s => s.spell)).toEqual(['lance']);
    expect(wand.cursor).toBe(5);
  });
  it('trigger stores a prepaid payload instead of firing it immediately', () => {
    const wand = prepared(['echo', 'force', 'lance', 'shard']);
    const shots = castWand(wand);
    expect(shots).toHaveLength(1);
    expect(shots[0].spell).toBe('echo');
    expect(shots[0].trigger).toHaveLength(1);
    expect(shots[0].trigger![0]).toMatchObject({ spell: 'lance', damage: 47 });
    expect(wand.mana).toBe(962);
    expect(wand.cursor).toBe(3);
    ready(wand);
    expect(castWand(wand)[0].damage).toBe(13);
  });
  it('does not fire an unpaid trigger or spend its limited ammo', () => {
    const wand = prepared(['echo', 'bomb']);
    wand.mana = 27;
    const before = structuredClone(wand);
    expect(castWand(wand)).toEqual([]);
    expect(wand).toEqual(before);
    wand.mana = 28;
    expect(castWand(wand)[0].trigger![0].blast).toBeGreaterThan(0);
    expect(wand.charges.bomb).toBe(5);
  });
  it('shuffle is deterministic and draws each card without replacement per deck', () => {
    const spells: SpellId[] = ['shard', 'ember', 'lance', 'excavate', 'pebble'];
    const a = createWand(2, 531), b = createWand(2, 531);
    editWand(a, spells); editWand(b, spells);
    for (let round = 0; round < 3; round++) {
      const drawn: SpellId[] = [];
      for (let i = 0; i < spells.length; i++) {
        a.mana = b.mana = 1000;
        const x = castWand(a), y = castWand(b);
        expect(x).toEqual(y);
        drawn.push(x[0].spell);
        ready(a); ready(b);
      }
      expect([...drawn].sort()).toEqual([...spells].sort());
    }
  });
  it('limited charges survive ordinary reload, time and edit; only refuge reset restores them', () => {
    const wand = prepared(['bomb']);
    for (let i = 0; i < 6; i++) { expect(castWand(wand)).toHaveLength(1); ready(wand); }
    expect(wand.charges.bomb).toBe(0);
    expect(castWand(wand)).toEqual([]);
    tickWand(wand, 100);
    editWand(wand, ['shard']); editWand(wand, ['bomb', 'bomb']);
    expect(wand.charges.bomb).toBe(0);
    expect(castWand(wand)).toEqual([]);
    resetWand(wand);
    expect(wand.charges.bomb).toBe(6);
    expect(wand.mana).toBe(wand.maxMana);
    expect(castWand(wand)).toHaveLength(1);
  });
  it('validates edits atomically and cannot refill mana or skip recharge by editing', () => {
    const wand = prepared(['bomb']);
    castWand(wand);
    const before = structuredClone(wand);
    expect(editWand(wand, Array(17).fill('shard'))).toBe(false);
    expect(editWand(wand, ['not-a-spell' as SpellId])).toBe(false);
    expect(wand).toEqual(before);
    expect(editWand(wand, ['shard'])).toBe(true);
    expect(wand.mana).toBe(before.mana);
    expect(wand.cooldown).toBe(before.cooldown);
    expect(wand.charges).toEqual(before.charges);
    expect(castWand(wand)).toEqual([]);
  });
  it('modifier-only, multicast-only, depleted and empty decks are bounded', () => {
    for (const spells of [['force', 'haste'], ['twin', 'twin'], []] as SpellId[][]) {
      const wand = prepared(spells), mana = wand.mana;
      expect(castWand(wand)).toEqual([]);
      expect(wand.mana).toBe(mana);
      expect(wand.cursor).toBe(spells.length);
    }
  });
  it('gives fire, digging and blast projectiles distinct simulation descriptors', () => {
    for (const [id, property] of [['ember', 'fire'], ['excavate', 'dig'], ['bomb', 'blast']] as const) {
      const shot = castWand(prepared([id]))[0];
      expect(shot[property]).toBeTruthy();
      expect(shot.angle).toBeGreaterThanOrEqual(-0.035);
      expect(shot.angle).toBeLessThanOrEqual(0.035);
    }
  });
});
