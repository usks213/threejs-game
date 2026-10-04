import type { MeadowState } from './state';
import { inventorySlots, stackSize } from './inventory';
export interface ItemSlot { id: string; count: number }

/** Layout never owns items: totals remain authoritative, preventing split/merge duplication. */
export function reconcileSlots(m: MeadowState, items: Record<string, number>): (ItemSlot | null)[] {
 m.slots = inventorySlots(items, m.slots);
 return m.slots;
}
export function changeLayout(m: MeadowState, items: Record<string, number>, action: 'split' | 'move', id: string): void {
 const slots = reconcileSlots(m, items), parts = id.split(':');
 // Number('') is zero, so require explicit indices before converting them.
 if (!/^\d+$/.test(parts[0] ?? '')) throw new Error('持ち物を選んでください');
 const from = Number(parts[0]);
 if (!Number.isInteger(from) || from < 0 || from >= slots.length || !slots[from]) throw new Error('持ち物を選んでください');
 const a = slots[from]!;
 if (action === 'split') {
  const empty = slots.indexOf(null);
  if (empty < 0 || a.count < 2) throw new Error('分割できる数と空き枠が必要です');
  const count = Math.floor(a.count / 2);
  a.count -= count;
  slots[empty] = {id: a.id, count};
  return;
 }
 if (parts.length !== 2 || !/^\d+$/.test(parts[1])) return;
 const to = Number(parts[1]);
 if (!Number.isInteger(to) || to < 0 || to >= slots.length || from === to) return;
 const b = slots[to];
 if (b?.id === a.id) {
  const count = Math.min(a.count, stackSize(a.id) - b.count);
  b.count += count;
  a.count -= count;
  if (!a.count) slots[from] = null;
 } else {
  slots[to] = a;
  slots[from] = b;
 }
}
