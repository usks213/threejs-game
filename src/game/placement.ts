import { BUILDINGS } from '../content/catalog';
import type { BuildingDefinition } from '../content/catalog';
import type { BuildingState } from './types';
import type { Vec3 } from '../world/types';
import { buildingPose,buildingVoxels,localPoint,voxelBounds,voxelKey,worldPoint } from './voxel/model';
import { touchesBuildingVoxels } from './meadows/obstacles';

const CONTACT_EPSILON=1e-8;
export function placementPoint(point:Vec3):Vec3 { return {x:Math.round(point.x),y:Math.round(point.y*2)/2,z:Math.round(point.z)}; }

/** Positive occupied volume intersects; sharing a cell face is a valid building socket. */
export function buildingsOverlap(candidate:BuildingState,existing:BuildingState):boolean {
 if(!BUILDINGS.some(b=>b.id===candidate.definition)||!BUILDINGS.some(b=>b.id===existing.definition))return false;
 const model=buildingVoxels(candidate.definition),other=buildingVoxels(existing.definition),pose=buildingPose(candidate),otherPose=buildingPose(existing),bounds=voxelBounds(model),otherBounds=voxelBounds(other);
 if(pose.y+bounds.max.y<=otherPose.y+otherBounds.min.y+CONTACT_EPSILON||pose.y+bounds.min.y>=otherPose.y+otherBounds.max.y-CONTACT_EPSILON)return false;
 const center=localPoint(worldPoint({x:(bounds.min.x+bounds.max.x)/2,y:0,z:(bounds.min.z+bounds.max.z)/2},pose,pose.rotation),otherPose,otherPose.rotation),angle=pose.rotation-otherPose.rotation,c=Math.cos(angle),s=Math.sin(angle),ac=Math.abs(c),as=Math.abs(s);
 const hx=(bounds.max.x-bounds.min.x)/2,hz=(bounds.max.z-bounds.min.z)/2,rx=hx*ac+hz*as,rz=hx*as+hz*ac;
 if(center.x+rx<=otherBounds.min.x+CONTACT_EPSILON||center.x-rx>=otherBounds.max.x-CONTACT_EPSILON||center.z+rz<=otherBounds.min.z+CONTACT_EPSILON||center.z-rz>=otherBounds.max.z-CONTACT_EPSILON)return false;
 const removed=new Set(candidate.removed??[]),otherRemoved=new Set(existing.removed??[]),half=model.size/2,otherHalf=other.size/2,extent=half*(ac+as),sum=extent+otherHalf,reverseSum=half+otherHalf*(ac+as);
 for(const cell of model.cells.values()){
  if(removed.has(cell.key))continue;
  const p=localPoint(worldPoint({x:(cell.x+.5)*model.size,y:(cell.y+.5)*model.size,z:(cell.z+.5)*model.size},pose,pose.rotation),otherPose,otherPose.rotation);
  const minX=Math.floor((p.x-extent+CONTACT_EPSILON)/other.size),maxX=Math.floor((p.x+extent-CONTACT_EPSILON)/other.size),minZ=Math.floor((p.z-extent+CONTACT_EPSILON)/other.size),maxZ=Math.floor((p.z+extent-CONTACT_EPSILON)/other.size);
  const minY=Math.floor((p.y-half+CONTACT_EPSILON)/other.size),maxY=Math.floor((p.y+half-CONTACT_EPSILON)/other.size);
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
   const dx=p.x-(x+.5)*other.size,dz=p.z-(z+.5)*other.size;
   // Separating axes of both voxel squares reject mere corner/edge contact after rotation.
   if(Math.abs(dx)>=sum-CONTACT_EPSILON||Math.abs(dz)>=sum-CONTACT_EPSILON||Math.abs(dx*c-dz*s)>=reverseSum-CONTACT_EPSILON||Math.abs(dx*s+dz*c)>=reverseSum-CONTACT_EPSILON)continue;
   for(let y=minY;y<=maxY;y++){const key=voxelKey(x,y,z);if(other.cells.has(key)&&!otherRemoved.has(key))return true;}
  }
 }
 return false;
}

export function placementIssue(def:BuildingDefinition,p:Vec3,at:Vec3,buildings:BuildingState[],inventory:Record<string,number>,rotation=0):string {
 if(![at.x,at.y,at.z,rotation].every(Number.isFinite)||Math.hypot(at.x-p.x,at.z-p.z)>7||Math.abs(at.y-p.y)>7)return 'もっと近くに設置';
 const candidate:BuildingState={...at,id:-1,definition:def.id,rotation,support:def.support,contents:{}};
 if(touchesBuildingVoxels(candidate,p.x,p.y,p.z))return '自分から少し離す';
 if(buildings.some(b=>buildingsOverlap(candidate,b)))return '別の場所を選ぶ';
 if(Object.entries(def.cost).some(([id,n])=>(inventory[id]??0)<n))return '素材が不足しています';
 return '';
}

/** Face sockets use the visible voxel bounds, including quantized floors and sloping roofs. */
export function snapBuilding(id:string,point:Vec3,normal:Vec3,rotation:number,anchor?:BuildingState):Vec3 {
 const grid={x:Math.round(point.x*4)/4,y:Math.round(point.y*8)/8,z:Math.round(point.z*4)/4};
 if(!anchor||!BUILDINGS.some(b=>b.id===id)||!BUILDINGS.some(b=>b.id===anchor.definition))return grid;
 const bounds=voxelBounds(buildingVoxels(id)),old=voxelBounds(buildingVoxels(anchor.definition)),pose=buildingPose(anchor);
 if(Math.abs(normal.y)>.7)return {x:pose.x,y:normal.y>0?pose.y+old.max.y-bounds.min.y:pose.y+old.min.y-bounds.max.y,z:pose.z};
 const length=Math.hypot(normal.x,normal.z);if(length<CONTACT_EPSILON)return grid;
 const nx=normal.x/length,nz=normal.z/length;
 const socket=(min:Vec3,max:Vec3,angle:number,side:number)=>{
  const c=Math.cos(angle),s=Math.sin(angle),lx=nx*c-nz*s,lz=nx*s+nz*c;
  const x=Math.abs(lx)<CONTACT_EPSILON?(min.x+max.x)/2:side*lx>0?max.x:min.x,z=Math.abs(lz)<CONTACT_EPSILON?(min.z+max.z)/2:side*lz>0?max.z:min.z;
  return {x:x*c+z*s,z:-x*s+z*c};
 };
 const from=socket(old.min,old.max,pose.rotation,1),to=socket(bounds.min,bounds.max,rotation,-1);
 return {x:pose.x+from.x-to.x,y:pose.y,z:pose.z+from.z-to.z};
}
