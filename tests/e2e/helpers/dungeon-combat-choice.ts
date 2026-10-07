import type {AttackPhase} from '../../../src/prototype/core/motion';

/** Keeper's real sword does at least 30 body damage with a normal attack. */
export const raidMeleeKey = (targetHp: number): 'KeyT' | 'KeyR' => targetHp <= 30 ? 'KeyT' : 'KeyR';

export const raidNeedsCombatRecovery = (hp: number, hasMedicine: boolean) => hp <= 80 && hasMedicine;
export const raidMedicineCanHeal = (kind: string | undefined, hp: number, recoverable: number) => kind === 'potion' || kind === 'bandage' && recoverable > hp;
export const raidHasHealingSpace = (nearestThreatDistance: number) => nearestThreatDistance >= 4;
export const raidNeedsFineTurn = (error: number) => Math.abs(error) > .12 && Math.abs(error) < .8;

/** Ordinary footwork: create space while the attack cannot raise the shield. */
export function raidCombatMovement(phase: AttackPhase, distance: number, aligned: boolean): 'KeyS' | 'KeyW' | null {
  if (!aligned) return null;
  if (phase === 'recover') return 'KeyS';
  return distance > 1.35 ? 'KeyW' : null;
}
