import {describe,it,expect} from 'vitest';
import {CombatRecoveryNeeded,requireCombatReserve,waypointAxes,safeToLowerGuard} from '../e2e/helpers/combat-navigation';
describe('normal-input combat recovery decisions',()=>{
 it('interrupts aim while multiple real guard contacts remain in reserve',()=>{
  for(const stamina of [41.85,23.85,5.85,0])expect(()=>requireCombatReserve(stamina,55)).toThrow(CombatRecoveryNeeded);
  expect(()=>requireCombatReserve(59.85,55)).not.toThrow();
  expect(()=>requireCombatReserve(0,0)).not.toThrow();
 });
 it.each([0,.5,Math.PI/2,Math.PI,-2])('steers toward the waypoint without turning the guard at yaw %s',yaw=>{
  const player={x:-1,z:.5},target={x:0,z:.3},axes=waypointAxes(player,yaw,target);
  const world={x:Math.cos(yaw)*axes.x-Math.sin(yaw)*axes.z,z:-Math.sin(yaw)*axes.x-Math.cos(yaw)*axes.z};
  expect(world.x).toBeCloseTo(1/Math.hypot(1,.2));expect(world.z).toBeCloseTo(-.2/Math.hypot(1,.2));
 });
 it('never lowers guard merely because retreat time elapsed while pinned',()=>{
  expect(safeToLowerGuard(.01,4,'recover')).toBe(false);
  expect(safeToLowerGuard(.7,1.3,'recover')).toBe(false);
  expect(safeToLowerGuard(.7,2.2,'strike')).toBe(false);
  expect(safeToLowerGuard(.7,2.2,'recover')).toBe(true);
  expect(safeToLowerGuard(.7,3,'idle')).toBe(true);
 });
 it('stops an already settled waypoint rather than normalizing zero',()=>expect(waypointAxes({x:0,z:0},1,{x:0,z:0})).toEqual({x:0,z:0}));
});
