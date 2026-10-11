import {it,expect,vi} from 'vitest';
import {BUILDINGS} from '../../src/content/catalog';
import {buildingVoxels,footSurface,occupied,treeVoxels,voxelKey,type VoxelModel} from '../../src/game/voxel/model';
import type {Vec3} from '../../src/world/types';
/** Original unbounded lookup is the exact reference, including partial-cell tops. */
function reference(model:VoxelModel,point:Vec3,previousY:number,removed:readonly string[]=[]):number|null{
 const gone=new Set(removed);let top:number|null=null;
 for(const dx of [-.22,0,.22])for(const dz of [-.22,0,.22]){const x=Math.floor((point.x+dx)/model.size),z=Math.floor((point.z+dz)/model.size);for(let y=Math.floor((previousY+.45)/model.size);y>=Math.floor((point.y-.35)/model.size);y--){const key=voxelKey(x,y,z);if(!model.cells.has(key)||gone.has(key))continue;const height=(y+1)*model.size;if(height<=previousY+.45)top=Math.max(top??-Infinity,height);break;}}
 return top;
}
it('matches the original exact voxel landing surface for every building, holes, edges and high falls',()=>{
 let random=713;const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/2**32;};
 for(const definition of BUILDINGS){const model=buildingVoxels(definition.id),removed=[...model.cells.keys()].filter((_,i)=>i%3===0);
  for(let i=0;i<75;i++){const point={x:(next()-.5)*10,y:next()*5-1,z:(next()-.5)*10},previous=point.y+next()*5;
   expect(footSurface(model,point,previous,i%2?removed:[])).toBe(reference(model,point,previous,i%2?removed:[]));
  }
  for(const x of [-1.22,-1,-.22,0,.22,1,1.22])for(const z of [-1.22,0,1.22])for(const y of [0,.125,.25,.5,1,2,3]){const point={x,y,z};expect(footSurface(model,point,y+.1,removed)).toBe(reference(model,point,y+.1,removed));}
 }
});
it('does not probe voxels for distant feet or an entirely disjoint vertical interval',()=>{const model=buildingVoxels('floor'),has=vi.spyOn(model.cells,'has');try{expect(footSurface(model,{x:500,y:0,z:0},.3)).toBeNull();expect(footSurface(model,{x:0,y:100,z:0},101)).toBeNull();expect(has).not.toHaveBeenCalled();}finally{has.mockRestore();}});

it('matches direct occupancy for building and tree voxels, carved cells, and exact bounds',()=>{for(const model of [...BUILDINGS.map(b=>buildingVoxels(b.id)),treeVoxels('oak',42),treeVoxels('wood',45)]){const removed=new Set([...model.cells.keys()].filter((_,i)=>i%3===0));for(let i=0;i<500;i++){const point={x:((i*17)%100-50)/16,y:((i*31)%150-25)/16,z:((i*43)%100-50)/16},key=voxelKey(Math.floor(point.x/model.size),Math.floor(point.y/model.size),Math.floor(point.z/model.size));expect(occupied(model,point,removed)).toBe(model.cells.has(key)&&!removed.has(key));}}});
