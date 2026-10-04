import type { MeadowState } from './state';
import type { ItemSlot } from './inventory-layout';
import { ARMOR, ITEM_WEIGHT, TOOL_DURABILITY } from '../../content/meadows/data';
import { WEAPONS } from '../../content/catalog';

const SLOT_COUNT = 32;
export function stackSize(id: string): number {
 return Object.hasOwn(WEAPONS, id) || Object.hasOwn(ARMOR, id) || Object.hasOwn(TOOL_DURABILITY, id)
  ? 1 : id === 'coins' ? 999 : id.endsWith('Arrow') ? 100 : 50;
}
const validCount = (count: number) => Number.isSafeInteger(count) && count >= 0;

/** Project authoritative totals without mutating the saved layout or collapsing split stacks. */
export function inventorySlots(items: Record<string, number>, previous: readonly (ItemSlot | null)[] = []): (ItemSlot | null)[] {
 const left = new Map(Object.entries(items).map(([id, count]) => [id, validCount(count) ? count : 0]));
 const slots = Array.from({length: SLOT_COUNT}, (_, i): ItemSlot | null => {
  const slot = previous[i];
  if (!slot || !validCount(slot.count)) return null;
  const count = Math.min(slot.count, left.get(slot.id) ?? 0, stackSize(slot.id));
  left.set(slot.id, (left.get(slot.id) ?? 0) - count);
  return count > 0 ? {id: slot.id, count} : null;
 });
 for (const [id, total] of left) {
  let count = total;
  for (const slot of slots) if (slot?.id === id && count > 0) {
   const add = Math.min(count, stackSize(id) - slot.count);
   slot.count += add;
   count -= add;
  }
  while (count > 0) {
   const i = slots.indexOf(null);
   if (i < 0) break;
   const amount = Math.min(count, stackSize(id));
   slots[i] = {id, count: amount};
   count -= amount;
  }
 }
 return slots;
}

export function occupiedSlots(items: Record<string, number>): number {
 return Object.entries(items).reduce((n, [id, amount]) => validCount(amount) ? n + Math.ceil(amount / stackSize(id)) : Infinity, 0);
}
export function canCarry(items: Record<string, number>, id: string, amount: number, m?: MeadowState): boolean {
 if (!id || !validCount(amount) || !Object.values(items).every(validCount)) return false;
 const next = {...items, [id]: (items[id] ?? 0) + amount};
 if (!validCount(next[id]) || occupiedSlots(next) > SLOT_COUNT) return false;
 const weight = Object.entries(next).reduce((n, [key, count]) => n + (Object.hasOwn(ITEM_WEIGHT, key) ? ITEM_WEIGHT[key] : 1) * count, 0);
 if (weight > 300 + 1e-9) return false;
 // A layout can be stale after spending, and split stacks can occupy more slots than
 // the packed total. Check the actual projected layout rather than either shortcut.
 const represented = new Map<string, number>();
 for (const slot of inventorySlots(next, m?.slots)) if (slot) represented.set(slot.id, (represented.get(slot.id) ?? 0) + slot.count);
 return Object.entries(next).every(([key, count]) => (represented.get(key) ?? 0) === count);
}

/** Bounded search also handles large/zero-weight stacks without one check per item. */
export function carryAmount(items: Record<string, number>, id: string, amount: number, m?: MeadowState): number {
 if (!validCount(amount) || amount === 0) return 0;
 let low = 0, high = amount;
 while (low < high) {
  const mid = low + Math.ceil((high - low) / 2);
  if (canCarry(items, id, mid, m)) low = mid;
  else high = mid - 1;
 }
 return low;
}
