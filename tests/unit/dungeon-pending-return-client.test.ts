import { describe, expect, it, vi } from 'vitest';
import { DungeonClient, isSnapshot, type DungeonSocket } from '../../src/dungeon/client';
import { DungeonSimulation } from '../../src/dungeon/simulation';
import type { Item, Snapshot } from '../../src/dungeon/types';

const item = (id = 'return-1', x = 0, y = 0): Item => ({ id, kind: 'potion', quality: 0, count: 1, x, y, rotated: false, found: true });
function snapshot(): Snapshot {
  const sim = new DungeonSimulation(), owner = sim.join('a'.repeat(64), 'Owner')!;
  return { ...sim.snapshot(owner.actor.id), pendingReturn: [item()] };
}
class Socket implements DungeonSocket {
  readyState = 1;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify({ type: 'snapshot', snapshot: value }) } as MessageEvent); }
}

describe('private bounded pending-return snapshot compatibility', () => {
  it('accepts a valid batch, empty batch, and old snapshots with no batch', () => {
    const value = snapshot();
    expect(isSnapshot(value)).toBe(true);
    value.pendingReturn = []; expect(isSnapshot(value)).toBe(true);
    delete value.pendingReturn; expect(isSnapshot(value)).toBe(true);
    value.pendingReturn = Array.from({ length: 50 }, (_, index) => item(`i${index}`, index % 10, Math.floor(index / 10)));
    expect(isSnapshot(value)).toBe(true);
  });
  it.each([
    ['non-array', null], ['object', {}], ['present undefined', undefined],
    ['malformed neighbor', [item(), null]], ['unknown kind', [{ ...item(), kind: 'other-private' }]],
    ['not returned', [{ ...item(), found: false }]], ['invalid count', [{ ...item(), count: 0 }]], ['invalid quality', [{ ...item(), quality: 8 }]],
    ['duplicate ID', [item(), item()]], ['overlapping items', [item('one'), item('two')]],
    ['outside bag height', [item('one', 0, 5)]], ['outside bag width', [item('one', 10)]],
    ['unbounded queue', Array.from({ length: 51 }, (_, index) => item(`i${index}`, index % 10, Math.floor(index / 10)))],
  ])('rejects %s without throwing', (_name, pendingReturn) => {
    const value = { ...snapshot(), pendingReturn };
    expect(() => isSnapshot(value)).not.toThrow();
    expect(isSnapshot(value)).toBe(false);
  });
  it('never passes invalid batches to rendering and resumes ordinary claim action sequences', () => {
    const socket = new Socket(), receive = vi.fn(), notice = vi.fn();
    const client = new DungeonClient({ base: 'https://example.test/', room: 'b'.repeat(64), identity: { key: 'a'.repeat(64), name: 'Owner', persistent: true }, socket: () => socket, callbacks: { snapshot: receive, notice, state: vi.fn() } });
    client.connect(); socket.onopen?.(new Event('open'));
    socket.receive({ ...snapshot(), pendingReturn: [item(), null] });
    expect(receive).not.toHaveBeenCalled(); expect(client.connected).toBe(false); expect(notice).toHaveBeenCalled();
    const value = snapshot(); value.lastAction = 40; socket.receive(value);
    expect(receive).toHaveBeenCalledExactlyOnceWith(value);
    expect(client.action({ kind: 'claim-return', item: 'return-1', to: 'bag' })).toBe(true);
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: 'action', sequence: 41, action: { kind: 'claim-return', item: 'return-1', to: 'bag' } });
    expect(value.pendingReturn).toEqual([item()]); client.dispose();
  });
  it('receives only the requested owner batch, independently across reconnect snapshots', () => {
    const sim = new DungeonSimulation(), one = sim.join('a'.repeat(64), 'One')!, two = sim.join('b'.repeat(64), 'Two')!;
    one.pendingReturn = [item('one-private')]; two.pendingReturn = [item('two-private')];
    const first = sim.snapshot(one.actor.id), second = sim.snapshot(two.actor.id);
    expect(isSnapshot(first)).toBe(true); expect(isSnapshot(second)).toBe(true);
    expect(first.pendingReturn).toEqual([item('one-private')]); expect(second.pendingReturn).toEqual([item('two-private')]);
    expect(JSON.stringify(first)).not.toContain('two-private'); expect(JSON.stringify(second)).not.toContain('one-private');
    first.pendingReturn![0].count = 2;
    expect(sim.snapshot(one.actor.id).pendingReturn).toEqual([item('one-private')]);
  });
});
