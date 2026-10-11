import {describe,it,expect} from 'vitest';
import {CoreSimulation,type Controls} from '../../src/prototype/core/simulation';
import {setDoor} from '../../src/prototype/core/world';

const blocking:Controls={x:0,z:0,sprint:false,block:true,water:false};
describe('vertical collision recovery',()=>{
 it('recovers shallow floor contact only to a clear supported position without a stationary stair step',()=>{
  const s=new CoreSimulation();s.player.position.y=.23;
  const before={...s.player.position};expect(s.arena.field.overlaps(before)).toBe(true);
  s.tick(1/60,blocking);
  expect(s.player.position.y).toBeGreaterThan(before.y);
  expect(s.player.position.y).toBeLessThanOrEqual(before.y+.05);
  expect(s.arena.field.overlaps(s.player.position)).toBe(false);expect(s.player.grounded).toBe(true);
  for(let i=0;i<60;i++)s.tick(1/60,blocking);
  expect(s.player.position.y).toBeCloseTo(.248,3);
 });
 it('lands on a clear floor without adding upward motion to a nonpenetrating capsule',()=>{
  const s=new CoreSimulation();s.player.position.y=.25;
  const before=s.player.position.y;
  for(let i=0;i<60;i++){s.tick(1/60,blocking);expect(s.player.position.y).toBeLessThanOrEqual(before);}
  expect(s.player.grounded).toBe(true);expect(s.arena.field.overlaps(s.player.position)).toBe(false);
 });
 it('does not lift a stationary player through the closed crypt door and roof',()=>{
  const s=new CoreSimulation(true,false,true);
  setDoor(s.arena.field,false);s.arena.objects.get('door')!.open=false;
  // Production trace 37414746081: stationary guard beside the crypt door.
  Object.assign(s.player.position,{x:-.7883007404,y:.2480295139,z:.7280020604});
  const initial={...s.player.position};
  expect(s.arena.field.overlaps({...initial,y:initial.y+.05})).toBe(true);

  for(let i=0;i<180;i++)s.tick(1/60,blocking);
  expect(s.player.position.x).toBe(initial.x);expect(s.player.position.z).toBe(initial.z);
  expect(s.player.position.y).toBe(initial.y);
  expect(s.player.grounded).toBe(false);
  s.action('jump',blocking);expect(s.player.vy).toBe(0);
 });
});
