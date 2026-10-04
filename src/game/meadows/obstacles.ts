import { buildingPose,buildingVoxels,localPoint as voxelLocal,rayVoxel,voxelBounds,voxelKey } from '../voxel/model';
import { BUILDINGS } from '../../content/catalog';
import type { BuildingState,EnemyState } from '../types';
import type { GameSimulation } from '../../simulation/game-simulation';
import type { Vec3 } from '../../world/types';

const CONTACT_EPSILON=1e-8;
const WALK_THROUGH=new Set(['fire','cook','bed','beehive','raft','sign']);
export function localPoint(b:BuildingState,x:number,z:number){const pose=buildingPose(b);return voxelLocal({x,y:b.y,z},pose,pose.rotation);}

/** A vertical cylinder against real occupied cells, rather than the piece's empty bounding box. */
export function touchesBuildingVoxels(b:BuildingState,x:number,y:number,z:number,radius=.3,height=1.45):boolean{
 if(!BUILDINGS.some(d=>d.id===b.definition)||![x,y,z,radius,height].every(Number.isFinite)||radius<0||height<=0)return false;
 const model=buildingVoxels(b.definition),pose=buildingPose(b),p=voxelLocal({x,y,z},pose,pose.rotation),bounds=voxelBounds(model),size=model.size;
 if(p.x+radius<=bounds.min.x||p.x-radius>=bounds.max.x||p.z+radius<=bounds.min.z||p.z-radius>=bounds.max.z||p.y+height<=bounds.min.y+CONTACT_EPSILON||p.y>=bounds.max.y-CONTACT_EPSILON)return false;
 const removed=new Set(b.removed??[]),minX=Math.max(Math.floor((p.x-radius)/size),Math.floor(bounds.min.x/size)),maxX=Math.min(Math.floor((p.x+radius)/size),Math.ceil(bounds.max.x/size)-1);
 const minZ=Math.max(Math.floor((p.z-radius)/size),Math.floor(bounds.min.z/size)),maxZ=Math.min(Math.floor((p.z+radius)/size),Math.ceil(bounds.max.z/size)-1);
 const minY=Math.max(Math.floor((p.y+CONTACT_EPSILON)/size),Math.floor(bounds.min.y/size)),maxY=Math.min(Math.ceil((p.y+height-CONTACT_EPSILON)/size)-1,Math.ceil(bounds.max.y/size)-1);
 for(let cx=minX;cx<=maxX;cx++)for(let cz=minZ;cz<=maxZ;cz++){
  const dx=Math.max(cx*size-p.x,0,p.x-(cx+1)*size),dz=Math.max(cz*size-p.z,0,p.z-(cz+1)*size);
  if(radius>0&&dx*dx+dz*dz>=radius*radius-CONTACT_EPSILON)continue;
  for(let cy=minY;cy<=maxY;cy++){const key=voxelKey(cx,cy,cz);if(model.cells.has(key)&&!removed.has(key))return true;}
 }
 return false;
}
export function blockedByBuilding(b:BuildingState,x:number,y:number,z:number,radius=.3,height=1.1):boolean{
 return !WALK_THROUGH.has(b.definition)&&touchesBuildingVoxels(b,x,y,z,radius,height);
}
export function reconcileCreature(sim:GameSimulation,e:EnemyState,from:Vec3):void{
 if(e.health<=0)return;
 const y=sim.groundAt(e.x,e.z),blocked=Math.abs(y-from.y)>1.3||sim.adventure.state.buildings.some(b=>blockedByBuilding(b,e.x,y,e.z,e.boss?.7:.25));
 if(blocked){e.x=from.x;e.z=from.z;e.y=from.y;}else e.y=y;
}
export function sees(sim:GameSimulation,a:Vec3,b:Vec3):boolean{
 const origin={x:a.x,y:a.y+.8,z:a.z},delta={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},distance=Math.hypot(delta.x,delta.y,delta.z);
 if(distance<CONTACT_EPSILON)return true;
 const direction={x:delta.x/distance,y:delta.y/distance,z:delta.z/distance};
 // Sight is a ray at eye height, not an entire creature body above the eye.
 for(const piece of sim.adventure.state.buildings){
  if(!BUILDINGS.some(d=>d.id===piece.definition))continue;
  const pose=buildingPose(piece),model=buildingVoxels(piece.definition),bounds=voxelBounds(model),localOrigin=voxelLocal(origin,pose,pose.rotation),localDirection=voxelLocal(direction,{x:0,y:0,z:0},pose.rotation);
  let near=0,far=distance;
  for(const axis of ['x','y','z'] as const){
   if(Math.abs(localDirection[axis])<CONTACT_EPSILON){if(localOrigin[axis]<bounds.min[axis]||localOrigin[axis]>bounds.max[axis]){far=-1;break;}continue;}
   const a=(bounds.min[axis]-localOrigin[axis])/localDirection[axis],b=(bounds.max[axis]-localOrigin[axis])/localDirection[axis];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
  }
  if(far<near)continue;
  const start={x:localOrigin.x+localDirection.x*near,y:localOrigin.y+localDirection.y*near,z:localOrigin.z+localDirection.z*near};
  const hit=rayVoxel(model,start,localDirection,piece.removed,far-near);
  if(hit!==null&&near+hit<distance-CONTACT_EPSILON)return false;
 }
 const steps=Math.ceil(distance/.25);
 for(let i=1;i<steps;i++){const t=i/steps;if(sim.world.density({x:origin.x+delta.x*t,y:origin.y+delta.y*t,z:origin.z+delta.z*t})<0)return false;}
 return true;
}
