import {validateGear} from '../equipment/items';
import {validateCampSave} from './camp';
import { yawQuaternion } from './orientation';
import { insideBounds, WORLD } from '../../world/types';
import type { SkyboundSave } from './types';
import { SKY_LIMITS, PART_HALF, MATERIAL_MASS, PART_COST } from './types';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const identity = (v: unknown): v is string => typeof v === 'string' && !['__proto__','constructor','prototype'].includes(v) && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
const point = (v: unknown): boolean => object(v) && finite(v.x) && finite(v.y) && finite(v.z);
/** Validate before constructing live state. Unknown versions never overwrite an existing world. */
export function validateSkybound(raw: unknown, options: {replica?: boolean} = {}): SkyboundSave {
 if (!object(raw) || (raw.version !== 1 && raw.version !== 2) || !Array.isArray(raw.parts) || raw.parts.length > SKY_LIMITS.parts || !Array.isArray(raw.blueprints) || raw.blueprints.length > 1000 || !object(raw.fusions)) throw new Error('創作物の保存形式が不正です');
 const save = raw as unknown as SkyboundSave, ids = new Set<number>();
 for (const part of save.parts) {
  if (!object(part) || !Number.isSafeInteger(part.id) || part.id < 1 || ids.has(part.id) || !Object.hasOwn(PART_HALF, part.kind) || !Object.hasOwn(MATERIAL_MASS, part.material) || !point(part.position) || !insideBounds(part.position, WORLD, .05) || !point(part.velocity) || Math.hypot(part.velocity.x, part.velocity.y, part.velocity.z) > 50 || !finite(part.rotation) || Math.abs(part.rotation) > Math.PI * 2 + .01 || part.mass !== MATERIAL_MASS[part.material] * PART_COST[part.kind] + (part.cargoMass ?? 0) || !Number.isSafeInteger(part.epoch) || part.epoch < 0 || !Array.isArray(part.links) || part.links.length >= SKY_LIMITS.assembly || new Set(part.links).size !== part.links.length) throw new Error('創作部品が不正です');
  if ((part.energy !== undefined && (part.kind !== 'battery' || !finite(part.energy) || part.energy < 0 || part.energy > 175)) || (part.enabled !== undefined && typeof part.enabled !== 'boolean')) throw new Error('装置の状態が不正です');
  for (const [key, limit] of [['integrity',100],['burning',10],['wet',10],['frozen',10]] as const) if (part[key] !== undefined && (!finite(part[key]) || part[key]! < 0 || part[key]! > limit)) throw new Error('部品の環境状態が不正です');
  if (part.element !== undefined && (part.kind !== 'emitter' || !['fire','frost','shock'].includes(part.element))) throw new Error('放射属性が不正です');
  if ((part.creator!==undefined&&!identity(part.creator))||(part.shared!==undefined&&typeof part.shared!=='boolean'))throw new Error('部品の解体権限が不正です');
  if(part.loan!==undefined&&(!object(part.loan)||![850001,850002,850003].includes(part.loan.site)||!['cargo','device'].includes(part.loan.role)))throw new Error('貸出部品が不正です');
  if (part.trial !== undefined && (!Number.isInteger(part.trial) || part.trial < 825001 || part.trial > 825007)) throw new Error('試練部品が不正です');
  if ((part.anchored !== undefined && typeof part.anchored !== 'boolean') || (part.heated !== undefined && typeof part.heated !== 'boolean') || [part.carried,part.recalled].some(n => n !== undefined && (!finite(n) || n < 0 || n > 1000000))) throw new Error('試練の履歴が不正です');
  if(part.q!==undefined&&(!object(part.q)||![part.q.x,part.q.y,part.q.z,part.q.w].every(finite)||Math.abs(Math.hypot(part.q.x,part.q.y,part.q.z,part.q.w)-1)>.001)||part.angularVelocity!==undefined&&(!point(part.angularVelocity)||Math.hypot(part.angularVelocity.x,part.angularVelocity.y,part.angularVelocity.z)>4.001)||part.sleeping!==undefined&&typeof part.sleeping!=='boolean')throw new Error('物体の回転状態が不正です');
  ids.add(part.id);
 }
 validateCampSave(save, options.replica);
 for (const part of save.parts) for (const id of part.links) if (id === part.id || !ids.has(id) || !save.parts.find(p => p.id === id)!.links.includes(part.id)) throw new Error('接着グラフが不正です');
 for (const part of save.parts) { const found = new Set<number>(), pending = [part.id]; while (pending.length) { const id = pending.pop()!; if (found.has(id)) continue; found.add(id); pending.push(...save.parts.find(p => p.id === id)!.links); } if (found.size > SKY_LIMITS.assembly) throw new Error('構造物の部品数が上限を超えています'); }
 const plans = new Set<number>(), owners = new Map<string, number>();
 for (const plan of save.blueprints) {
  if (!object(plan) || !Number.isSafeInteger(plan.id) || plan.id < 1 || plans.has(plan.id) || !identity(plan.owner) || typeof plan.name !== 'string' || !plan.name.trim() || plan.name.length > 40 || !Array.isArray(plan.parts) || !plan.parts.length || plan.parts.length > SKY_LIMITS.assembly) throw new Error('設計帳が不正です');
  plans.add(plan.id); owners.set(plan.owner, (owners.get(plan.owner) ?? 0) + 1); if (owners.get(plan.owner)! > SKY_LIMITS.blueprints) throw new Error('設計帳が多すぎます');
  for (const p of plan.parts) if (!object(p) || !Object.hasOwn(PART_HALF, p.kind) || !Object.hasOwn(MATERIAL_MASS, p.material) || !point(p.offset) || Math.hypot(p.offset.x, p.offset.y, p.offset.z) > 64 || !finite(p.rotation) || Math.abs(p.rotation) > Math.PI * 2 + .01 || !Array.isArray(p.links) || new Set(p.links).size !== p.links.length || p.links.some(i => !Number.isInteger(i) || i < 0 || i >= plan.parts.length)) throw new Error('設計部品が不正です');
  for(const part of plan.parts)if(part.q&&(![part.q.x,part.q.y,part.q.z,part.q.w].every(finite)||Math.abs(Math.hypot(part.q.x,part.q.y,part.q.z,part.q.w)-1)>.001))throw new Error('設計姿勢が不正です');
  for (let i = 0; i < plan.parts.length; i++) for (const j of plan.parts[i].links) if (i === j || !plan.parts[j].links.includes(i)) throw new Error('設計の接着が不正です');
  const connected = new Set<number>(), pending = [0]; while (pending.length) { const i = pending.pop()!; if (connected.has(i)) continue; connected.add(i); pending.push(...plan.parts[i].links); } if (connected.size !== plan.parts.length) throw new Error('設計の接着が分離しています');
 }
 for (const [owner, list] of Object.entries(save.fusions)) if (!identity(owner) || !Array.isArray(list) || list.length > 32 || new Set(list.map(f => f.equipment)).size !== list.length || list.some(f => !object(f) || !['hands','sword','axe','flintAxe','flintKnife','flintSpear','spear','crudeBow','ironSword','crystalSword','bow','shield','towerShield','club'].includes(f.equipment) || !['stone','resin','crystal'].includes(f.material) || !finite(f.damage) || f.damage < 0 || f.damage > 12 || !finite(f.durability) || f.durability < 0 || f.durability > 30 || !['impact','fire','frost'].includes(f.effect))) throw new Error('合成保存が不正です');
 const minimum=Math.max(0,...save.parts.map(p=>p.id),...save.blueprints.map(p=>p.id))+1;if(!Number.isSafeInteger(minimum)||save.nextId!==undefined&&(!Number.isSafeInteger(save.nextId)||save.nextId<minimum))throw new Error('部品IDカウンターが不正です');
 const copy=structuredClone(save);if(copy.storageGear)for(const[id,gear]of Object.entries(copy.storageGear))copy.storageGear[id]=validateGear(gear,copy.storage?.[id]??{});copy.nextId=save.nextId??minimum;copy.version=2;for(const p of copy.parts){p.q??=yawQuaternion(p.rotation);p.angularVelocity??={x:0,y:0,z:0};p.sleeping??=false;}return copy;
}
