import type { EnemyState } from '../types';
import type { Vec3 } from '../../world/types';
import type { BossAttack } from '../bosses';
import { ATTACK_ORIGIN_HEIGHT, combatAim } from './direction';

export const BOSS_PART_IDS = ['leftDrive', 'rightDrive', 'focus'] as const;
export type BossPartId = typeof BOSS_PART_IDS[number];
export interface BossPartsState {
 version: 1;
 health: Record<BossPartId, number>;
 exposedUntil: number;
 lastHit?: BossPartId;
 hitUntil: number;
}
export interface BossPartDefinition { id: BossPartId; name: string; offset: Vec3; radius: number; health: number; color: string }
const supported = new Set(['stormcore', 'loadwarden', 'echowarden', 'sailwarden']);
const parts: readonly BossPartDefinition[] = [
 { id: 'leftDrive', name: '左の駆動殻', offset: { x: -1.95, y: 1.45, z: 0 }, radius: .58, health: 28, color: '#9db5c6' },
 { id: 'rightDrive', name: '右の駆動殻', offset: { x: 1.95, y: 1.45, z: 0 }, radius: .58, health: 28, color: '#9db5c6' },
 { id: 'focus', name: '冠の集光器', offset: { x: 0, y: 3.65, z: .65 }, radius: .58, health: 36, color: '#e4d99e' },
];
export function bossPartDefinitions(enemy: Pick<EnemyState, 'definition' | 'boss'>): readonly BossPartDefinition[] {
 return enemy.boss && supported.has(enemy.definition) ? parts : [];
}
/** Old saves acquire healthy armor on their first authoritative tick or hit. */
export function ensureBossParts(enemy: EnemyState): BossPartsState | undefined {
 if (!bossPartDefinitions(enemy).length) return undefined;
 return enemy.bossParts ??= { version: 1, health: { leftDrive: 28, rightDrive: 28, focus: 36 }, exposedUntil: 0, hitUntil: 0 };
}
export function bossPartPosition(enemy: EnemyState, part: BossPartDefinition): Vec3 {
 const yaw = enemy.heading ?? enemy.attackYaw ?? 0, s = Math.sin(yaw), c = Math.cos(yaw);
 return { x: enemy.x + part.offset.x * c + part.offset.z * s, y: enemy.y + part.offset.y, z: enemy.z - part.offset.x * s + part.offset.z * c };
}
export function bossPartHealth(enemy: EnemyState, part: BossPartDefinition): number { return enemy.bossParts?.health[part.id] ?? part.health; }
/** Ray/swept-sphere contact, shared by attack, device and reticle collision. */
export function sphereContactDistance(origin: Vec3, direction: Vec3, center: Vec3, radius: number): number | undefined {
 const x = origin.x - center.x, y = origin.y - center.y, z = origin.z - center.z;
 const along = x * direction.x + y * direction.y + z * direction.z;
 const discriminant = along * along - (x * x + y * y + z * z - radius * radius);
 if (discriminant < 0) return undefined;
 const root = Math.sqrt(discriminant), far = -along + root;
 return far < 0 ? undefined : Math.max(0, -along - root);
}
export function bossPartRayContact(enemy: EnemyState, origin: Vec3, direction: Vec3, limit: number, padding = 0): { point: Vec3; distance: number; part: BossPartId } | undefined {
 let nearest: { point: Vec3; distance: number; part: BossPartId } | undefined;
 for (const part of bossPartDefinitions(enemy)) {
  if (bossPartHealth(enemy, part) <= 0) continue;
  const distance = sphereContactDistance(origin, direction, bossPartPosition(enemy, part), part.radius + padding);
  if (distance === undefined || distance > limit || nearest && distance >= nearest.distance) continue;
  nearest = { distance, part: part.id, point: { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance, z: origin.z + direction.z * distance } };
 }
 return nearest;
}
export function bossMeleeContact(enemy: EnemyState, player: Vec3, aim: Vec3, reach: number, heading: number): Vec3 | undefined {
 return bossPartRayContact(enemy, { ...player, y: player.y + ATTACK_ORIGIN_HEIGHT }, combatAim(aim, heading), reach, .08)?.point;
}
/** No client-selected part IDs: authority resolves the part from its own contact. */
export function damageBossPart(enemy: EnemyState, damage: number, element: string, seconds: number, point?: Vec3, source?: Vec3): number {
 const state = ensureBossParts(enemy);
 if (!state || !point || !Number.isFinite(damage) || damage <= 0) return 1;
 const part = bossPartDefinitions(enemy).find(part => state.health[part.id] > 0 && Math.hypot(point.x - bossPartPosition(enemy, part).x, point.y - bossPartPosition(enemy, part).y, point.z - bossPartPosition(enemy, part).z) <= part.radius + .45);
 if (!part) return 1;
 const highStrike = part.id === 'focus' && !!source && source.y >= enemy.y + 1.4;
 const multiplier = element === 'impact' || element === 'shock' || element === 'lightning' ? 1.5 : highStrike ? 1.8 : 1;
 state.health[part.id] = Math.max(0, state.health[part.id] - damage * multiplier);
 state.lastHit = part.id; state.hitUntil = seconds + .28;
 if (state.health[part.id] === 0) {
  state.exposedUntil = seconds + 6;
  enemy.stagger = Math.max(enemy.stagger ?? 0, 1.2);
  enemy.windup = 0; enemy.cooldown = Math.max(enemy.cooldown, 1.5);
  enemy.attackReady ??= {}; enemy.attackReady.exposed = Math.max(enemy.attackReady.exposed ?? 0, state.exposedUntil);
 }
 return highStrike ? 1.6 : 1;
}
export function bossPartMovementScale(enemy: EnemyState): number {
 if (!enemy.bossParts) return 1;
 const broken = Number(enemy.bossParts.health.leftDrive <= 0) + Number(enemy.bossParts.health.rightDrive <= 0);
 return broken === 2 ? .45 : broken === 1 ? .7 : 1;
}
export function bossPartAttack(enemy: EnemyState, attack: BossAttack): BossAttack {
 if (!enemy.bossParts || enemy.bossParts.health.focus > 0) return attack;
 return { ...attack, shots: attack.shots ? Math.max(1, Math.ceil(attack.shots / 2)) : 0, cooldown: attack.cooldown + 1 };
}
export function validateBossParts(enemy: EnemyState): void {
 const state = enemy.bossParts;
 if (state === undefined) return;
 const finite = (v: unknown, max: number): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
 if (!state || typeof state !== 'object' || state.version !== 1 || !bossPartDefinitions(enemy).length || !state.health || typeof state.health !== 'object' || Array.isArray(state.health) || Object.keys(state.health).length !== 3 || !parts.every(part => Object.hasOwn(state.health, part.id) && finite(state.health[part.id], part.health)) || !finite(state.exposedUntil, 1e10) || !finite(state.hitUntil, 1e10) || state.lastHit !== undefined && !BOSS_PART_IDS.includes(state.lastHit) || Object.keys(state).some(key => !['version', 'health', 'exposedUntil', 'lastHit', 'hitUntil'].includes(key))) throw Error('ボス部位の保存が不正です');
}
