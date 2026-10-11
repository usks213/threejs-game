import type { EnemyState } from '../types';
import type { Vec3 } from '../../world/types';
import { bossPartRayContact, sphereContactDistance } from './boss-parts';
/** First contact along a swept projectile, including separately targetable boss parts. */
export function enemyRayContact(enemy: EnemyState, origin: Vec3, direction: Vec3, limit: number, radius = 0): { point: Vec3; distance: number } | undefined {
 const part = bossPartRayContact(enemy, origin, direction, limit, radius);
 const body = sphereContactDistance(origin, direction, { x: enemy.x, y: enemy.y + (enemy.boss ? 1.7 : .6), z: enemy.z }, radius + (enemy.boss ? 1.8 : .7));
 if (part && (body === undefined || part.distance <= body)) return part;
 if (body === undefined || body > limit) return undefined;
 return { distance: body, point: { x: origin.x + direction.x * body, y: origin.y + direction.y * body, z: origin.z + direction.z * body } };
}
export function sweptEnemyContact(enemies: readonly EnemyState[], from: Vec3, to: Vec3, radius: number): { enemy: EnemyState; point: Vec3; distance: number } | undefined {
 const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z), direction = length > 1e-8 ? { x: (to.x - from.x) / length, y: (to.y - from.y) / length, z: (to.z - from.z) / length } : { x: 0, y: 0, z: 1 };
 let nearest: { enemy: EnemyState; point: Vec3; distance: number } | undefined;
 for (const enemy of enemies) {
  if (enemy.health <= 0) continue;
  const hit = enemyRayContact(enemy, from, direction, length, radius);
  if (hit && (!nearest || hit.distance < nearest.distance)) nearest = { enemy, ...hit };
 }
 return nearest;
}
