import type { Vec3 } from '../../world/types';
import { ATTACK_ORIGIN_HEIGHT, horizontalAim } from './direction';

export type AttackKind = 'swing' | 'thrust' | 'overhead' | 'shot';
/** Transient authoritative timeline shared by collision and avatar animation. */
export interface AttackMotion {
 elapsed: number;
 windup: number;
 active: number;
 duration: number;
 kind: AttackKind;
 combo: number;
 heavy: boolean;
}
export interface AttackProfile extends AttackMotion {
 halfArc: number;
 verticalTolerance: number;
 damageScale: number;
}
export const ATTACK_BUFFER_SECONDS = .18;
export const COMBO_GRACE_SECONDS = .24;

export function attackProfile(equipment: string, cooldown: number, heavy: boolean, combo = 1, ranged = false): AttackProfile {
 const spear = equipment === 'spear' || equipment === 'flintSpear', knife = equipment === 'flintKnife';
 const kind: AttackKind = ranged ? 'shot' : spear ? 'thrust' : heavy || combo === 3 || equipment === 'antlerPickaxe' ? 'overhead' : 'swing';
 const duration = cooldown * (heavy ? 1.8 : 1);
 // Quick weapons get a quick start; heavier ones spend more of their cycle preparing.
 const windup = Math.min(duration * .53, heavy ? Math.max(.32, cooldown * .55) : Math.max(.12, Math.min(.22, cooldown * .32)));
 const active = Math.min(duration - windup - .06, heavy ? .16 : knife ? .07 : .1);
 return { elapsed: 0, windup: equipment === 'hands' ? (heavy ? .32 : .16) : windup,
  active, duration, kind, combo, heavy, halfArc: spear ? .28 : heavy ? 1.05 : knife ? .55 : .8,
  verticalTolerance: spear ? .32 : .6, damageScale: !heavy && combo === 3 ? 1.4 : 1 };
}

/** Phase-limited movement: commitment has weight, without stopping the player outright. */
export function attackMovementScale(motion?: AttackMotion): number {
 if (!motion) return 1;
 if (motion.elapsed < motion.windup) return .48;
 if (motion.elapsed < motion.windup + motion.active) return .3;
 const recovery = (motion.elapsed - motion.windup - motion.active) / Math.max(.01, motion.duration - motion.windup - motion.active);
 return .48 + .3 * Math.min(1, recovery);
}

/** Approximate body volume, not a point at the creature's feet. Kept deliberately simple. */
export function meleeBody(definition: string, boss: boolean): { radius: number; height: number } {
 if (boss) return { radius: .8, height: 2.6 };
 if (definition === 'deer') return { radius: .5, height: 1.7 };
 if (definition === 'boar') return { radius: .45, height: 1 };
 if (definition === 'neck' || definition === 'slime' || definition === 'gull') return { radius: .32, height: .7 };
 if (definition === 'greydwarfBrute') return { radius: .45, height: 2 };
 return { radius: .32, height: 1.6 };
}

/** Returns a visible body contact for the committed forward arc/thrust, including pitched slopes. */
export function meleeContact(player: Vec3, target: Vec3, aim: Vec3, reach: number, profile: Pick<AttackProfile, 'halfArc' | 'verticalTolerance'>, body: { radius: number; height: number }, heading = 0): Vec3 | null {
 const direction = horizontalAim(aim, heading), dx = target.x - player.x, dz = target.z - player.z;
 const distance = Math.hypot(dx, dz), forward = dx * direction.x + dz * direction.z;
 // Body radius may extend reach, but may never turn a sideways/behind target into a hit.
 if (forward <= 1e-6 || distance < 1e-6 || distance - body.radius > reach) return null;
 const side = Math.abs(dx * direction.z - dz * direction.x);
 if (Math.atan2(side, forward) > profile.halfArc + Math.min(.18, Math.atan2(body.radius, distance))) return null;
 const horizontal = Math.hypot(aim.x, aim.z), slope = Math.max(-1.25, Math.min(1.25, aim.y / Math.max(.01, horizontal)));
 const expectedY = player.y + ATTACK_ORIGIN_HEIGHT + slope * forward;
 const y = Math.max(target.y + .12, Math.min(target.y + body.height, expectedY));
 if (Math.abs(expectedY - y) > profile.verticalTolerance) return null;
 const near = Math.max(0, distance - body.radius), fraction = near / distance;
 if (Math.hypot(near, y - player.y - ATTACK_ORIGIN_HEIGHT) > reach) return null;
 return { x: player.x + dx * fraction, y, z: player.z + dz * fraction };
}
