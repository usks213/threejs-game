import { describe, it, expect } from 'vitest';
import { createPlayer, stepPlayer, WORLD_LIMIT } from '../../src/core/player';
describe('player movement', () => {
  it('moves at 4 units per second', () => { const p = createPlayer(); for (let i=0;i<20;i++) stepPlayer(p,{x:1,z:0},0.05); expect(p.x).toBeCloseTo(4); });
  it('normalizes diagonal speed', () => { const p=createPlayer(); stepPlayer(p,{x:1,z:1},0.05); expect(Math.hypot(p.x,p.z)).toBeCloseTo(0.2); });
  it('preserves analog input strength', () => { const p=createPlayer(); stepPlayer(p,{x:0.5,z:0},0.05); expect(p.x).toBeCloseTo(0.1); });
  it('clamps long frames and world bounds', () => { const p=createPlayer(); stepPlayer(p,{x:1,z:0},10); expect(p.x).toBeCloseTo(0.2); for(let i=0;i<1000;i++) stepPlayer(p,{x:1,z:-1},0.05); expect(p.x).toBe(WORLD_LIMIT); expect(p.z).toBe(-WORLD_LIMIT); });
  it('ignores invalid inputs and does not move while idle', () => { const p=createPlayer(); stepPlayer(p,{x:NaN,z:0},0.05); stepPlayer(p,{x:1,z:0},-1); stepPlayer(p,{x:0,z:0},0.05); expect(p).toEqual(createPlayer()); });
});
