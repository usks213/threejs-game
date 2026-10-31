import { describe, it, expect } from 'vitest';
import { createBattle } from '../../../src/beyblade/core/physics';
import { defaultLaunchPosition } from '../../../src/beyblade/core/launch-position';
import { defaultBuild, profileFor } from '../../../src/beyblade/data/catalog';
import type { Launch } from '../../../src/beyblade/core/types';

describe('seeded launch micro-variation', () => {
  const profile = profileFor(defaultBuild);
  const launches: [Launch, Launch] = [
    { power: .6, angle: .1, tilt: .2 },
    { power: .76, angle: -.12, tilt: .11 },
  ];

  it('keeps seed 0 / omitted identical to the legacy battle', () => {
    const legacy = createBattle([profile, profile], launches);
    expect(createBattle([profile, profile], launches, 0)).toEqual(legacy);
    expect(legacy.seed).toBeUndefined();
  });

  it('reproduces the same varied battle for the same seed', () => {
    const a = createBattle([profile, profile], launches, 123456);
    const b = createBattle([profile, profile], launches, 123456);
    expect(a).toEqual(b);
    expect(a.seed).toBe(123456);
  });

  it('differs between seeds but stays inside the sampled bounds', () => {
    const base = createBattle([profile, profile], launches);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 24; seed++) {
      const battle = createBattle([profile, profile], launches, seed);
      seen.add(JSON.stringify(battle.tops.map(t => [t.omega, t.x, t.z])));
      battle.tops.forEach((top, i) => {
        // Power jitter is ±3% before the launch curve; omega must stay close.
        expect(Math.abs(top.omega / base.tops[i].omega - 1)).toBeLessThan(.05);
        // Position jitter is ±2 mm per axis around the chosen/default spawn.
        const spawn = defaultLaunchPosition(i as 0 | 1);
        expect(Math.hypot(top.x - spawn.x, top.z - spawn.z)).toBeLessThanOrEqual(.003);
        expect(Math.abs(top.tilt - launches[i].tilt)).toBeLessThanOrEqual(.015 + 1e-9);
      });
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it('never jitters a player-chosen position at all', () => {
    const chosen: [Launch, Launch] = [
      { ...launches[0], position: { x: -.041, z: 0 } },
      { ...launches[1], position: { x: .041, z: 0 } },
    ];
    for (let seed = 1; seed <= 40; seed++) {
      const battle = createBattle([profile, profile], chosen, seed);
      expect(battle.tops[0].x).toBe(-.041);
      expect(battle.tops[1].x).toBe(.041);
    }
  });
});
