import { describe, expect, it } from 'vitest';
import { Material } from '../../src/emberfall/materials';
import { Run } from '../../src/emberfall/simulation';
import { BACKUP_KEY, loadRun, SAVE_KEY, saveRun } from '../../src/emberfall/save';
import { castWand, editWand } from '../../src/emberfall/wands';

class MemoryStorage {
  values = new Map<string, string>();
  failKey = '';
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { if (key === this.failKey) throw new Error('quota'); this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}
interface TestEnvelope {
  version: number; checksum: string;
  data: { state: Pick<Run, 'player' | 'wands' | 'enemies' | 'phase'> & { extra?: boolean }; world: { width: number; cells: number[]; life: number[] } };
}
function tamper(storage: MemoryStorage, mutate: (data: TestEnvelope) => void, rehash = true): void {
  // Deliberate untrusted JSON mutation for schema adversarial tests.
  const payload = JSON.parse(storage.getItem(SAVE_KEY)!) as TestEnvelope;
  mutate(payload);
  if (rehash) {
    const input = JSON.stringify(payload.data); let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 0x01000193);
    payload.checksum = (hash >>> 0).toString(16).padStart(8, '0');
  }
  storage.setItem(SAVE_KEY, JSON.stringify(payload)); storage.removeItem(BACKUP_KEY);
}

describe('versioned Emberfall saves', () => {
  it('roundtrips a complete run and does not restore cosmetic particles', () => {
    const storage = new MemoryStorage(), run = new Run(512);
    run.gold = 78; run.kills = 3; run.time = 51.25; run.selected = 1;
    run.player.hp = 64; run.player.wet = 3; run.flask = 41;
    run.phase = 'refuge'; run.perks = ['heart']; run.perkOffers = ['heart', 'heat', 'magnet']; run.perkChosen = true;
    run.spells.push('echo'); run.loot.push({ x: 50, y: 60, value: 15 });
    editWand(run.wands[0], ['echo', 'shard']);
    const shot = castWand(run.wands[0])[0]; run.addShot(shot, 44, 27, 0.2);
    run.burst(40, 27, '#ffffff'); run.sprayCooldown = 0.02; run.materialAccumulator = 0.015;
    expect(saveRun(run, storage).ok).toBe(true);
    const restored = loadRun(storage).run!;
    expect(restored).toBeInstanceOf(Run);
    for (const key of ['player', 'enemies', 'projectiles', 'loot', 'wands', 'selected', 'gold', 'level', 'phase', 'perks', 'perkOffers', 'perkChosen', 'spells', 'portal', 'seed', 'time', 'kills', 'flask', 'sprayCooldown', 'materialAccumulator'] as const) expect(restored[key]).toEqual(run[key]);
    expect(restored.particles).toEqual([]);
    expect(restored.world.cells).toEqual(run.world.cells);
    expect(restored.world.life).toEqual(run.world.life);
  });
  it('keeps edited terrain, cell lifetime and deterministic world continuation', () => {
    const storage = new MemoryStorage(), run = new Run(65);
    run.world.carveCircle(100, 90, 20, 50);
    run.world.set(80, 40, Material.Fire); run.world.set(81, 40, Material.Water);
    for (let i = 0; i < 9; i++) run.world.step();
    expect(saveRun(run, storage).ok).toBe(true);
    const loaded = loadRun(storage).run!;
    expect(loaded.world.tick).toBe(run.world.tick);
    expect(loaded.world.rngState).toBe(run.world.rngState);
    expect(loaded.world.dirty.size).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) { run.world.step(); loaded.world.step(); }
    expect(loaded.world.cells).toEqual(run.world.cells);
    expect(loaded.world.life).toEqual(run.world.life);
    expect(loaded.world.rngState).toBe(run.world.rngState);
  });
  it('retains limited charges, mana and an in-progress deck without rest', () => {
    const storage = new MemoryStorage(), run = new Run(4);
    editWand(run.wands[1], ['bomb', 'excavate']);
    castWand(run.wands[1]);
    expect(saveRun(run, storage).ok).toBe(true);
    const loaded = loadRun(storage).run!;
    expect(loaded.wands[1]).toEqual(run.wands[1]);
    expect(loaded.wands[1].charges.bomb).toBe(5);
    expect(loaded.wands[1].cursor).toBe(1);
    expect(castWand(loaded.wands[1])).toEqual([]);
  });
  it.each(['dead', 'won'] as const)('preserves terminal %s state rather than resurrecting', phase => {
    const storage = new MemoryStorage(), run = new Run(1);
    run.phase = phase; run.level = 2;
    if (phase === 'dead') { run.player.hp = 0; run.cause = '溶岩'; }
    expect(saveRun(run, storage).ok).toBe(true);
    const loaded = loadRun(storage).run!;
    expect(loaded.phase).toBe(phase); expect(loaded.player.hp).toBe(run.player.hp);
  });
  it('rejects invalid live values before any storage mutation', () => {
    const storage = new MemoryStorage(), run = new Run(1);
    saveRun(run, storage); const before = new Map(storage.values);
    run.player.x = NaN;
    expect(saveRun(run, storage).ok).toBe(false);
    expect(storage.values).toEqual(before);
    run.player.x = 40; run.wands[0].mana = Infinity;
    expect(saveRun(run, storage).ok).toBe(false);
    expect(storage.values).toEqual(before);
  });
  it('uses a valid backup when the primary checksum is corrupt', () => {
    const storage = new MemoryStorage(), run = new Run(2);
    run.gold = 20; saveRun(run, storage);
    run.gold = 50; saveRun(run, storage);
    const primary = storage.getItem(SAVE_KEY)!;
    storage.setItem(SAVE_KEY, primary.replace('"gold":50', '"gold":51'));
    const before = new Map(storage.values);
    const result = loadRun(storage);
    expect(result.run!.gold).toBe(20); expect(result.message).toContain('予備');
    expect(storage.values).toEqual(before);
  });
  it('does not replace the last valid backup with a corrupt primary', () => {
    const storage = new MemoryStorage(), run = new Run(2);
    run.gold = 20; saveRun(run, storage);
    const backup = storage.getItem(BACKUP_KEY);
    storage.setItem(SAVE_KEY, '{broken'); run.gold = 80;
    expect(saveRun(run, storage).ok).toBe(true);
    expect(storage.getItem(BACKUP_KEY)).toBe(backup);
    expect(loadRun(storage).run!.gold).toBe(80);
  });
  it('surfaces primary and backup write failures and preserves a valid recovery copy', () => {
    const storage = new MemoryStorage(), run = new Run(3);
    saveRun(run, storage); run.gold = 99;
    storage.failKey = SAVE_KEY;
    expect(saveRun(run, storage).ok).toBe(false);
    expect(loadRun(storage).run!.gold).toBe(0);
    storage.failKey = BACKUP_KEY;
    expect(saveRun(run, storage).ok).toBe(false);
    expect(loadRun(storage).run!.gold).toBe(0);
  });
  it('rejects unknown versions without touching stored data', () => {
    const storage = new MemoryStorage(); saveRun(new Run(2), storage);
    tamper(storage, payload => { payload.version = 2; });
    const before = new Map(storage.values);
    expect(loadRun(storage).run).toBeNull(); expect(storage.values).toEqual(before);
  });
  it('checks schema and bounded allocations even when the checksum is recomputed', () => {
    const mutations: ((payload: TestEnvelope) => void)[] = [
      p => { Reflect.set(p.data.state.player, 'hp', null); },
      p => { p.data.state.player.x = 100000; },
      p => { Reflect.set(p.data.state.wands[0], 'spells', ['unknown']); },
      p => { p.data.state.wands[0].cursor = 99; },
      p => { p.data.state.wands = p.data.state.wands.slice(0, 1); },
      p => { p.data.state.wands.push(p.data.state.wands[0]); },
      p => { p.data.state.wands[0].charges.bomb = 999; },
      p => { p.data.state.enemies = Array(257).fill(p.data.state.enemies[0]); },
      p => { p.data.world.width = 100000; },
      p => { p.data.world.cells = [0, 1]; },
      p => { p.data.world.cells = [0, 98305]; },
      p => { p.data.world.life = [256, 98304]; },
      p => { p.data.state.extra = true; },
      p => { p.data.state.phase = 'playing'; p.data.state.player.hp = 0; },
    ];
    for (const mutate of mutations) {
      const storage = new MemoryStorage(); saveRun(new Run(2), storage); tamper(storage, mutate);
      expect(loadRun(storage).run).toBeNull();
    }
  });
  it('rejects oversized source text and reports unavailable storage', () => {
    const storage = new MemoryStorage(); storage.setItem(SAVE_KEY, ' '.repeat(4_000_001));
    expect(loadRun(storage).run).toBeNull();
    const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
    expect(loadRun(denied).message).toContain('読み取れません');
    expect(saveRun(new Run(1), denied).ok).toBe(false);
  });
});

it('rejects impossible final-layer refuge saves and prevents out-of-range descent', () => {
  const run = new Run(7), storage = new MemoryStorage();
  run.level = 2; run.phase = 'refuge';
  expect(saveRun(run, storage).ok).toBe(false);
  expect(run.descend()).toBe(false);
  expect(run.level).toBe(2);
});
