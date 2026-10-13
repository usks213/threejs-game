import { createWand, editWand, SPELLS } from './wands';
import type { SpellId, Wand } from './wands';

/** Loose cards and equipped cards are disjoint finite inventories. */
export const MAX_LOOSE_SPELLS = 96;
export const MAX_WAND_PICKUPS = 1;
export const WAND_PICKUP_RANGE = 14;
export const SPELL_STOCK = 2;
export const SPELL_PRICES: Readonly<Record<SpellId, number>> = {
  shard: 20, ember: 20, lance: 35, excavate: 20, bomb: 30,
  force: 25, haste: 25, twin: 40, echo: 50, pebble: 15,
};
export function createAmmo(): Record<string, number> {
  return Object.fromEntries(Object.entries(SPELLS).filter(([, spell]) => spell.charges !== undefined).map(([id, spell]) => [id, spell.charges!]));
}
export interface WandPickup { id: string; x: number; y: number; wand: Wand }
export function createShopStock(): Partial<Record<SpellId, number>> {
  return Object.fromEntries(Object.keys(SPELL_PRICES).map(id => [id, SPELL_STOCK]));
}
/** A modest shuffled starter cache, reachable on the safe entrance platform. */
export function createWandPickups(seed: number, level: number, reservoir = false): WandPickup[] {
  const wand = createWand(2, (seed ^ Math.imul(level + 1, 0x9e3779b9)) >>> 0);
  wand.id = `cache-wand-${seed}-${level}`;
  wand.capacity = 6;
  wand.maxMana = wand.mana = 110 + (reservoir ? 40 : 0);
  wand.regen = 30; wand.castDelay = 0.22; wand.recharge = 0.75;
  editWand(wand, ['echo', 'twin', 'pebble', 'shard', 'haste']);
  return [{ id: `cache-${seed}-${level}`, x: 76, y: 27, wand }];
}
/** Calculate the full replacement first, so an overdraw cannot mutate any inventory. */
export function exchangeCards(loose: readonly SpellId[], previous: readonly SpellId[], replacement: readonly SpellId[]): SpellId[] | null {
  const available = [...loose, ...previous];
  for (const id of replacement) {
    const index = available.indexOf(id);
    if (index < 0) return null;
    available.splice(index, 1);
  }
  return available.length <= MAX_LOOSE_SPELLS ? available : null;
}
