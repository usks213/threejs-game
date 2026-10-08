import {expect, it} from 'vitest';
import {dungeonApproachDeflection, dungeonApproachWait} from '../e2e/helpers/dungeon-touch-approach';

it('reduces actual stick displacement near the waypoint without a minimum-speed floor', () => {
  expect(dungeonApproachDeflection(0)).toBe(0);
  expect(dungeonApproachDeflection(.3)).toBeCloseTo(2.1);
  expect(dungeonApproachDeflection(3)).toBe(21);
  expect(dungeonApproachDeflection(12)).toBe(42);
});

it('counts acknowledgement latency inside the existing 250 ms requested hold', () => {
  expect(dungeonApproachWait(0)).toBe(250);
  expect(dungeonApproachWait(100)).toBe(150);
  expect(dungeonApproachWait(671)).toBe(0);
  expect(dungeonApproachWait(1499)).toBe(0);
});

it.each([.2, .25, .35, .8, 1.4, 2, 2.3])('converges at a %s second observed hold without widening the 35 cm target or 45-pulse budget', hold => {
  // The real starting class moves at 3 m/s. Include sub-tick delivery loss and
  // recorded delayed touchMove/touchEnd bounds; this is a driver regression,
  // not a substitute for the public Android two-client test.
  const actor = {x: -11, z: 11};
  for (const target of [{x: -12, z: 8}, {x: -12, z: 11.8}]) {
    for (let pulse = 0; pulse < 45; pulse++) {
      const dx = target.x - actor.x, dz = target.z - actor.z;
      if (Math.hypot(dx, dz) < .35) break;
      const horizontal = Math.abs(dx) > Math.abs(dz), error = horizontal ? dx : dz;
      const movement = Math.sign(error) * dungeonApproachDeflection(error) / 42 * 3 * hold;
      if (horizontal) actor.x += movement;
      else actor.z += movement;
    }
    expect(Math.hypot(target.x - actor.x, target.z - actor.z)).toBeLessThan(.35);
  }
});
