import type { AttackMotion } from '../../game/combat/attack';

export interface MeleePose { armX: number; armY: number; armZ: number; handX: number; handZ: number; torsoX: number; torsoY: number }
const rest: MeleePose = { armX: 0, armY: 0, armZ: 0, handX: 0, handZ: 0, torsoX: 0, torsoY: 0 };
const mix = (a: MeleePose, b: MeleePose, amount: number): MeleePose => {
 const t = Math.max(0, Math.min(1, amount)), smooth = t * t * (3 - 2 * t);
 return { armX: a.armX + (b.armX - a.armX) * smooth, armY: a.armY + (b.armY - a.armY) * smooth,
  armZ: a.armZ + (b.armZ - a.armZ) * smooth, handX: a.handX + (b.handX - a.handX) * smooth,
  handZ: a.handZ + (b.handZ - a.handZ) * smooth, torsoX: a.torsoX + (b.torsoX - a.torsoX) * smooth, torsoY: a.torsoY + (b.torsoY - a.torsoY) * smooth };
};

/** One anticipation, one contact, one recovery. Never oscillate from remaining cooldown. */
export function meleePose(motion: AttackMotion): MeleePose {
 const side = motion.combo === 2 ? -1 : 1;
 let ready: MeleePose, follow: MeleePose;
 if (motion.kind === 'thrust') {
  ready = { armX: -.65, armY: -.18, armZ: -.12, handX: 2.2, handZ: -.18, torsoX: -.05, torsoY: -.18 };
  follow = { armX: -1.45, armY: .05, armZ: -.04, handX: 3, handZ: .22, torsoX: .12, torsoY: .12 };
 } else if (motion.kind === 'overhead' || motion.combo === 3) {
  ready = { armX: -2.5, armY: -.18, armZ: -.25, handX: .25, handZ: 0, torsoX: -.1, torsoY: -.1 };
  follow = { armX: -.95, armY: .2, armZ: .18, handX: 2.7, handZ: .05, torsoX: .16, torsoY: .12 };
 } else {
  ready = { armX: -1.05, armY: -.9 * side, armZ: -.7 * side, handX: 2.25, handZ: 0, torsoX: -.04, torsoY: -.28 * side };
  follow = { armX: -1.25, armY: .8 * side, armZ: .6 * side, handX: 2.65, handZ: .04, torsoX: .1, torsoY: .32 * side };
 }
 if (motion.elapsed <= motion.windup) return mix(rest, ready, motion.elapsed / motion.windup);
 if (motion.elapsed <= motion.windup + motion.active) return mix(ready, follow, (motion.elapsed - motion.windup) / motion.active);
 return mix(follow, rest, (motion.elapsed - motion.windup - motion.active) / Math.max(.01, motion.duration - motion.windup - motion.active));
}
