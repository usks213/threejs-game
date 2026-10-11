import { describe, expect, it } from 'vitest';
import { Material } from '../../src/emberfall/materials';
import { BACKUP_KEY, SAVE_KEY } from '../../src/emberfall/save';
import { idleInput } from '../../src/emberfall/simulation';
import { MAX_STRUCTURE_ID, SurvivalRun } from '../../src/emberfall/survival';
import { loadSurvival, saveSurvival, SURVIVAL_BACKUP_KEY, SURVIVAL_SAVE_KEY } from '../../src/emberfall/survival-save';
import { editWand } from '../../src/emberfall/wands';

class MemoryStorage {
  values = new Map<string, string>();
  failKey = '';
  reads: string[] = [];
  getItem(key: string) { this.reads.push(key); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (key === this.failKey) throw new Error('quota'); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
interface Payload { version: number; checksum: string; data: { run: string; survival: Record<string, unknown> } }
function hash(value: unknown): string {
  const input = JSON.stringify(value); let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function tamper(storage: MemoryStorage, change: (payload: Payload) => void, rehash = true) {
  const payload: Payload = JSON.parse(storage.getItem(SURVIVAL_SAVE_KEY)!); change(payload);
  if (rehash) payload.checksum = hash(payload.data);
  storage.setItem(SURVIVAL_SAVE_KEY, JSON.stringify(payload)); storage.removeItem(SURVIVAL_BACKUP_KEY);
}
function camp(run: SurvivalRun) {
  run.resources.camp = 1; expect(run.place('camp', 25, 33)).toBe(true);
}

describe('isolated versioned survival saves', () => {
  it('roundtrips the complete world, crafted camp, finite cards, cache, ammunition, enemies and deterministic continuation', () => {
    const run = new SurvivalRun(34), storage = new MemoryStorage(); camp(run);
    run.resources.wood = 17; run.resources.stone = 11; run.resources.ore = 4;
    run.tool = 'wand'; run.selected = 1; editWand(run.wands[1], ['bomb', 'excavate']); run.castSelectedWand();
    run.world.set(95, 25, Material.Fire); run.world.set(97, 25, Material.Water);
    for (let i = 0; i < 30; i++) run.step(1 / 60, idleInput());
    run.enemies[0].hp = 11; run.loot.push({ x: 55, y: 27, value: 5 });
    expect(saveSurvival(run, storage).ok).toBe(true);
    const restored = loadSurvival(storage).run!;
    expect(restored).toBeInstanceOf(SurvivalRun); expect(restored.mode).toBe('survival');
    for (const key of ['player', 'enemies', 'projectiles', 'loot', 'wands', 'selected', 'spells', 'wandPickups', 'ammo', 'resources', 'structures', 'spawn', 'camp', 'tool', 'toolCooldown', 'deaths', 'pickaxeLevel', 'respawnProtection', 'nextStructureId'] as const) expect(restored[key]).toEqual(run[key]);
    expect(restored.world.cells).toEqual(run.world.cells); expect(restored.world.life).toEqual(run.world.life);
    for (let i = 0; i < 20; i++) { run.step(1 / 60, idleInput()); restored.step(1 / 60, idleInput()); }
    expect(restored.world.cells).toEqual(run.world.cells); expect(restored.world.life).toEqual(run.world.life);
    expect(restored.world.rngState).toBe(run.world.rngState); expect(restored.player).toEqual(run.player); expect(restored.enemies).toEqual(run.enemies);
    run.player.invulnerable = restored.player.invulnerable = 0;
    run.damage(1000, '爆発'); restored.damage(1000, '爆発');
    expect(restored.player).toEqual(run.player); expect(restored.resources).toEqual(run.resources); expect(restored.deaths).toBe(1);
  });
  it('never reads or changes the expedition primary or backup keys', () => {
    const storage = new MemoryStorage(); storage.values.set(SAVE_KEY, 'precious-old-primary'); storage.values.set(BACKUP_KEY, 'precious-old-backup');
    expect(loadSurvival(storage).run).toBeNull(); expect(saveSurvival(new SurvivalRun(2), storage).ok).toBe(true); expect(loadSurvival(storage).run).not.toBeNull();
    expect(storage.values.get(SAVE_KEY)).toBe('precious-old-primary'); expect(storage.values.get(BACKUP_KEY)).toBe('precious-old-backup');
    expect(storage.reads).not.toContain(SAVE_KEY); expect(storage.reads).not.toContain(BACKUP_KEY);
  });
  it('uses backup recovery without mutating either save and preserves a valid backup over corrupt primary', () => {
    const storage = new MemoryStorage(), run = new SurvivalRun(9); run.resources.wood = 9; saveSurvival(run, storage);
    run.resources.wood = 18; saveSurvival(run, storage);
    storage.setItem(SURVIVAL_SAVE_KEY, '{broken'); const backup = storage.getItem(SURVIVAL_BACKUP_KEY), before = new Map(storage.values);
    const loaded = loadSurvival(storage); expect(loaded.run!.resources.wood).toBe(9); expect(loaded.message).toContain('予備'); expect(storage.values).toEqual(before);
    run.resources.wood = 27; expect(saveSurvival(run, storage).ok).toBe(true);
    expect(storage.getItem(SURVIVAL_BACKUP_KEY)).toBe(backup); expect(loadSurvival(storage).run!.resources.wood).toBe(27);
  });
  it('surfaces quota and read errors without deleting a valid recovery copy', () => {
    const run = new SurvivalRun(2), storage = new MemoryStorage(); saveSurvival(run, storage); run.resources.stone = 9;
    storage.failKey = SURVIVAL_SAVE_KEY; expect(saveSurvival(run, storage).ok).toBe(false); expect(loadSurvival(storage).run!.resources.stone).toBe(0);
    storage.failKey = SURVIVAL_BACKUP_KEY; expect(saveSurvival(run, storage).ok).toBe(false); expect(loadSurvival(storage).run!.resources.stone).toBe(0);
    const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
    expect(loadSurvival(denied).message).toContain('読み取れません'); expect(saveSurvival(run, denied).ok).toBe(false);
  });
  it('rejects invalid live resource, structure and spawn data before any storage write', () => {
    const run = new SurvivalRun(1), storage = new MemoryStorage(); saveSurvival(run, storage); const before = new Map(storage.values);
    run.resources.wood = NaN; expect(saveSurvival(run, storage).ok).toBe(false); expect(storage.values).toEqual(before);
    run.resources.wood = 0; run.spawn.x = Infinity; expect(saveSurvival(run, storage).ok).toBe(false); expect(storage.values).toEqual(before);
    run.spawn.x = 40; run.structures.push({ id: 1, type: 'camp', x: 25, y: 33 }); expect(saveSurvival(run, storage).ok).toBe(false); expect(storage.values).toEqual(before);
  });
  it('strictly rejects malformed, missing, out-of-bounds and over-budget fields even with a new checksum', () => {
    const mutations: ((p: Payload) => void)[] = [
      p => { p.version = 2; },
      p => { Reflect.deleteProperty(p.data.survival, 'spawn'); },
      p => { Reflect.deleteProperty(p.data.survival, 'camp'); },
      p => { p.data.survival.extra = true; },
      p => { p.data.survival.resources = { wood: 1 }; },
      p => { Reflect.set(p.data.survival.resources as object, 'wood', -1); },
      p => { Reflect.set(p.data.survival.resources as object, 'stone', 0.5); },
      p => { Reflect.set(p.data.survival.resources as object, 'ore', 100001); },
      p => { p.data.survival.spawn = { x: 0, y: 27 }; },
      p => { p.data.survival.spawn = { x: 40, y: 999 }; },
      p => { p.data.survival.camp = { x: 25, y: 29 }; },
      p => { p.data.survival.tool = 'teleport'; },
      p => { p.data.survival.pickaxeLevel = 2; },
      p => { p.data.survival.respawnProtection = 999; },
      p => { p.data.survival.structures = Array(97).fill({ id: 1, type: 'torch', x: 20, y: 33 }); },
      p => { p.data.survival.structures = [{ id: 1, type: 'torch', x: -1, y: 33 }]; p.data.survival.nextStructureId = 2; },
      p => { p.data.survival.structures = [{ id: 1, type: 'torch', x: 20, y: 33 }, { id: 1, type: 'torch', x: 30, y: 33 }]; p.data.survival.nextStructureId = 2; },
      p => { p.data.survival.structures = [{ id: 1, type: 'torch', x: 20, y: 33 }, { id: 2, type: 'torch', x: 20, y: 33 }]; p.data.survival.nextStructureId = 3; },
      p => { p.data.survival.nextStructureId = 0; },
      p => { p.data.run = '{broken'; },
      p => { const nested = JSON.parse(p.data.run) as { checksum: string; data: { state: { player: { hp: number } } } }; nested.data.state.player.hp = -100; nested.checksum = hash(nested.data); p.data.run = JSON.stringify(nested); },
    ];
    const initial = new MemoryStorage(); expect(saveSurvival(new SurvivalRun(3), initial).ok).toBe(true);
    for (const change of mutations) {
      const storage = new MemoryStorage(); storage.values = new Map(initial.values); tamper(storage, change); const before = new Map(storage.values);
      expect(loadSurvival(storage).run).toBeNull(); expect(storage.values).toEqual(before);
    }
  });
  it('refuses shallow camps whose respawn point cannot meet the save clearance bounds', () => {
    const run = new SurvivalRun(4), storage = new MemoryStorage();
    run.player.x = 40; run.player.y = 9; run.resources.camp = 1;
    run.world.fillRect(24, 3, 12, 10, Material.Air); run.world.fillRect(24, 12, 12, 1, Material.Rock);
    expect(run.place('camp', 30, 11)).toBe(false); expect(run.resources.camp).toBe(1); expect(run.camp).toBeNull();
    expect(saveSurvival(run, storage).ok).toBe(true);
  });
  it('loads old floating structures through one recovery pass while preserving v1 schema and storage', () => {
    const run = new SurvivalRun(5), storage = new MemoryStorage(); camp(run);
    run.world.set(25, 34, Material.Air);
    expect(saveSurvival(run, storage).ok).toBe(true);
    const before = new Map(storage.values), old = JSON.parse(storage.getItem(SURVIVAL_SAVE_KEY)!) as Payload;
    expect(old.version).toBe(1);
    const result = loadSurvival(storage), loaded = result.run!;
    expect(loaded.structures).toHaveLength(0); expect(loaded.resources.camp).toBe(1); expect(loaded.camp).toBeNull();
    expect(loaded.nextStructureId).toBe(2); expect(result.message).toContain('足場'); expect(storage.values).toEqual(before);
    expect(loaded.recoverUnsupportedStructures()).toBe(0); expect(loaded.resources.camp).toBe(1);
    expect(saveSurvival(loaded, storage).ok).toBe(true);
    const again = loadSurvival(storage).run!; expect(again.resources.camp).toBe(1); expect(again.structures).toHaveLength(0);
    expect(again.nextStructureId).toBe(2); expect(again.camp).toBeNull();
  });
  it('preserves monotonic structure IDs after recovering the highest ID and still rejects ID reuse', () => {
    const run = new SurvivalRun(5), storage = new MemoryStorage(); camp(run);
    for (let i = 0; i < 20; i++) run.step(1 / 60, idleInput());
    expect(run.mine(25, 32)).toBe(true); expect(run.structures).toHaveLength(0); expect(run.nextStructureId).toBe(2);
    expect(saveSurvival(run, storage).ok).toBe(true); const restored = loadSurvival(storage).run!;
    expect(restored.nextStructureId).toBe(2); expect(restored.resources.camp).toBe(1);
    for (let i = 0; i < 20; i++) restored.step(1 / 60, idleInput());
    expect(restored.place('camp', 25, 33)).toBe(true); expect(restored.structures[0].id).toBe(2);
    expect(saveSurvival(restored, storage).ok).toBe(true);
    tamper(storage, p => { p.data.survival.nextStructureId = 2; }); expect(loadSurvival(storage).run).toBeNull();
  });
  it('keeps the last allocatable structure ID saveable and rejects further placements atomically', () => {
    const run = new SurvivalRun(5), storage = new MemoryStorage(); run.resources.torch = 2;
    run.nextStructureId = MAX_STRUCTURE_ID - 1;
    expect(run.place('torch', 25, 33)).toBe(true);
    expect(run.structures[0].id).toBe(MAX_STRUCTURE_ID - 1); expect(run.nextStructureId).toBe(MAX_STRUCTURE_ID);
    expect(saveSurvival(run, storage).ok).toBe(true);
    const loaded = loadSurvival(storage).run!;
    for (let i = 0; i < 20; i++) loaded.step(1 / 60, idleInput());
    expect(loaded.placementStatus('torch', 31, 33).reason).toBe('limit');
    expect(loaded.place('torch', 31, 33)).toBe(false); expect(loaded.resources.torch).toBe(1); expect(loaded.structures).toHaveLength(1);
    expect(loaded.nextStructureId).toBe(MAX_STRUCTURE_ID); expect(saveSurvival(loaded, storage).ok).toBe(true);
  });
  it('rejects changed checksums and oversized payloads', () => {
    const storage = new MemoryStorage(); saveSurvival(new SurvivalRun(3), storage);
    tamper(storage, p => { p.data.survival.deaths = 1; }, false); expect(loadSurvival(storage).run).toBeNull();
    storage.setItem(SURVIVAL_SAVE_KEY, ' '.repeat(4_000_001)); expect(loadSurvival(storage).run).toBeNull();
  });
  it('recovers an embedded saved player while retaining a blocked camp and all inventory', () => {
    const run = new SurvivalRun(5), storage = new MemoryStorage(); camp(run);
    run.resources.wood = 17; run.world.fillRect(3, 8, 65, 42, Material.Rock);
    expect(saveSurvival(run, storage).ok).toBe(true); const stored = new Map(storage.values);
    const restored = loadSurvival(storage).run!;
    expect(restored.collides(restored.player.x, restored.player.y)).toBe(false);
    expect(restored.camp).toEqual(run.camp); expect(restored.structures).toEqual(run.structures); expect(restored.resources.wood).toBe(17);
    expect(restored.deaths).toBe(0); expect(restored.respawnProtection).toBe(3); expect(storage.values).toEqual(stored);
    restored.player.hp = 1; restored.respawnProtection = 0; restored.player.invulnerable = 0; restored.damage(2, '再開後'); expect(restored.deaths).toBe(1);
  });
});
