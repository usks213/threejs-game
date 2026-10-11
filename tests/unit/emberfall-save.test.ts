import { describe, expect, it } from 'vitest';
import { Material } from '../../src/emberfall/materials';
import { idleInput, Run } from '../../src/emberfall/simulation';
import { BACKUP_KEY, loadRun, SAVE_KEY, saveRun } from '../../src/emberfall/save';
import { createWandPickups, MAX_LOOSE_SPELLS } from '../../src/emberfall/inventory';
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
  data: { state: Pick<Run, 'player' | 'wands' | 'enemies' | 'phase' | 'spells' | 'wandPickups' | 'shopStock' | 'ammo'> & { extra?: boolean }; world: { width: number; cells: number[]; life: number[] } };
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
    for (const key of ['player', 'enemies', 'projectiles', 'loot', 'wands', 'selected', 'gold', 'level', 'phase', 'perks', 'perkOffers', 'perkChosen', 'spells', 'wandPickups', 'shopStock', 'ammo', 'portal', 'seed', 'time', 'kills', 'flask', 'sprayCooldown', 'materialAccumulator'] as const) expect(restored[key]).toEqual(run[key]);
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
    run.selected = 1; run.castSelectedWand();
    expect(saveRun(run, storage).ok).toBe(true);
    const loaded = loadRun(storage).run!;
    expect(loaded.wands[1]).toEqual(run.wands[1]);
    expect(loaded.wands[1].charges.bomb).toBe(5);
    expect(loaded.wands[1].cursor).toBe(1);
    expect(castWand(loaded.wands[1])).toEqual([]);
  });
  it.each(['dead', 'won'] as const)('preserves terminal %s state rather than resurrecting', phase => {
    const storage = new MemoryStorage(), run = new Run(1);
    run.phase = phase; run.level = 2; run.wandPickups = createWandPickups(run.seed, run.level);
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
    tamper(storage, payload => { payload.version = 3; });
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

function legacySave(storage: MemoryStorage, run = new Run(19)): void {
  expect(saveRun(run, storage).ok).toBe(true);
  tamper(storage, payload => {
    payload.version = 1;
    for (const key of ['wandPickups', 'shopStock', 'ammo']) Reflect.deleteProperty(payload.data.state, key);
    payload.data.state.spells = ['shard', 'ember', 'excavate', 'bomb', 'force', 'lance', 'echo'];
  });
}

describe('finite-inventory save v2 and v1 migration', () => {
  it('writes v2 under the existing keys and preserves duplicate loose copies', () => {
    const storage = new MemoryStorage(), run = new Run(19); run.enterRefuge(); run.gold = 100;
    run.buySpell('lance', 35); run.buySpell('lance', 35);
    expect(saveRun(run, storage).ok).toBe(true);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).version).toBe(2);
    const loaded = loadRun(storage).run!;
    expect(loaded.spells).toEqual(['ember', 'lance', 'lance']); expect(loaded.shopStock.lance).toBe(0);
    expect(loaded.wandPickups).toEqual(run.wandPickups); expect(loaded.ammo).toEqual(run.ammo);
    expect(loaded.buySpell('lance', 35)).toBe(false);
  });
  it('migrates exact v1 data without losing equipped copies, cloning unlocks, or refilling ammunition', () => {
    const storage = new MemoryStorage(), run = new Run(19);
    editWand(run.wands[0], ['echo', 'lance', 'lance']);
    run.wands[0].cursor = 2; run.wands[0].mana = 31; run.wands[0].cooldown = 0.3;
    legacySave(storage, run);
    tamper(storage, payload => { payload.data.state.wands[1].charges.bomb = 2; });
    const before = new Map(storage.values), result = loadRun(storage), loaded = result.run!;
    expect(result.message).toContain('旧保存を移行');
    expect(loaded).not.toBeNull(); expect(storage.values).toEqual(before);
    expect(loaded.spells).toEqual(['shard', 'ember', 'force']);
    expect(loaded.wands.map(wand => wand.spells)).toEqual(run.wands.map(wand => wand.spells));
    expect(loaded.wands[0]).toMatchObject({ cursor: 2, mana: 31, cooldown: 0.3, rng: run.wands[0].rng });
    expect(loaded.ammo.bomb).toBe(2);
    expect([...loaded.wands, loaded.wandPickups[0].wand].map(wand => wand.charges.bomb)).toEqual([2, 2, 2]);
    expect(loaded.world.cells).toEqual(run.world.cells);
    expect(loaded.wandPickups).toHaveLength(1); expect(loaded.wandPickups[0].wand.spells).toContain('pebble');
    expect(saveRun(loaded, storage).ok).toBe(true);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).version).toBe(2);
    expect(JSON.parse(storage.getItem(BACKUP_KEY)!).version).toBe(1);
    expect(loadRun(storage).run!.spells).toEqual(loaded.spells);
  });
  it('recovers and migrates a valid legacy backup when the primary is corrupt', () => {
    const storage = new MemoryStorage(); legacySave(storage);
    storage.setItem(BACKUP_KEY, storage.getItem(SAVE_KEY)!); storage.setItem(SAVE_KEY, '{broken');
    const before = new Map(storage.values), loaded = loadRun(storage);
    expect(loaded.run!.spells).toEqual(['ember', 'force', 'lance', 'echo']);
    expect(loaded.message).toContain('予備'); expect(storage.values).toEqual(before);
  });
  it('strictly validates v1 before migration rather than laundering unknown fields or duplicate unlocks', () => {
    const mutations: ((payload: TestEnvelope) => void)[] = [
      p => { p.data.state.extra = true; },
      p => { p.data.state.spells.push('shard'); },
      p => { Reflect.set(p.data.state, 'ammo', { bomb: 6 }); },
      p => { p.data.state.wands[0].charges.bomb = -1; },
      p => { p.data.world.cells = [0, 1]; },
    ];
    for (const mutate of mutations) {
      const storage = new MemoryStorage(); legacySave(storage); tamper(storage, mutate);
      const before = new Map(storage.values); expect(loadRun(storage).run).toBeNull(); expect(storage.values).toEqual(before);
    }
  });
  it('rejects counterfeit inventory identities, out-of-bounds stock and pickups, and unknown v2 fields', () => {
    const mutations: ((payload: TestEnvelope) => void)[] = [
      p => { p.data.state.spells = Array(MAX_LOOSE_SPELLS + 1).fill('shard'); },
      p => { Reflect.set(p.data.state, 'spells', ['counterfeit']); },
      p => { p.data.state.wandPickups = []; },
      p => { p.data.state.wandPickups.push(p.data.state.wandPickups[0]); },
      p => { p.data.state.wandPickups[0].id = 'counterfeit-cache'; },
      p => { p.data.state.wandPickups[0].wand.id = p.data.state.wands[0].id; },
      p => { p.data.state.wands[1].id = p.data.state.wands[0].id; },
      p => { p.data.state.wands[0].id = ''; },
      p => { p.data.state.wandPickups[0].x = -1; },
      p => { p.data.state.wandPickups[0].x = 256; },
      p => { p.data.state.wandPickups[0].y = 384; },
      p => { Reflect.set(p.data.state.wandPickups[0], 'extra', 1); },
      p => { Reflect.set(p.data.state.wandPickups[0].wand, 'extra', 1); },
      p => { p.data.state.shopStock.lance = 3; },
      p => { p.data.state.shopStock.lance = -1; },
      p => { p.data.state.shopStock.lance = 0.5; },
      p => { delete p.data.state.shopStock.lance; },
      p => { Reflect.set(p.data.state.shopStock, 'counterfeit', 1); },
      p => { p.data.state.ammo.bomb = 7; },
      p => { p.data.state.ammo.bomb = 0; },
      p => { p.data.state.wandPickups[0].wand.charges.bomb = 0; },
      p => { Reflect.set(p.data.state.ammo, 'counterfeit', 1); },
      p => { p.data.state.wands[1].deck.reverse(); },
    ];
    for (const mutate of mutations) {
      const storage = new MemoryStorage(); expect(saveRun(new Run(2), storage).ok).toBe(true); tamper(storage, mutate);
      const before = new Map(storage.values); expect(loadRun(storage).run).toBeNull(); expect(storage.values).toEqual(before);
    }
  });
  it('resumes swapped shuffled decks and world simulation deterministically without repeating a cache reward', () => {
    const storage = new MemoryStorage(), run = new Run(3397);
    for (let frame = 0; frame < 120 && run.player.x < 66; frame++) run.step(1 / 60, { ...idleInput(), move: 1 });
    const pickup = run.nearbyWand()!; expect(run.exchangeWand(pickup.id, 0)).toBe(true);
    for (let frame = 0; frame < 31; frame++) run.step(1 / 60, { ...idleInput(), fire: true });
    expect(saveRun(run, storage).ok).toBe(true); const loaded = loadRun(storage).run!;
    expect(loaded.lastTriggerImpact).toBeNull(); expect(loaded.wandPickups).toEqual(run.wandPickups);
    for (let frame = 0; frame < 180; frame++) {
      const input = { ...idleInput(), fire: true, aimY: frame % 60 > 30 ? 0.5 : -0.3 };
      run.step(1 / 60, input); loaded.step(1 / 60, input);
    }
    expect(loaded.wands).toEqual(run.wands); expect(loaded.projectiles).toEqual(run.projectiles);
    expect(loaded.player).toEqual(run.player); expect(loaded.ammo).toEqual(run.ammo);
    expect(loaded.world.cells).toEqual(run.world.cells); expect(loaded.world.rngState).toBe(run.world.rngState);
    expect(loaded.wandPickups).toEqual(run.wandPickups);
    const a = new MemoryStorage(), b = new MemoryStorage();
    expect(saveRun(run, a).ok).toBe(true); expect(saveRun(loaded, b).ok).toBe(true);
    expect(b.getItem(SAVE_KEY)).toBe(a.getItem(SAVE_KEY));
  });
});
