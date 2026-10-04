import * as THREE from 'three';
import { voxelGeometry } from './object-mesh';
import { voxelKey,type VoxelModel } from '../../game/voxel/model';
/** Closed procedural shapes are sampled once into occupied cells, then only exposed faces remain. */
export function voxelizePrimitive(source:THREE.BufferGeometry,resolution=12):THREE.BufferGeometry{
 source.computeBoundingBox();const bounds=source.boundingBox!,extent=new THREE.Vector3();bounds.getSize(extent);const size=Math.max(extent.x,extent.y,extent.z)/resolution;
 if(size<=0||Math.min(extent.x,extent.y,extent.z)<1e-5)return source;
 const model:VoxelModel={size,cells:new Map()},material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(source,material),ray=new THREE.Raycaster(),origin=new THREE.Vector3(),direction=new THREE.Vector3(0,1,0);mesh.updateMatrixWorld();
 for(let x=Math.floor(bounds.min.x/size);x<Math.ceil(bounds.max.x/size);x++)for(let z=Math.floor(bounds.min.z/size);z<Math.ceil(bounds.max.z/size);z++){
  ray.set(origin.set((x+.5)*size,bounds.min.y-size,(z+.5)*size),direction);const heights=ray.intersectObject(mesh).map(h=>h.point.y).filter((h,i,a)=>i===0||Math.abs(h-a[i-1])>1e-6);
  for(let y=Math.floor(bounds.min.y/size);y<Math.ceil(bounds.max.y/size);y++){const height=(y+.5)*size;if(heights.filter(h=>h<=height).length%2!==1)continue;const key=voxelKey(x,y,z);model.cells.set(key,{x,y,z,key,material:'wood'});}
 }
 material.dispose();const result=voxelGeometry(model);source.dispose();return result;
}
