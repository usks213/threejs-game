import { describe, expect, it } from 'vitest';
import { parts, profileFor, buildForBlade, isPlayablePart, defaultBuild } from '../../../src/beyblade/data/catalog';
import { createBattle, stepBattle } from '../../../src/beyblade/core/physics';
import { idleSpinYaw } from '../../../src/beyblade/rendering/arena';

/**
 * Spin direction is a property of the blade, end to end: the catalog marks
 * verified left-spin blades, the physics launches them with negative omega,
 * and the pre-launch idle display turns each bey in its OWN direction.
 * (Regression: the arena idle used to rotate by player slot, so the two
 * default right-spin beys counter-rotated and left-spin beys idled the
 * wrong way.)
 */
describe('spin direction (right / left)', () => {
  it('idle yaw follows the blade spin, not the player slot', () => {
    expect(idleSpinYaw(1, 2)).toBeGreaterThan(0);
    expect(idleSpinYaw(-1, 2)).toBeLessThan(0);
    expect(idleSpinYaw(-1, 2)).toBeCloseTo(-idleSpinYaw(1, 2), 12);
  });

  it('every playable blade profile keeps the catalog spin direction', () => {
    const blades = parts.filter(p => p.category === 'blade' && isPlayablePart(p));
    expect(blades.length).toBeGreaterThan(50);
    for (const part of blades) {
      expect(profileFor(buildForBlade(part.id)).spin).toBe(part.spin ?? 1);
    }
    const left = blades.filter(p => p.spin === -1);
    expect(left.length).toBeGreaterThanOrEqual(5);
    expect(left.some(p => (p.canonicalId ?? p.name).includes('コバルトドラグーン'))).toBe(true);
  });

  it('a left-spin bey launches with negative omega and phase, a right-spin bey positive', () => {
    const cobalt = parts.find(p => p.category === 'blade' && p.canonicalId === 'コバルトドラグーン' && isPlayablePart(p))!;
    const launch = { power: .6, angle: 0, tilt: .2 }, cpu = { power: .76, angle: -.12, tilt: .11 };
    const leftBattle = createBattle([profileFor(buildForBlade(cobalt.id)), profileFor(defaultBuild)], [launch, cpu], 0);
    expect(leftBattle.tops[0].omega).toBeLessThan(0);
    expect(leftBattle.tops[1].omega).toBeGreaterThan(0);
    const leftPhase0 = leftBattle.tops[0].phase;
    for (let i = 0; i < 24; i++) stepBattle(leftBattle);
    expect(Math.sign(leftBattle.tops[0].phase - leftPhase0)).toBe(-1);

    const rightBattle = createBattle([profileFor(defaultBuild), profileFor(buildForBlade(cobalt.id))], [launch, cpu], 0);
    expect(rightBattle.tops[0].omega).toBeGreaterThan(0);
    expect(rightBattle.tops[1].omega).toBeLessThan(0);
    const rightPhase0 = rightBattle.tops[0].phase;
    for (let i = 0; i < 24; i++) stepBattle(rightBattle);
    expect(Math.sign(rightBattle.tops[0].phase - rightPhase0)).toBe(1);
  });
});
