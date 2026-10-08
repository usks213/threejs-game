import {expect, it} from 'vitest';
import {meleeDefinition} from '../../src/prototype/core/motion';
import {raidCombatMovement, raidHasHealingSpace, raidMeleeKey, raidMedicineCanHeal, raidNeedsCombatRecovery, raidNeedsFineTurn, raidRecoveryKey} from '../e2e/helpers/dungeon-combat-choice';

it('finishes a wounded guard with the ordinary faster sword attack', () => {
  expect(Math.min(meleeDefinition('slash').damage, meleeDefinition('return').damage)).toBe(30);
  for (const hp of [1, 15, 30]) expect(raidMeleeKey(hp)).toBe('KeyT');
  for (const hp of [31, 70]) expect(raidMeleeKey(hp)).toBe('KeyR');
  expect(meleeDefinition('return').windup).toBeLessThan(meleeDefinition('overhead').windup);
});

it('backs out during shield-locked recovery instead of standing inside the next swing', () => {
  expect(raidCombatMovement('recover', 1.25, true)).toBe('KeyS');
  expect(raidCombatMovement('recover', 1.7, true)).toBe('KeyS');
  expect(raidCombatMovement('idle', 1.25, true)).toBeNull();
  expect(raidCombatMovement('idle', 1.7, true)).toBe('KeyW');
  expect(raidCombatMovement('windup', 1.25, true)).toBeNull();
  expect(raidCombatMovement('strike', 1.25, true)).toBeNull();
});

it('turns toward the threat before choosing a forward or backward step', () => {
  expect(raidCombatMovement('recover', 1.25, false)).toBeNull();
  expect(raidCombatMovement('idle', 3, false)).toBeNull();
});

it('retreats before the observed 74HP heavy commitment and spends only real medicine', () => {
  for (const hp of [10, 42, 74, 80]) expect(raidNeedsCombatRecovery(hp, true)).toBe(true);
  expect(raidNeedsCombatRecovery(81, true)).toBe(false);
  expect(raidNeedsCombatRecovery(74, false)).toBe(false);
  expect(raidHasHealingSpace(3.99)).toBe(false);
  expect(raidHasHealingSpace(4)).toBe(true);
  expect(raidHasHealingSpace(Infinity)).toBe(true);
});

it('uses ordinary Shift aiming near the blade line instead of full-speed oscillation', () => {
  for (const error of [.201, -.212, .7, -.7]) expect(raidNeedsFineTurn(error)).toBe(true);
  for (const error of [0, .12, -.12, .8, -.8, 2]) expect(raidNeedsFineTurn(error)).toBe(false);
  for (const step of [.1, .15, .2]) {
    let error = .7;
    for (let i = 0; i < 20 && Math.abs(error) > .12; i++) error -= Math.sign(error) * (raidNeedsFineTurn(error) ? .65 : 1.65) * step;
    expect(Math.abs(error)).toBeLessThanOrEqual(.12);
  }
});

it('does not retreat to waste a first-selected bandage with no recoverable health', () => {
  expect(raidMedicineCanHeal('potion', 74, 74)).toBe(true);
  expect(raidMedicineCanHeal('bandage', 74, 90)).toBe(true);
  expect(raidMedicineCanHeal('bandage', 74, 74)).toBe(false);
  expect(raidMedicineCanHeal(undefined, 74, 90)).toBe(false);
});

it('uses remaining finite keeper healing before re-engaging at the observed 45HP', () => {
  expect(raidRecoveryKey(undefined, 45, 85, 'keeper', 5)).toBe('KeyG');
  expect(raidNeedsCombatRecovery(45, raidRecoveryKey(undefined, 45, 85, 'keeper', 5) !== null)).toBe(true);
  expect(raidRecoveryKey('potion', 45, 85, 'keeper', 5)).toBe('KeyQ');
  expect(raidRecoveryKey('bandage', 45, 45, 'keeper', 1)).toBe('KeyG');
  expect(raidNeedsCombatRecovery(85, true)).toBe(false);
});

it('never treats another class’s offense or an exhausted keeper as free healing', () => {
  expect(raidRecoveryKey(undefined, 45, 85, 'arcanist', 5)).toBeNull();
  expect(raidRecoveryKey(undefined, 45, 85, 'keeper', 0)).toBeNull();
  expect(raidRecoveryKey('bandage', 45, 45, 'keeper', 0)).toBeNull();
});
