import type { AdventureSave } from '../types';
import type { Vec3 } from '../../world/types';
import { TREE_KINDS } from '../../content/meadows/data';
import { buildingPose,buildingVoxels,localPoint,rayVoxel,treeVoxels,voxelBounds,type VoxelModel } from './model';
import { rayBox } from '../interaction/target';

/** Closest visible occupied object along the camera boom; removed cells stay transparent. */
export function objectOcclusion(state:AdventureSave,origin:Vec3,direction:Vec3,limit:number):number {
 let nearest=limit;
 const test=(model:VoxelModel,pose:Vec3,rotation:number,removed?:string[])=>{
  const local=localPoint(origin,pose,rotation),ray=localPoint(direction,{x:0,y:0,z:0},rotation),bounds=voxelBounds(model);
  const start=rayBox(local,ray,bounds.min,bounds.max);if(start===null||start>nearest)return;
  const point={x:local.x+ray.x*start,y:local.y+ray.y*start,z:local.z+ray.z*start};
  const hit=rayVoxel(model,point,ray,removed,nearest-start);if(hit!==null)nearest=Math.min(nearest,start+hit);
 };
 for(const b of state.buildings){if(Math.hypot(b.x-origin.x,b.z-origin.z)>limit+5)continue;const pose=buildingPose(b);test(buildingVoxels(b.definition),pose,pose.rotation,b.removed);}
 for(const n of state.resources)if(n.ready<=state.seconds&&TREE_KINDS.has(n.kind)&&Math.hypot(n.x-origin.x,n.z-origin.z)<limit+3)test(treeVoxels(n.kind,n.id),n,0,n.removed);
 return nearest;
}
