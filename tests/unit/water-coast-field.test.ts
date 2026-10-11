import {it,expect} from 'vitest';
import {VoxelWater} from '../../src/prototype/core/water';
import {VoxelField} from '../../src/prototype/core/voxel';
import {WaterCoastField} from '../../src/prototype/rendering/water-coast-field';
it('encodes wet shore direction, decaying inverse distance and contiguous local depth',()=>{const w=new VoxelWater(new VoxelField());w.volume.fill(0);for(let z=8;z<40;z++)for(let x=8;x<40;x++)for(let y=0;y<4;y++)w.volume[w.index(x,y,z)]=1;const f=new WaterCoastField(w),shore=(8+20*w.nx)*4,inside=(20+20*w.nx)*4;expect(f.encoded[shore]).toBe(0);expect(f.encoded[shore+2]).toBe(255);expect(f.encoded[inside+2]).toBeLessThan(100);expect(f.encoded[shore+3]/255*3).toBeCloseTo(.5,1);expect(f.encoded[3]).toBe(0);expect(f.encoded.byteLength).toBe(48*48*4);});
it('clears dry/blocked data and does not count water below an air gap as the surface pool depth',()=>{const w=new VoxelWater(new VoxelField());w.volume.fill(0);w.volume[w.index(10,0,10)]=1;w.volume[w.index(10,6,10)]=.5;const f=new WaterCoastField(w);expect(f.depth[10+10*w.nx]).toBe(.0625);w.blocked.fill(1);f.rebuild();expect(f.depth.every(v=>v===0)).toBe(true);expect(f.encoded[3]).toBe(0);});
