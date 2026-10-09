import {it,expect} from 'vitest';
import {spatialSound} from '../../src/audio/spatial';
it('uses real 3D range, left-right placement and conservative layer muffling',()=>{const p={x:0,y:2,z:0};expect(spatialSound(p,{x:1,y:2,z:0},0).pan).toBe(1);expect(spatialSound(p,{x:-1,y:2,z:0},0).pan).toBe(-1);expect(spatialSound(p,{x:0,y:30,z:0},0).gain).toBe(0);expect(spatialSound(p,{x:0,y:-8,z:0},0).gain).toBeLessThan(.06);expect(spatialSound(p,{x:10,y:2,z:0},0).gain).toBeGreaterThan(.3);expect(spatialSound(p,{x:NaN,y:0,z:0},0)).toEqual({gain:0,pan:0});});
