import {expect, it} from 'vitest';
import {meleeDefinition} from '../../src/prototype/core/motion';
import {raidCombatMovement, raidMeleeKey} from '../e2e/helpers/dungeon-combat-choice';

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
