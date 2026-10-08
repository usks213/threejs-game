import { describe, expect, it, vi } from 'vitest';
import { DungeonClient, isSnapshot, type DungeonSocket } from '../../src/dungeon/client';
import { DungeonSimulation } from '../../src/dungeon/simulation';
function snapshot() {
  const sim = new DungeonSimulation(), owner = sim.join('a'.repeat(64), 'Owner')!;
  sim.command(owner.actor.id, 1, { kind: 'class', classId: 'ravager' });
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
describe('strict optional ravager client snapshot validation', () => {
  it('accepts old profiles, explicit none, independent saved choices and terminal cooldowns without mutation', () => {
    const value = snapshot(), actor = value.actors[0]; expect(actor.ravagerTraining).toBeUndefined(); expect(isSnapshot(value)).toBe(true);
    actor.ravagerTraining = { skill: null, perk: null }; expect(isSnapshot(value)).toBe(true);
    actor.training = { skill: 'brace', perk: 'vigor' }; actor.ravagerTraining = { skill: 'frenzy', perk: 'laststand' };
    actor.ravagerSkillState = { skill: 'frenzy', activeUntil: 5, readyAt: 18 };
    for (const status of ['alive', 'dead', 'extracted', 'lobby'] as const) { actor.status = status; const before = structuredClone(value); expect(isSnapshot(value)).toBe(true); expect(value).toEqual(before); }
    value.elapsed = 100; expect(isSnapshot(value)).toBe(true);
  });
  it.each([undefined, null, {}, [], { skill: 'frenzy' }, { skill: 'rush', perk: null }, { skill: null, perk: 'vigor' }, { skill: null, perk: null, bonus: 999 }])('rejects malformed present training (%j)', ravagerTraining => {
    const value = snapshot(); Object.assign(value.actors[0], { ravagerTraining }); expect(isSnapshot(value)).toBe(false);
  });
  it.each([undefined, null, {}, [], { skill: 'rush', activeUntil: 5, readyAt: 18 }, { skill: 'frenzy', activeUntil: NaN, readyAt: 18 }, { skill: 'frenzy', activeUntil: 5, readyAt: Infinity }, { skill: 'frenzy', activeUntil: 5, readyAt: 19 }, { skill: 'frenzy', activeUntil: 6, readyAt: 19 }, { skill: 'frenzy', activeUntil: 5, readyAt: 18, extra: true }])('rejects malformed or future effect state (%j)', ravagerSkillState => {
    const value = snapshot(); Object.assign(value.actors[0], { ravagerTraining: { skill: 'frenzy', perk: null }, ravagerSkillState });
    expect(() => isSnapshot(value)).not.toThrow(); expect(isSnapshot(value)).toBe(false);
  });
  it('rejects mismatched class, absent/mismatched choice and incompatible simultaneous class effects', () => {
    const value = snapshot(), actor = value.actors[0]; actor.ravagerSkillState = { skill: 'frenzy', activeUntil: 5, readyAt: 18 };
    expect(isSnapshot(value)).toBe(false); actor.ravagerTraining = { skill: null, perk: 'followthrough' }; expect(isSnapshot(value)).toBe(false);
    actor.ravagerTraining.skill = 'frenzy'; expect(isSnapshot(value)).toBe(true);
    actor.classId = 'bastion'; expect(isSnapshot(value)).toBe(false); actor.classId = 'ravager';
    actor.training = { skill: 'rush', perk: null }; actor.skillState = { skill: 'rush', activeUntil: 2.5, readyAt: 14 }; expect(isSnapshot(value)).toBe(false);
  });
  it('validates optional training on opponents/enemies and rejects invalid snapshot clocks', () => {
    const value = snapshot(); value.enemies = [{ ...value.actors[0], home: { x: 0, y: 0, z: 0 }, alert: 0, lootClaimed: false }];
    Object.assign(value.enemies[0], { ravagerTraining: { skill: null } }); expect(isSnapshot(value)).toBe(false);
    value.enemies = [];
    for (const elapsed of [-1, NaN, Infinity, 1e6 + 1]) { value.elapsed = elapsed; expect(isSnapshot(value)).toBe(false); }
    value.elapsed = 0;
    for (const field of ['tick', 'raid'] as const) for (const clock of [-1, NaN, Infinity, .5]) { const malformed = structuredClone(value); malformed[field] = clock; expect(isSnapshot(malformed)).toBe(false); }
    Object.assign(value, { actors: [[]] }); expect(isSnapshot(value)).toBe(false);
  });
  it('never delivers corrupt training or unlocks connection, and sends the exact ravager action sequence', () => {
    const socket = new Socket(), receive = vi.fn(), notice = vi.fn();
    const client = new DungeonClient({ base: 'https://example.test/', room: 'b'.repeat(64), identity: { key: 'a'.repeat(64), name: 'Owner', persistent: true }, socket: () => socket, callbacks: { snapshot: receive, notice, state: vi.fn() } });
    client.connect(); socket.onopen?.(new Event('open'));
    const bad = snapshot(); Object.assign(bad.actors[0], { ravagerTraining: null }); socket.receive(bad);
    expect(receive).not.toHaveBeenCalled(); expect(client.connected).toBe(false); expect(notice).toHaveBeenCalled();
    const value = snapshot(); value.lastAction = 40; socket.receive(value);
    client.action({ kind: 'configure-ravager-training', skill: 'frenzy', perk: 'followthrough' });
    expect(client.lastSentActionSequence).toBe(41);
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: 'action', sequence: 41, action: { kind: 'configure-ravager-training', skill: 'frenzy', perk: 'followthrough' } });
    socket.readyState = 3; expect(client.action({ kind: 'skill' })).toBe(false); expect(client.lastSentActionSequence).toBe(41); client.dispose();
  });
});
