import {createHash} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {BUILDINGS} from '../../src/content/catalog';
import * as shapes from '../../src/game/meadows/building-shapes';
import {buildingVoxels} from '../../src/game/voxel/model';

it('retains every ordered voxel and material in all 45 existing building models',()=>{
 const models=BUILDINGS.map(({id})=>{const model=buildingVoxels(id);return[id,model.size,[...model.cells]];});
 expect(models).toHaveLength(45);
 // Baseline before the early cache lookup: IDs, resolution, insertion order,
 // coordinates, voxel keys and materials are all included.
 expect(createHash('sha256').update(JSON.stringify(models)).digest('hex')).toBe('e2a01cf6f9d6c5ae49840a36bcfe1f381ecf6d15e90b3639d555887122fd1223');
});

it('returns cached model identity before catalog lookup and geometry preparation',()=>{
 const models=BUILDINGS.map(({id})=>[id,buildingVoxels(id)] as const);
 const find=vi.spyOn(BUILDINGS,'find'),roof=vi.spyOn(shapes,'roofHeight');
 try{
  for(let repeat=0;repeat<3;repeat++)for(const [id,model]of models)expect(buildingVoxels(id)).toBe(model);
  // These two calls precede the old per-call bounds objects and fill closure.
  // A warm lookup must bypass that whole model-preparation path.
  expect(find).not.toHaveBeenCalled();expect(roof).not.toHaveBeenCalled();
 }finally{find.mockRestore();roof.mockRestore();}
});

it('keeps rejecting unknown building IDs after the cache has been warmed',()=>{
 buildingVoxels('wall');
 for(const id of ['not-a-building','','__proto__','constructor'])expect(()=>buildingVoxels(id)).toThrow();
});
