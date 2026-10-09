import {describe,it,expect} from 'vitest';
import {VoxelField} from '../../src/prototype/core/voxel';
import {VoxelWater} from '../../src/prototype/core/water';
import {ElementSystem} from '../../src/prototype/core/elements';
it('round trips the real 60Hz accumulator after 0.4 seconds',()=>{const field=new VoxelField(),elements=new ElementSystem(field,new VoxelWater(field));for(let i=0;i<24;i++)elements.tick(1/60);const snapshot=elements.exportState();expect(snapshot.accumulator).toBeGreaterThanOrEqual(0);expect(new ElementSystem(field,new VoxelWater(field)).restoreState(snapshot)).toBe(true);});

describe('published-save floating-point migration',()=>{
 it.each([-5.551115123125783e-17,-1e-10,-1e-9])('accepts and normalizes the legacy epsilon remainder %s',accumulator=>{const field=new VoxelField(),elements=new ElementSystem(field,new VoxelWater(field)),snapshot=elements.exportState();snapshot.accumulator=accumulator;expect(elements.restoreState(snapshot)).toBe(true);expect(elements.exportState().accumulator).toBe(0);});
 it.each([-1e-8,-.1,NaN,-Infinity])('still rejects genuinely malformed remainders %s',accumulator=>{const field=new VoxelField(),elements=new ElementSystem(field,new VoxelWater(field)),snapshot=elements.exportState();snapshot.accumulator=accumulator;expect(elements.restoreState(snapshot)).toBe(false);expect(elements.exportState().accumulator).toBe(0);});
});
