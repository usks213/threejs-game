import { describe, expect, it, vi } from 'vitest';
import { DungeonClient, isSnapshot, type DungeonSocket } from '../../src/dungeon/client';
import { DungeonSimulation } from '../../src/dungeon/simulation';
function snapshot() {
  const sim = new DungeonSimulation(), owner = sim.join('a'.repeat(64), 'Owner')!;
  return sim.snapshot(owner.actor.id);
}
class Socket implements DungeonSocket {
  readyState = 1; sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify({ type: 'snapshot', snapshot: value }) } as MessageEvent); }
}
const first = { id: 'first-return', progress: 1, claimed: true };
describe('owner quest snapshot validation and transport', () => {
  it('accepts legacy omitted, empty and coherent bounded journals', () => {
    const value = snapshot(); delete value.quests; expect(isSnapshot(value)).toBe(true);
    expect(isSnapshot({ ...value, quests: [] })).toBe(true);
    expect(isSnapshot({ ...value, quests: [first, { id: 'ore-delivery', progress: 2, claimed: false }] })).toBe(true);
  });
  it.each([
    undefined, null, {}, [null], [{ ...first, id: 'unknown' }], [first, first],
    [{ ...first, progress: -1 }], [{ ...first, progress: 2 }], [{ ...first, progress: .5 }],
    [{ ...first, claimed: 1 }], [{ ...first, progress: 0 }], [{ ...first, gold: 999 }],
    [{ id: 'ore-delivery', progress: 0, claimed: false }],
    [first, { id: 'ore-delivery', progress: 3, claimed: false }],
    [first, { id: 'ore-delivery', progress: 1, claimed: true }],
  ])('rejects malformed journals without throwing (%j)', quests => {
    expect(() => isSnapshot({ ...snapshot(), quests })).not.toThrow();
    expect(isSnapshot({ ...snapshot(), quests })).toBe(false);
  });
  it('never delivers malformed journals and preserves action sequences with no client-authored reward/progress', () => {
    const socket = new Socket(), receive = vi.fn(), notice = vi.fn();
    const client = new DungeonClient({ base: 'https://example.test/', room: 'b'.repeat(64), identity: { key: 'a'.repeat(64), name: 'Owner', persistent: true }, socket: () => socket, callbacks: { snapshot: receive, notice, state: vi.fn() } });
    client.connect(); socket.onopen?.(new Event('open'));
    socket.receive({ ...snapshot(), quests: [null] });
    expect(receive).not.toHaveBeenCalled(); expect(client.connected).toBe(false); expect(notice).toHaveBeenCalled();
    const value = snapshot(); value.lastAction = 40; socket.receive(value);
    const actions = [{ kind: 'accept-quest', quest: 'first-return' }, { kind: 'deliver-quest', quest: 'ore-delivery', item: 'selected-stack' }, { kind: 'claim-quest', quest: 'ore-delivery' }] as const;
    for (let i = 0; i < actions.length; i++) {
      expect(client.action(actions[i])).toBe(true);
      expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: 'action', sequence: 41 + i, action: actions[i] });
    }
    client.dispose();
  });
});
