import { ENEMIES } from '../../content/catalog';
import type { EnemyState } from '../types';
import type { Vec3 } from '../../world/types';

/** The same committed sector drives the authority hit test and its ground tell. */
export const ORDINARY_MELEE_HALF_ARC = Math.PI / 3;
export function ordinaryMeleeReach(enemy: EnemyState): number {
 return (enemy.definition === 'cinderunner' ? 1.65 : ENEMIES.find(def => def.id === enemy.definition)?.reach ?? 1.7) + .6;
}
export function inOrdinaryMeleeArc(enemy: EnemyState, point: Vec3): boolean {
 const dx = point.x - enemy.x, dz = point.z - enemy.z, planar = Math.hypot(dx, dz);
 if (Math.hypot(dx, point.y - enemy.y, dz) >= ordinaryMeleeReach(enemy)) return false;
 const yaw = enemy.attackYaw ?? enemy.heading ?? 0;
 return planar < 1e-6 || (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / planar >= Math.cos(ORDINARY_MELEE_HALF_ARC);
}
export function hasOrdinaryMeleeTell(enemy: EnemyState): boolean {
 return !enemy.boss && ['walker', 'slime', 'shellguard', 'cinderunner'].includes(enemy.definition) && enemy.windup > 0 && (enemy.attackKind === 'melee' || enemy.attackKind === 'hop');
}
