import {describe,it,expect} from 'vitest';
import {bossAttack,directedShot} from '../../src/game/bosses';
describe('distinct boss patterns',()=>{
 it('has roots, charge, poison fan, frost fan and magic barrage',()=>{
  expect(bossAttack('root').radius).toBe(6);expect(bossAttack('tusk').charge).toBe(true);
  expect(bossAttack('mirelord').element).toBe('poison');expect(bossAttack('frostwing').shots).toBe(5);expect(bossAttack('riftheart').shots).toBe(7);
  expect(bossAttack('riftheart',true).shots).toBe(9);expect(bossAttack('root',true).cooldown).toBeLessThan(bossAttack('root').cooldown);
 });
 it('aims from the authority at the actual player position',()=>{
  const v=directedShot({x:0,y:1,z:0},{x:10,y:1,z:0},0);
  expect(v.x).toBeCloseTo(9);expect(v.z).toBeCloseTo(0);expect(v.y).toBe(0);
 });
});
