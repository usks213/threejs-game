import {validateAdventureGear,validateCampGear} from '../game/equipment/validation';
import {validateSharedPins,type SharedPin} from '../game/shared-pins';
import {validateCompanions,type CompanionSave} from '../game/companions';
import { validateSkybound } from '../game/skybound/validation';
import type { SkyboundSave } from '../game/skybound/types';
import { validateAdventure } from './adventure';
import type { AdventureSave } from '../game/types';
import { SdfWorld } from '../world/density';
import { WORLD, MAX_EDITS, finiteVec, insideBounds, type Vec3, type EditOperation } from '../world/types';
import { type FluidCell } from '../fluid/fluid';
import type { SphereBody } from '../physics/sphere';
export type SavedPlayer=Vec3&{crouching?:boolean};
export interface WorldSave {nextEntityId?:number;sharedPins?:SharedPin[];companions?:CompanionSave; version: 1 | 2; skybound?: SkyboundSave; adventure?: AdventureSave; members?: { id: string; player: SavedPlayer; adventure: AdventureSave }[]; generator: 1 | 2 | 3 | 4; seed: number; player: SavedPlayer; edits: EditOperation[]; fluids: FluidCell[]; bodies: SphereBody[] }
export function validateSave(raw: unknown): WorldSave {
  if (!raw || typeof raw !== 'object') throw new Error('セーブ形式が不正です');
  const s = raw as WorldSave;
  if ((s.version !== 1 && s.version !== 2) || (s.generator !== 1 && s.generator !== 2 && s.generator !== 3 && s.generator !== 4) || s.seed !== WORLD.seed || !s.player || !insideBounds(s.player, WORLD, 1) || !Array.isArray(s.edits) || s.edits.length > MAX_EDITS || !Array.isArray(s.fluids) || !Array.isArray(s.bodies)) throw new Error('対応しないセーブ、または上限を超えています');
  if(s.player.crouching!==undefined&&typeof s.player.crouching!=='boolean')throw Error('保存された姿勢が不正です');
  if(s.nextEntityId!==undefined&&(!Number.isSafeInteger(s.nextEntityId)||s.nextEntityId<1||s.nextEntityId>1e12))throw Error('ワールドの識別子が不正です');
  const world = new SdfWorld(undefined,s.generator);
  for (const edit of s.edits) { if (!edit?.position) throw new Error('編集データが不正です'); world.apply(edit); }
  const cells = new Set<string>();
  for (const c of s.fluids) {
    if (!c || !insideBounds(c, WORLD, 1) || (![1,.5].includes(c.size??1)||![c.x,c.y,c.z].every(v=>Number.isInteger(v/(c.size??1)))) || !Number.isFinite(c.volume) || c.volume <= 0 || c.volume > (c.size??1)**3 || [c.vx ?? 0, c.vz ?? 0].some(v => !Number.isFinite(v) || Math.abs(v) > 6)) throw new Error('水データが不正です');
    const id = `${c.x},${c.y},${c.z}`; if (cells.has(id)) throw new Error('水データが重複しています'); cells.add(id);
  }
  const ids = new Set<number>();
  for (const b of s.bodies) {
    if (!b?.position || !b.velocity || !insideBounds(b.position, WORLD, 1) || !finiteVec(b.velocity) || Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z) > 30 || b.radius !== 0.55 || (b.kind !== undefined && !['rock','wood','debris'].includes(b.kind)) || !Number.isSafeInteger(b.id) || b.id < 1 || typeof b.sleeping !== 'boolean' || ids.has(b.id)) throw new Error('物理データが不正です');
    ids.add(b.id);
  }
  if (s.members && (!Array.isArray(s.members) || s.members.length > 10000 || s.members.some(member => !/^[a-zA-Z0-9_-]{1,64}$/.test(member.id) || !insideBounds(member.player, WORLD, 1)||member.player.crouching!==undefined&&typeof member.player.crouching!=='boolean'))) throw new Error('参加者セーブが不正です');
  const members = s.members?.map(member => ({ id: member.id, player: { ...member.player }, adventure: validateAdventure(member.adventure) }));
  const skybound=s.skybound!==undefined?validateSkybound(s.skybound):undefined;
  const adventure=s.version===2?validateAdventure(s.adventure!):undefined,gearIds=new Set<number>();let maximumGear=adventure?validateAdventureGear(adventure,gearIds):0;for(const member of members??[])maximumGear=Math.max(maximumGear,validateAdventureGear(member.adventure,gearIds));if(skybound)maximumGear=Math.max(maximumGear,validateCampGear(skybound,gearIds));if(s.nextEntityId!==undefined&&s.nextEntityId<=maximumGear)throw Error('装備の識別子カウンターが古い値です');
  // Drop unrecognized fields and detach references from imported objects.
  return {...(s.nextEntityId!==undefined?{nextEntityId:s.nextEntityId}:{}),...(s.sharedPins?{sharedPins:validateSharedPins(s.sharedPins)}:{}),...(s.companions?{companions:validateCompanions(s.companions)}:{}), ...(s.skybound !== undefined ? {skybound: skybound!} : {}), ...(members ? { members } : {}), version: s.version, ...(s.version === 2 ? { adventure: adventure! } : {}), generator: s.generator, seed: s.seed, player: { x: s.player.x, y: s.player.y, z: s.player.z,...(s.player.crouching?{crouching:true}:{}) }, edits: world.edits, fluids: s.fluids.map(c => ({ x: c.x, y: c.y, z: c.z, size:c.size, volume: c.volume, vx: c.vx ?? 0, vz: c.vz ?? 0 })), bodies: s.bodies.map(b => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } })) };
}

