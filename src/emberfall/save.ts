import { WORLD_HEIGHT, WORLD_WIDTH } from './generation';
import { CellWorld, MATERIALS } from './materials';
import { PERKS, Run } from './simulation';
import type { CastShot, SpellId, Wand } from './wands';
import { SPELLS } from './wands';
import { createAmmo, createShopStock, createWandPickups, MAX_LOOSE_SPELLS, MAX_WAND_PICKUPS, SPELL_PRICES, SPELL_STOCK } from './inventory';

export const SAVE_KEY = 'emberfall-save-v1';
export const BACKUP_KEY = 'emberfall-save-backup-v1';
type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const LEGACY_STATE_KEYS = ['player', 'enemies', 'projectiles', 'loot', 'wands', 'selected', 'gold', 'level', 'phase', 'perks', 'perkChosen', 'perkOffers', 'spells', 'portal', 'seed', 'time', 'kills', 'cause', 'notice', 'flask', 'sprayCooldown', 'materialAccumulator'] as const;
const STATE_KEYS = [...LEGACY_STATE_KEYS, 'wandPickups', 'shopStock', 'ammo'] as const;
type RunState = Pick<Run, typeof STATE_KEYS[number]>;
type LegacyState = Pick<Run, typeof LEGACY_STATE_KEYS[number]>;
interface WorldState { width: number; height: number; tick: number; rngState: number; cells: number[]; life: number[] }
interface SaveData { state: RunState; world: WorldState }
interface LegacySaveData { state: LegacyState; world: WorldState }
const MAX_BYTES = 4_000_000;
export interface RunDimensions { width: number; height: number }
const EXPEDITION_DIMENSIONS: RunDimensions = { width: WORLD_WIDTH, height: WORLD_HEIGHT };
type RecordValue = Record<string, unknown>;
function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid save');
}
function object(value: unknown, keys: readonly string[]): asserts value is RecordValue {
  requireValid(value !== null && typeof value === 'object' && !Array.isArray(value));
  requireValid(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
}
function number(value: unknown, min = 0, max = 1e9, integer = false): asserts value is number {
  requireValid(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)));
}
function text(value: unknown, max: number): asserts value is string { requireValid(typeof value === 'string' && value.length <= max); }
function bool(value: unknown): void { requireValid(typeof value === 'boolean'); }
function array(value: unknown, max: number): asserts value is unknown[] { requireValid(Array.isArray(value) && value.length <= max); }
function spell(value: unknown): asserts value is SpellId { requireValid(typeof value === 'string' && Object.hasOwn(SPELLS, value)); }
function strings(value: unknown, catalog: object, max: number, unique = false): void {
  array(value, max);
  requireValid(value.every(v => typeof v === 'string' && Object.hasOwn(catalog, v)));
  if (unique) requireValid(new Set(value).size === value.length);
}
function position(value: RecordValue, dimensions: RunDimensions = EXPEDITION_DIMENSIONS): void { number(value.x, -64, dimensions.width + 64); number(value.y, -64, dimensions.height + 64); }
function velocity(value: RecordValue): void { number(value.vx, -10000, 10000); number(value.vy, -10000, 10000); }
function encodeRle(values: Uint8Array): number[] {
  const encoded: number[] = [];
  for (let i = 0; i < values.length;) {
    const value = values[i]; let end = i + 1;
    while (end < values.length && values[end] === value) end++;
    encoded.push(value, end - i); i = end;
  }
  return encoded;
}
function validateRle(value: unknown, maximum: number, cellCount: number): asserts value is number[] {
  array(value, cellCount * 2); requireValid(value.length > 0 && value.length % 2 === 0);
  let count = 0;
  for (let i = 0; i < value.length; i += 2) {
    number(value[i], 0, maximum, true); number(value[i + 1], 1, cellCount, true);
    count += value[i + 1] as number; requireValid(count <= cellCount);
  }
  requireValid(count === cellCount);
}
function decodeRle(encoded: number[], target: Uint8Array): void {
  let offset = 0;
  for (let i = 0; i < encoded.length; i += 2) { target.fill(encoded[i], offset, offset + encoded[i + 1]); offset += encoded[i + 1]; }
}
function validateWand(value: unknown): asserts value is Wand {
  object(value, ['id', 'name', 'shuffle', 'capacity', 'spells', 'mana', 'maxMana', 'regen', 'castDelay', 'recharge', 'spread', 'cooldown', 'cursor', 'deck', 'charges', 'rng']);
  text(value.id, 100); text(value.name, 100); bool(value.shuffle); number(value.capacity, 1, 16, true);
  strings(value.spells, SPELLS, value.capacity); strings(value.deck, SPELLS, value.capacity);
  requireValid(JSON.stringify([...(value.spells as SpellId[])].sort()) === JSON.stringify([...(value.deck as SpellId[])].sort()));
  number(value.maxMana, 1, 100000); number(value.mana, 0, value.maxMana);
  number(value.regen, 0, 10000); number(value.castDelay, 0, 60); number(value.recharge, 0, 60);
  number(value.spread, 0, Math.PI); number(value.cooldown, 0, 60); number(value.cursor, 0, (value.deck as unknown[]).length, true); number(value.rng, 0, 0xffffffff, true);
  const limited = Object.keys(SPELLS).filter(id => SPELLS[id as SpellId].charges !== undefined);
  object(value.charges, limited);
  for (const id of limited) number(value.charges[id], 0, SPELLS[id as SpellId].charges, true);
}
const SHOT_KEYS = ['spell', 'damage', 'speed', 'radius', 'life', 'blast', 'dig', 'fire', 'angle'];
function validateShot(value: unknown, projectile: boolean, budget: { left: number }, depth = 0, dimensions: RunDimensions = EXPEDITION_DIMENSIONS): asserts value is CastShot {
  requireValid(depth <= 16 && --budget.left >= 0);
  requireValid(value !== null && typeof value === 'object');
  const hasTrigger = Object.hasOwn(value, 'trigger');
  object(value, [...SHOT_KEYS, ...(hasTrigger ? ['trigger'] : []), ...(projectile ? ['x', 'y', 'vx', 'vy', 'enemy'] : [])]);
  spell(value.spell); number(value.damage, 0, 10000); number(value.speed, 0, 10000); number(value.radius, 0, 128);
  number(value.life, 0, 60); number(value.blast, 0, 256); number(value.dig, 0, 256); number(value.angle, -Math.PI * 2, Math.PI * 2); bool(value.fire);
  if (projectile) { position(value, dimensions); velocity(value); bool(value.enemy); }
  if (hasTrigger) { array(value.trigger, 16); for (const shot of value.trigger) validateShot(shot, false, budget, depth + 1, dimensions); }
}
function validateData(value: unknown, version: 1 | 2 = 2, dimensions: RunDimensions = EXPEDITION_DIMENSIONS): void {
  number(dimensions.width, 3, 1536, true); number(dimensions.height, 3, 768, true);
  const cellCount = dimensions.width * dimensions.height;
  object(value, ['state', 'world']);
  const world = value.world; object(world, ['width', 'height', 'tick', 'rngState', 'cells', 'life']);
  requireValid(world.width === dimensions.width && world.height === dimensions.height);
  number(world.tick, 0, 1e12, true); number(world.rngState, 0, 0xffffffff, true);
  validateRle(world.cells, MATERIALS.length - 1, cellCount); validateRle(world.life, 255, cellCount);
  const s = value.state; object(s, version === 1 ? LEGACY_STATE_KEYS : STATE_KEYS);
  const p = s.player; object(p, ['x', 'y', 'vx', 'vy', 'hp', 'maxHp', 'fuel', 'maxFuel', 'wet', 'burning', 'toxic', 'oxygen', 'invulnerable', 'grounded']);
  position(p, dimensions); velocity(p); number(p.maxHp, 1, 10000); number(p.hp, 0, p.maxHp); number(p.maxFuel, 1, 10000); number(p.fuel, 0, p.maxFuel);
  for (const key of ['wet', 'burning', 'toxic', 'invulnerable']) number(p[key], 0, 10000);
  number(p.oxygen, 0, 100); bool(p.grounded);
  array(s.enemies, 256);
  const ids = new Set<number>();
  for (const e of s.enemies) {
    object(e, ['id', 'x', 'y', 'vx', 'vy', 'hp', 'maxHp', 'kind', 'cooldown', 'flash']); position(e, dimensions); velocity(e);
    number(e.id, 0, 100000, true); requireValid(!ids.has(e.id)); ids.add(e.id);
    number(e.maxHp, 1, 10000); number(e.hp, -10000, e.maxHp); number(e.cooldown, -1e9, 10000); number(e.flash, 0, 100);
    requireValid(['crawler', 'moth', 'sentry', 'warden'].includes(e.kind as string));
  }
  array(s.projectiles, 128); const budget = { left: 4096 }; for (const shot of s.projectiles) validateShot(shot, true, budget, 0, dimensions);
  array(s.loot, 1024); for (const item of s.loot) { object(item, ['x', 'y', 'value']); position(item, dimensions); number(item.value, 1, 100000, true); }
  array(s.wands, 2); requireValid(s.wands.length === 2); for (const wand of s.wands) validateWand(wand);
  number(s.selected, 0, s.wands.length - 1, true); number(s.gold, 0, 1e9, true); number(s.level, 0, 2, true);
  requireValid(['playing', 'refuge', 'dead', 'won'].includes(s.phase as string));
  requireValid(s.phase !== 'refuge' || Number(s.level) < 2);
  requireValid(s.phase === 'dead' ? p.hp === 0 : p.hp > 0);
  strings(s.perks, PERKS, 6, true); strings(s.perkOffers, PERKS, 3, true); bool(s.perkChosen); strings(s.spells, SPELLS, version === 1 ? 10 : MAX_LOOSE_SPELLS, version === 1);
  object(s.portal, ['x', 'y']); position(s.portal, dimensions); number(s.seed, 1, 0xffffffff, true); number(s.time); number(s.kills, 0, 1e9, true);
  text(s.cause, 500); text(s.notice, 2000); number(s.flask, 0, 180); number(s.sprayCooldown, 0, 1); number(s.materialAccumulator, 0, 1);
  if (version === 2) {
    array(s.wandPickups, MAX_WAND_PICKUPS); requireValid(s.wandPickups.length === 1);
    const pickupIds = new Set<string>();
    const wands = [...s.wands] as Wand[];
    for (const pickup of s.wandPickups) {
      object(pickup, ['id', 'x', 'y', 'wand']);
      text(pickup.id, 100); requireValid(pickup.id === `cache-${s.seed}-${s.level}` && !pickupIds.has(pickup.id)); pickupIds.add(pickup.id);
      number(pickup.x, 3, dimensions.width - 4); number(pickup.y, 4, dimensions.height - 5);
      validateWand(pickup.wand); wands.push(pickup.wand);
    }
    requireValid(new Set(wands.map(wand => wand.id)).size === wands.length);
    const maxAmmo = createAmmo(); object(s.ammo, Object.keys(maxAmmo));
    for (const [id, maximum] of Object.entries(maxAmmo)) {
      number(s.ammo[id], 0, maximum, true);
      requireValid(wands.every(wand => wand.charges[id] === (s.ammo as RecordValue)[id]));
    }
    for (const wand of wands) {
      requireValid(wand.id.length > 0);
      if (!wand.shuffle) requireValid(JSON.stringify(wand.spells) === JSON.stringify(wand.deck));
    }
    object(s.shopStock, Object.keys(SPELL_PRICES));
    for (const id of Object.keys(SPELL_PRICES)) number(s.shopStock[id], 0, SPELL_STOCK, true);
  }
}
/** Integrity check for accidental corruption, not a security/anti-cheat signature. */
function checksum(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function parse(raw: string | null, dimensions: RunDimensions = EXPEDITION_DIMENSIONS): { data: SaveData; migrated: boolean } | null {
  if (!raw || raw.length > MAX_BYTES) return null;
  try {
    const envelope: unknown = JSON.parse(raw); object(envelope, ['version', 'checksum', 'data']);
    requireValid(envelope.version === 1 || envelope.version === 2); text(envelope.checksum, 8);
    requireValid(envelope.checksum === checksum(JSON.stringify(envelope.data)));
    validateData(envelope.data, envelope.version, dimensions);
    if (envelope.version === 2) return { data: envelope.data as SaveData, migrated: false };
    const legacy = envelope.data as LegacySaveData;
    // v1 unlocks were unlimited. Preserve every equipped copy; grant one loose
    // copy only for legacy unlocked types not already present on either wand.
    const equipped = new Set(legacy.state.wands.flatMap(wand => wand.spells));
    const ammo = createAmmo();
    for (const id of Object.keys(ammo)) ammo[id] = Math.min(...legacy.state.wands.map(wand => wand.charges[id]));
    const migrated: SaveData = { ...legacy, state: { ...legacy.state,
      spells: legacy.state.spells.filter(id => !equipped.has(id)),
      wandPickups: createWandPickups(legacy.state.seed, legacy.state.level, legacy.state.perks.includes('reservoir')),
      shopStock: createShopStock(), ammo,
    } };
    for (const wand of [...migrated.state.wands, ...migrated.state.wandPickups.map(pickup => pickup.wand)]) wand.charges = { ...ammo };
    validateData(migrated, 2, dimensions); return { data: migrated, migrated: true };
  } catch { return null; }
}
function restore(data: SaveData): Run {
  const run = new Run(data.state.seed);
  Object.assign(run, data.state);
  const saved = data.world;
  run.world = new CellWorld(saved.width, saved.height, saved.rngState);
  decodeRle(saved.cells, run.world.cells); decodeRle(saved.life, run.world.life);
  run.world.tick = saved.tick; run.world.rngState = saved.rngState;
  run.particles = [];
  return run;
}
/** The strict state/world codec is reusable without touching expedition storage. */
export function encodeRunSnapshot(run: Run, dimensions: RunDimensions = EXPEDITION_DIMENSIONS): string {
  const state = Object.fromEntries(STATE_KEYS.map(key => [key, run[key]])) as RunState;
  const world = run.world;
  const data: SaveData = { state, world: { width: world.width, height: world.height, tick: world.tick, rngState: world.rngState, cells: encodeRle(world.cells), life: encodeRle(world.life) } };
  validateData(data, 2, dimensions);
  const serialized = JSON.stringify({ version: 2, checksum: checksum(JSON.stringify(data)), data });
  requireValid(serialized.length <= MAX_BYTES);
  return serialized;
}
export function decodeRunSnapshot(raw: string, dimensions: RunDimensions = EXPEDITION_DIMENSIONS): Run | null {
  const saved = parse(raw, dimensions);
  return saved ? restore(saved.data) : null;
}
export function saveRun(run: Run, storage: SaveStorage): { ok: boolean; message: string } {
  try {
    const serialized = encodeRunSnapshot(run);
    const primary = storage.getItem(SAVE_KEY), backup = storage.getItem(BACKUP_KEY);
    if (parse(primary)) storage.setItem(BACKUP_KEY, primary!);
    else if (!parse(backup)) storage.setItem(BACKUP_KEY, serialized);
    storage.setItem(SAVE_KEY, serialized);
    return { ok: true, message: '冒険を保存した。' };
  } catch { return { ok: false, message: '保存できませんでした。空き容量や保存設定を確認してください。既存の有効な保存は保持しています。' }; }
}
const MIGRATION_NOTICE = '旧保存を移行した。装備中のカードは保持し、未装備の習得術式は各1枚。鉱山の実は全杖で共通の残弾になった。';
export function loadRun(storage: SaveStorage): { run: Run | null; message: string } {
  let primary: string | null, backup: string | null;
  try { primary = storage.getItem(SAVE_KEY); } catch { return { run: null, message: '保存データを読み取れませんでした。' }; }
  const validPrimary = parse(primary);
  if (validPrimary) return { run: restore(validPrimary.data), message: validPrimary.migrated ? MIGRATION_NOTICE : '保存した冒険を再開した。' };
  try { backup = storage.getItem(BACKUP_KEY); } catch { return { run: null, message: '予備の保存データを読み取れませんでした。' }; }
  const validBackup = parse(backup);
  if (validBackup) return { run: restore(validBackup.data), message: '主保存を読み込めなかったため、予備の保存から再開した。' + (validBackup.migrated ? MIGRATION_NOTICE : '') };
  return { run: null, message: primary || backup ? '保存データの形式または内容が不正です。元のデータは変更していません。' : '保存された冒険はありません。' };
}
