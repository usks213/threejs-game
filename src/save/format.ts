import { validateAdventure } from './adventure';
import type { AdventureSave } from '../game/types';
import { SdfWorld } from '../world/density';
import { WORLD, MAX_EDITS, finiteVec, insideBounds, type Vec3, type EditOperation } from '../world/types';
import { MAX_FLUID_CELLS, type FluidCell } from '../fluid/fluid';
import type { SphereBody } from '../physics/sphere';
export interface WorldSave { version: 1 | 2; adventure?: AdventureSave; members?: { id: string; player: Vec3; adventure: AdventureSave }[]; generator: 1 | 2; seed: number; player: Vec3; edits: EditOperation[]; fluids: FluidCell[]; bodies: SphereBody[] }
export function validateSave(raw: unknown): WorldSave {
  if (!raw || typeof raw !== 'object') throw new Error('セーブ形式が不正です');
  const s = raw as WorldSave;
  if ((s.version !== 1 && s.version !== 2) || (s.generator !== 1 && s.generator !== 2) || s.seed !== WORLD.seed || !s.player || !insideBounds(s.player, WORLD, 1) || !Array.isArray(s.edits) || s.edits.length > MAX_EDITS || !Array.isArray(s.fluids) || s.fluids.length > MAX_FLUID_CELLS || !Array.isArray(s.bodies)) throw new Error('対応しないセーブ、または上限を超えています');
  const world = new SdfWorld(undefined,s.generator);
  for (const edit of s.edits) { if (!edit?.position) throw new Error('編集データが不正です'); world.apply(edit); }
  const cells = new Set<string>();
  for (const c of s.fluids) {
    if (!c || !insideBounds(c, WORLD, 1) || ![c.x, c.y, c.z].every(Number.isInteger) || !Number.isFinite(c.volume) || c.volume <= 0 || c.volume > 1) throw new Error('水データが不正です');
    const id = `${c.x},${c.y},${c.z}`; if (cells.has(id)) throw new Error('水データが重複しています'); cells.add(id);
  }
  const ids = new Set<number>();
  for (const b of s.bodies) {
    if (!b?.position || !b.velocity || !insideBounds(b.position, WORLD, 1) || !finiteVec(b.velocity) || Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z) > 30 || b.radius !== 0.55 || (b.kind !== undefined && !['rock','wood','debris'].includes(b.kind)) || !Number.isSafeInteger(b.id) || b.id < 1 || typeof b.sleeping !== 'boolean' || ids.has(b.id)) throw new Error('物理データが不正です');
    ids.add(b.id);
  }
  if (s.members && (!Array.isArray(s.members) || s.members.length > 10000 || s.members.some(member => !/^[a-zA-Z0-9_-]{1,64}$/.test(member.id) || !insideBounds(member.player, WORLD, 1)))) throw new Error('参加者セーブが不正です');
  const members = s.members?.map(member => ({ id: member.id, player: { ...member.player }, adventure: validateAdventure(member.adventure) }));
  // Drop unrecognized fields and detach references from imported objects.
  return { ...(members ? { members } : {}), version: s.version, ...(s.version === 2 ? { adventure: validateAdventure(s.adventure!) } : {}), generator: s.generator, seed: s.seed, player: { x: s.player.x, y: s.player.y, z: s.player.z }, edits: world.edits, fluids: s.fluids.map(c => ({ x: c.x, y: c.y, z: c.z, volume: c.volume })), bodies: s.bodies.map(b => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } })) };
}
