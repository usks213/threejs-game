import { WORLD_HEIGHT, WORLD_WIDTH } from './generation';
import { decodeRunSnapshot, encodeRunSnapshot } from './save';
import { OPEN_WORLD_WIDTH, OPEN_WORLD_HEIGHT } from './open-world';
import { MAX_RESOURCE, MAX_STRUCTURES, MAX_STRUCTURE_ID, structureSize, SURVIVAL_TOOLS, SurvivalRun } from './survival';
import type { Point, ResourceCounts, Structure, SurvivalTool } from './survival';

/** Survival never reads, overwrites, migrates or removes expedition saves. */
export const SURVIVAL_SAVE_KEY = 'emberfall-survival-save-v1';
export const SURVIVAL_BACKUP_KEY = 'emberfall-survival-backup-v1';
export const SURVIVAL_LEGACY_KEY = 'emberfall-survival-original-v1';
export const SURVIVAL_LEGACY_BACKUP_KEY = 'emberfall-survival-original-backup-v1';
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
function point(value: unknown, width: number, height: number): asserts value is Point {
  object(value, ['x', 'y']); number(value.x, 5, width - 6); number(value.y, 8, height - 10);
}
function checksum(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function validateSurvival(value: unknown, width: number, height: number): asserts value is SurvivalState {
  object(value, KEYS);
  object(value.resources, ['wood', 'stone', 'sand', 'ore', 'torch', 'workbench', 'camp']);
  for (const count of Object.values(value.resources)) number(count, 0, MAX_RESOURCE);
  requireValid(Array.isArray(value.structures) && value.structures.length <= MAX_STRUCTURES);
  const ids = new Set<number>();
  for (const structure of value.structures) {
    object(structure, ['id', 'type', 'x', 'y']);
    number(structure.id, 1, MAX_STRUCTURE_ID - 1); requireValid(!ids.has(structure.id)); ids.add(structure.id);
    requireValid(structure.type === 'torch' || structure.type === 'workbench' || structure.type === 'camp');
    const size = structureSize(structure.type);
    number(structure.x, 3 + size.halfWidth, width - 4 - size.halfWidth);
    number(structure.y, Math.max(5, size.height + 2), height - 5);
  }
  const structures = value.structures as unknown as Structure[];
  for (let i = 0; i < structures.length; i++) for (let j = i + 1; j < structures.length; j++) {
    const a = structures[i], b = structures[j], as = structureSize(a.type), bs = structureSize(b.type);
    requireValid(Math.abs(a.x - b.x) > as.halfWidth + bs.halfWidth || a.y < b.y - bs.height + 1 || b.y < a.y - as.height + 1);
  }
  point(value.spawn, width, height);
  if (value.camp === null) requireValid(!structures.some(s => s.type === 'camp'));
  else {
    point(value.camp, width, height);
    const camp = value.camp;
    requireValid(structures.some(s => s.type === 'camp' && s.x === camp.x && s.y - 4 === camp.y));
  }
  number(value.deaths, 0, 1e9); number(value.pickaxeLevel, 0, 1);
  requireValid(typeof value.tool === 'string' && SURVIVAL_TOOLS.includes(value.tool as SurvivalTool));
  number(value.toolCooldown, 0, 1, false); number(value.respawnProtection, 0, 3, false);
  number(value.nextStructureId, 1, MAX_STRUCTURE_ID);
  // Recovered structures leave gaps; IDs are monotonic and never reused.
  requireValid(value.nextStructureId > Math.max(0, ...ids));
}
function decodeRun(raw: unknown, width: number, height: number) {
  requireValid(typeof raw === 'string' && raw.length <= MAX_BYTES);
  const envelope: unknown = JSON.parse(raw);
  object(envelope, ['version', 'checksum', 'data']);
  requireValid(envelope.version === 2);
  // Reuse the independently tested v2 validator for world, physics RNG,
  // projectiles, enemies, finite cards, ammo, loot and unclaimed caches.
  const decoded = decodeRunSnapshot(raw, { width, height });
  requireValid(decoded && decoded.phase === 'playing' && decoded.level === 0 && decoded.perks.length === 0 && !decoded.perkChosen && decoded.perkOffers.length === 0);
  number(decoded.player.x, 3, width - 4, false); number(decoded.player.y, 4, height - 5, false);
  return decoded;
}
function parse(raw: string | null): { data: SurvivalData; base: ReturnType<typeof decodeRun>; migrated: boolean } | null {
  if (!raw || raw.length > MAX_BYTES) return null;
  try {
    const envelope: unknown = JSON.parse(raw); object(envelope, ['version', 'checksum', 'data']);
    requireValid((envelope.version === 1 || envelope.version === 2) && typeof envelope.checksum === 'string' && envelope.checksum === checksum(JSON.stringify(envelope.data)));
    object(envelope.data, ['run', 'survival']);
    const width = envelope.version === 1 ? WORLD_WIDTH : OPEN_WORLD_WIDTH, height = envelope.version === 1 ? WORLD_HEIGHT : OPEN_WORLD_HEIGHT;
    validateSurvival(envelope.data.survival, width, height);
    const base = decodeRun(envelope.data.run, width, height);
    return { data: envelope.data as unknown as SurvivalData, base, migrated: envelope.version === 1 };
  } catch { return null; }
}
export function saveSurvival(run: SurvivalRun, storage: SurvivalStorage): { ok: boolean; message: string } {
  try {
    const survival = Object.fromEntries(KEYS.map(key => [key, run[key]]));
    const legacy = run.world.width === WORLD_WIDTH && run.world.height === WORLD_HEIGHT;
    const width = legacy ? WORLD_WIDTH : OPEN_WORLD_WIDTH, height = legacy ? WORLD_HEIGHT : OPEN_WORLD_HEIGHT;
    validateSurvival(survival, width, height);
    const rawRun = encodeRunSnapshot(run, { width, height });
    decodeRun(rawRun, width, height);
    const data: SurvivalData = { run: rawRun, survival };
    const serialized = JSON.stringify({ version: legacy ? 1 : 2, checksum: checksum(JSON.stringify(data)), data });
    requireValid(serialized.length <= MAX_BYTES);
    const primary = storage.getItem(SURVIVAL_SAVE_KEY), backup = storage.getItem(SURVIVAL_BACKUP_KEY);
    const oldPrimary = parse(primary), oldBackup = parse(backup);
    // Loading never writes. The first explicit v2 save archives both old v1
    // records before normal primary/backup rotation, preserving rollback data.
    if (!legacy) {
      if (oldPrimary?.migrated && !storage.getItem(SURVIVAL_LEGACY_KEY)) storage.setItem(SURVIVAL_LEGACY_KEY, primary!);
      if (oldBackup?.migrated && !storage.getItem(SURVIVAL_LEGACY_BACKUP_KEY)) storage.setItem(SURVIVAL_LEGACY_BACKUP_KEY, backup!);
    }
    if (oldPrimary) storage.setItem(SURVIVAL_BACKUP_KEY, primary!);
    else if (!oldBackup) storage.setItem(SURVIVAL_BACKUP_KEY, serialized);
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
  const run = new SurvivalRun(saved.base.seed, false);
  Object.assign(run, saved.base, saved.data.survival);
  run.expandWorld(false);
  const recoveredStructures = run.recoverUnsupportedStructures();
  const recoveryNotice = recoveredStructures ? run.notice : '';
  run.recoverLoadedPlayer();
  return { run, message: (recovered ? '主保存を読み込めなかったため、予備の保存から拠点を再開した。' : '保存した世界と拠点を再開した。') + (saved.migrated ? '旧世界を広域世界へ移行した。外壁の接続口だけを開き、編集と持ち物を引き継いだ。' : '') + recoveryNotice };
}

