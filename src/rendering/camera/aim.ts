import {enemyRayContact} from '../../game/combat/enemy-contact';
import type { AdventureSnapshot } from '../../game/types';
import type { Vec3 } from '../../world/types';
import type { SphereBody } from '../../physics/sphere';
import { ATTACK_ORIGIN_HEIGHT } from '../../game/combat/direction';
import { objectOcclusion } from '../../game/voxel/occlusion';

export const RETICLE_DISTANCE = 32;

/** Intersection with the same simplified body volumes used by projectile combat. */
function sphereDistance(origin: Vec3, direction: Vec3, center: Vec3, radius: number, height = 0): number | null {
  const x = origin.x - center.x, y = origin.y - center.y - height, z = origin.z - center.z;
  const along = x * direction.x + y * direction.y + z * direction.z;
  const discriminant = along * along - (x * x + y * y + z * z - radius * radius);
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant), near = -along - root, far = -along + root;
  return far < 0 ? null : Math.max(0, near);
}

/** No aim assist: only occupied objects actually intersecting the center ray count. */
export function reticleObjectDistance(state: AdventureSnapshot, origin: Vec3, direction: Vec3, limit: number, bodies: readonly SphereBody[] = []): number {
  let nearest = objectOcclusion(state, origin, direction, limit);
  for (const enemy of state.enemies) {
    if (enemy.health <= 0) continue;
    const hit = enemyRayContact(enemy, origin, direction, limit);
    if (hit) nearest = Math.min(nearest, hit.distance);
  }
  for (const body of bodies) {
    const hit = sphereDistance(origin, direction, body.position, body.radius);
    if (hit !== null) nearest = Math.min(nearest, hit);
  }
  return nearest;
}

/** Converge the attack origin on the reticle hit rather than copying a parallel camera ray. */
export function aimFromReticle(player: Vec3, origin: Vec3, direction: Vec3, hitDistance = RETICLE_DISTANCE): Vec3 {
  const px = player.x, py = player.y + ATTACK_ORIGIN_HEIGHT, pz = player.z;
  // A camera-side obstruction must not turn an attack backwards toward the camera.
  const playerDistance = (px - origin.x) * direction.x + (py - origin.y) * direction.y + (pz - origin.z) * direction.z;
  const distance = hitDistance > playerDistance + .05 ? hitDistance : Math.max(RETICLE_DISTANCE, playerDistance + RETICLE_DISTANCE);
  const x = origin.x + direction.x * distance - px, y = origin.y + direction.y * distance - py, z = origin.z + direction.z * distance - pz;
  const length = Math.hypot(x, y, z);
  return length > 1e-7 ? { x: x / length, y: y / length, z: z / length } : { ...direction };
}
