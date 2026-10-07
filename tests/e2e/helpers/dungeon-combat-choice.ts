import type {AttackPhase} from '../../../src/prototype/core/motion';

/** Keeper's real sword does at least 30 body damage with a normal attack. */
export const raidMeleeKey = (targetHp: number): 'KeyT' | 'KeyR' => targetHp <= 30 ? 'KeyT' : 'KeyR';

/** Ordinary footwork: create space while the attack cannot raise the shield. */
export function raidCombatMovement(phase: AttackPhase, distance: number, aligned: boolean): 'KeyS' | 'KeyW' | null {
  if (!aligned) return null;
  if (phase === 'recover') return 'KeyS';
  return distance > 1.35 ? 'KeyW' : null;
}
