import { WORLD_HEIGHT, WORLD_WIDTH } from './generation';
import { loadRun, SAVE_KEY, saveRun } from './save';
import { MAX_RESOURCE, MAX_STRUCTURES, structureSize, SURVIVAL_TOOLS, SurvivalRun } from './survival';
import type { Point, ResourceCounts, Structure, SurvivalTool } from './survival';

/** Survival never reads, overwrites, migrates or removes expedition saves. */
export const SURVIVAL_SAVE_KEY = 'emberfall-survival-save-v1';
export const SURVIVAL_BACKUP_KEY = 'emberfall-survival-backup-v1';
export type SurvivalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const MAX_BYTES = 4_000_000;
const KEYS = ['resources', 'structures', 'spawn', 'camp', 'deaths', 'pickaxeLevel', 'tool', 'toolCooldown', 'respawnProtection', 'nextStructureId'] as const;
interface SurvivalState {
  resources: ResourceCounts; structures: Structure[]; spawn: Point; camp: Point | null;
  deaths: number; pickaxeLevel: 0 | 1; tool: SurvivalTool; toolCooldown: number;
  respawnProtection: number; nextStructureId: number;
}
interface SurvivalData { run: string; survival: SurvivalState }
type Value = Record<string, unknown>;
function requireValid(condition: unknown): asserts condition { if (!condition) throw new Error('Invalid survival save'); }
function object(value: unknown, keys: readonly string[]): asserts value is Value {
  requireValid(value !== null && typeof value === 'object' && !Array.isArray(value));
  requireValid(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
}
function number(value: unknown, min: number, max: number, integer = true): asserts value is number {
  requireValid(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)));
}
function point(value: unknown): asserts value is Point {
  object(value, ['x', 'y']); number(value.x, 5, WORLD_WIDTH - 6); number(value.y, 8, WORLD_HEIGHT - 10);
}
function checksum(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function memoryStorage(primary?: string): SurvivalStorage {
  const values = new Map<string, string>();
  if (primary) values.set(SAVE_KEY, primary);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}
function validateSurvival(value: unknown): asserts value is SurvivalState {
  object(value, KEYS);
  object(value.resources, ['wood', 'stone', 'sand', 'ore', 'torch', 'workbench', 'camp']);
  for (const count of Object.values(value.resources)) number(count, 0, MAX_RESOURCE);
  requireValid(Array.isArray(value.structures) && value.structures.length <= MAX_STRUCTURES);
  const ids = new Set<number>();
  for (const structure of value.structures) {
    object(structure, ['id', 'type', 'x', 'y']);
    number(structure.id, 1, 1e9); requireValid(!ids.has(structure.id)); ids.add(structure.id);
    requireValid(structure.type === 'torch' || structure.type === 'workbench' || structure.type === 'camp');
    const size = structureSize(structure.type);
    number(structure.x, 3 + size.halfWidth, WORLD_WIDTH - 4 - size.halfWidth);
    number(structure.y, Math.max(5, size.height + 2), WORLD_HEIGHT - 5);
  }
  const structures = value.structures as unknown as Structure[];
  for (let i = 0; i < structures.length; i++) for (let j = i + 1; j < structures.length; j++) {
    const a = structures[i], b = structures[j], as = structureSize(a.type), bs = structureSize(b.type);
    requireValid(Math.abs(a.x - b.x) > as.halfWidth + bs.halfWidth || a.y < b.y - bs.height + 1 || b.y < a.y - as.height + 1);
  }
  point(value.spawn);
  if (value.camp === null) requireValid(!structures.some(s => s.type === 'camp'));
  else {
    point(value.camp);
    const camp = value.camp;
    requireValid(structures.some(s => s.type === 'camp' && s.x === camp.x && s.y - 4 === camp.y));
  }
  number(value.deaths, 0, 1e9); number(value.pickaxeLevel, 0, 1);
  requireValid(typeof value.tool === 'string' && SURVIVAL_TOOLS.includes(value.tool as SurvivalTool));
  number(value.toolCooldown, 0, 1, false); number(value.respawnProtection, 0, 3, false);
  number(value.nextStructureId, 1, 1e9);
  requireValid(value.nextStructureId === Math.max(0, ...ids) + 1);
}
function decodeRun(raw: unknown) {
  requireValid(typeof raw === 'string' && raw.length <= MAX_BYTES);
  const envelope: unknown = JSON.parse(raw);
  object(envelope, ['version', 'checksum', 'data']);
  requireValid(envelope.version === 2);
  // Reuse the independently tested v2 validator for world, physics RNG,
  // projectiles, enemies, finite cards, ammo, loot and unclaimed caches.
  const decoded = loadRun(memoryStorage(raw)).run;
  requireValid(decoded && decoded.phase === 'playing' && decoded.level === 0 && decoded.perks.length === 0 && !decoded.perkChosen && decoded.perkOffers.length === 0);
  number(decoded.player.x, 3, WORLD_WIDTH - 4, false); number(decoded.player.y, 4, WORLD_HEIGHT - 5, false);
  return decoded;
}
function parse(raw: string | null): { data: SurvivalData; base: ReturnType<typeof decodeRun> } | null {
  if (!raw || raw.length > MAX_BYTES) return null;
  try {
    const envelope: unknown = JSON.parse(raw); object(envelope, ['version', 'checksum', 'data']);
    requireValid(envelope.version === 1 && typeof envelope.checksum === 'string' && envelope.checksum === checksum(JSON.stringify(envelope.data)));
    object(envelope.data, ['run', 'survival']);
    validateSurvival(envelope.data.survival);
    const base = decodeRun(envelope.data.run);
    return { data: envelope.data as unknown as SurvivalData, base };
  } catch { return null; }
}
export function saveSurvival(run: SurvivalRun, storage: SurvivalStorage): { ok: boolean; message: string } {
  try {
    const survival = Object.fromEntries(KEYS.map(key => [key, run[key]]));
    validateSurvival(survival);
    const isolated = memoryStorage();
    requireValid(saveRun(run, isolated).ok);
    const rawRun = isolated.getItem(SAVE_KEY); requireValid(rawRun);
    decodeRun(rawRun);
    const data: SurvivalData = { run: rawRun, survival };
    const serialized = JSON.stringify({ version: 1, checksum: checksum(JSON.stringify(data)), data });
    requireValid(serialized.length <= MAX_BYTES);
    const primary = storage.getItem(SURVIVAL_SAVE_KEY), backup = storage.getItem(SURVIVAL_BACKUP_KEY);
    if (parse(primary)) storage.setItem(SURVIVAL_BACKUP_KEY, primary!);
    else if (!parse(backup)) storage.setItem(SURVIVAL_BACKUP_KEY, serialized);
    storage.setItem(SURVIVAL_SAVE_KEY, serialized);
    return { ok: true, message: '地形・持ち物・拠点を保存した。' };
  } catch { return { ok: false, message: '保存できませんでした。空き容量や保存設定を確認してください。既存の有効な保存は保持しています。' }; }
}
export function loadSurvival(storage: SurvivalStorage): { run: SurvivalRun | null; message: string } {
  let primary: string | null, backup: string | null = null;
  try { primary = storage.getItem(SURVIVAL_SAVE_KEY); } catch { return { run: null, message: '保存データを読み取れませんでした。' }; }
  let saved = parse(primary), recovered = false;
  if (!saved) {
    try { backup = storage.getItem(SURVIVAL_BACKUP_KEY); } catch { return { run: null, message: '予備の保存データを読み取れませんでした。' }; }
    saved = parse(backup); recovered = Boolean(saved);
  }
  if (!saved) return { run: null, message: primary || backup ? '保存データの形式または内容が不正です。元のデータは変更していません。' : '保存された拠点はありません。' };
  const run = new SurvivalRun(saved.base.seed);
  Object.assign(run, saved.base, saved.data.survival);
  run.recoverLoadedPlayer();
  return { run, message: recovered ? '主保存を読み込めなかったため、予備の保存から拠点を再開した。' : '保存した世界と拠点を再開した。' };
}

