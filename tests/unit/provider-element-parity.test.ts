import {it,expect} from 'vitest';
import {VoxelField,type Hit} from '../../src/prototype/core/voxel';
import {SampleManifestRecorder} from '../../src/prototype/core/sample-provider';
import {SparseOverlayField} from '../../src/prototype/core/sample-overlay';
import {ElementSystem} from '../../src/prototype/core/elements';
import {VoxelWater} from '../../src/prototype/core/water';
it('applies each elemental sample once even when the provider returns detached cells',()=>{
 const original=new VoxelField(),recorder=new SampleManifestRecorder();for(const f of [original,recorder])f.box({x:0,y:0,z:0},{x:1.5,y:1,z:1.5},3,'stone');const sparse=new SparseOverlayField(recorder.createProvider('elements-parity'));
 const systems=[original,sparse].map(f=>{const w=new VoxelWater(f);w.volume.fill(0);return new ElementSystem(f,w);});
 for(let i=0;i<4;i++){const results=systems.map(e=>{const cell=e.field.get(2,2,2);if(!cell)return null;const hit:Hit={cell,point:{x:.625,y:.625,z:.625},normal:{x:0,y:1,z:0},distance:1};return e.cast('earth',hit,{x:1,y:0,z:0});});expect(results[1]).toEqual(results[0]);expect(systems[1].exportState()).toEqual(systems[0].exportState());}
 expect(systems[1].drainDrops()).toEqual(systems[0].drainDrops());
});
