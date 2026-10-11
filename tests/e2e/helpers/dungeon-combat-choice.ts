import {meleeDefinition, type AttackPhase} from '../../../src/prototype/core/motion';

/** Keeper's real sword does at least 30 body damage with a normal attack. */
export const raidMeleeKey = (targetHp: number): 'KeyT' | 'KeyR' => targetHp <= 30 ? 'KeyT' : 'KeyR';

/** Capture before pressing the attack: later HP may already include this swing's hit. */
export const raidCanCommitFinisher = (targetHp: number, key: 'KeyT' | 'KeyR', nearbyThreats: number) => {
  const bodyDamage = key === 'KeyR' ? meleeDefinition('overhead').damage
    : Math.min(meleeDefinition('slash').damage, meleeDefinition('return').damage);
  return nearbyThreats === 1 && targetHp > 0 && targetHp <= bodyDamage;
};
export const raidNeedsCombatRecovery = (hp: number, hasHealingResource: boolean, phase: AttackPhase = 'idle', committedFinisher = false) =>
  hp <= 80 && hasHealingResource && !(committedFinisher && (phase === 'windup' || phase === 'strike'));
export const raidMedicineCanHeal = (kind: string | undefined, hp: number, recoverable: number) => kind === 'potion' || kind === 'bandage' && recoverable > hp;
export function raidRecoveryKey(kind: string | undefined, hp: number, recoverable: number, classId: string, spells: number): 'KeyQ' | 'KeyG' | null {
  if (raidMedicineCanHeal(kind, hp, recoverable)) return 'KeyQ';
  return classId === 'keeper' && spells > 0 ? 'KeyG' : null;
}
export const raidHasHealingSpace = (nearestThreatDistance: number) => nearestThreatDistance >= 4;
export const raidNeedsFineTurn = (error: number) => Math.abs(error) > .12 && Math.abs(error) < .8;

/** Ordinary footwork: create space while the attack cannot raise the shield. */
export function raidCombatMovement(phase: AttackPhase, distance: number, aligned: boolean): 'KeyS' | 'KeyW' | null {
  if (!aligned) return null;
  if (phase === 'recover') return 'KeyS';
  return distance > 1.35 ? 'KeyW' : null;
}
