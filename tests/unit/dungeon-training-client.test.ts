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
describe('optional training snapshot validation and exact action acknowledgement', () => {
  it('accepts absent legacy training and preserves explicit none or valid terminal cooldown', () => {
    const value = snapshot(), actor = value.actors[0]; delete actor.training; delete actor.skillState; expect(isSnapshot(value)).toBe(true);
    actor.training = { skill: null, perk: null }; expect(isSnapshot(value)).toBe(true);
    actor.training = { skill: 'rush', perk: 'vigor' }; actor.skillState = { skill: 'rush', activeUntil: 2.5, readyAt: 14 };
    for (const status of ['alive', 'dead', 'extracted', 'lobby'] as const) { actor.status = status; expect(isSnapshot(value)).toBe(true); }
  });
  it.each([undefined, null, {}, [], { skill: 'rush' }, { skill: 'all', perk: null }, { skill: null, perk: 'all' }, { skill: null, perk: null, bonus: 999 }])('rejects present malformed training (%j)', training => {
    const value = snapshot(); Object.assign(value.actors[0], { training }); expect(isSnapshot(value)).toBe(false);
  });
  it.each([undefined, null, {}, { skill: 'rush', activeUntil: NaN, readyAt: 14 }, { skill: 'rush', activeUntil: 2.5, readyAt: Infinity }, { skill: 'rush', activeUntil: 2.5, readyAt: 15 }, { skill: 'brace', activeUntil: 4, readyAt: 18 }, { skill: 'rush', activeUntil: 3.5, readyAt: 15 }])('rejects malformed, mismatched or future effect state (%j)', skillState => {
    const value = snapshot(); Object.assign(value.actors[0], { training: { skill: 'rush', perk: null }, skillState });
    expect(() => isSnapshot(value)).not.toThrow(); expect(isSnapshot(value)).toBe(false);
  });
  it('rejects active bastion effects on other classes or without a selection', () => {
    const value = snapshot(), actor = value.actors[0]; actor.skillState = { skill: 'rush', activeUntil: 2.5, readyAt: 14 };
    delete actor.training; expect(isSnapshot(value)).toBe(false);
    actor.training = { skill: 'rush', perk: null }; actor.classId = 'hunter'; expect(isSnapshot(value)).toBe(false);
  });
  it('tracks only successfully transmitted sequence and never delivers invalid training', () => {
    const socket = new Socket(), receive = vi.fn(), notice = vi.fn();
    const client = new DungeonClient({ base: 'https://example.test/', room: 'b'.repeat(64), identity: { key: 'a'.repeat(64), name: 'Owner', persistent: true }, socket: () => socket, callbacks: { snapshot: receive, notice, state: vi.fn() } });
    client.connect(); socket.onopen?.(new Event('open')); const bad = snapshot(); Object.assign(bad.actors[0], { training: null }); socket.receive(bad);
    expect(receive).not.toHaveBeenCalled(); expect(client.connected).toBe(false);
    const value = snapshot(); value.lastAction = 40; socket.receive(value);
    client.action({ kind: 'ready' }); expect(client.lastSentActionSequence).toBe(41);
    client.action({ kind: 'configure-training', skill: 'rush', perk: 'stride' }); expect(client.lastSentActionSequence).toBe(42);
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: 'action', sequence: 42, action: { kind: 'configure-training', skill: 'rush', perk: 'stride' } });
    socket.readyState = 3; expect(client.action({ kind: 'skill' })).toBe(false); expect(client.lastSentActionSequence).toBe(42);
    client.dispose();
  });
});
