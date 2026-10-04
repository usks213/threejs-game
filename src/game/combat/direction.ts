import type { Vec3 } from '../../world/types';

export const ATTACK_ORIGIN_HEIGHT = .85;

/** Movement and facing use the horizontal aim, independent of camera pitch. */
export function horizontalAim(aim: Vec3, heading: number): Vec3 {
 const length = Math.hypot(aim.x, aim.z);
 if (Number.isFinite(length) && length > 1e-6) return { x: aim.x / length, y: 0, z: aim.z / length };
 return { x: Math.sin(heading), y: 0, z: Math.cos(heading) };
}

/** Preserve pitch for projectiles and voxel strikes without trusting input magnitude. */
export function combatAim(aim: Vec3, heading: number): Vec3 {
 const length = Math.hypot(aim.x, aim.y, aim.z);
 if (Number.isFinite(length) && length > 1e-6) return { x: aim.x / length, y: aim.y / length, z: aim.z / length };
 return horizontalAim({ x: 0, y: 0, z: 0 }, heading);
}
