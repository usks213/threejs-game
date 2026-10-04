import type { AdventureSave } from '../types';
import type { Vec3 } from '../../world/types';
import { BUILDINGS } from '../../content/catalog';
import { TREE_KINDS } from '../../content/meadows/data';
import { buildingPose, buildingVoxels, localPoint, rayVoxel, treeVoxels, voxelBounds } from '../voxel/model';

/** Recheck the selected object and the player's reach on the authority, not just the UI ray. */
export function assertInteractionReach(state:AdventureSave,player:Vec3,id:string,target:Vec3,density:(p:Vec3)=>number):void {
 const resource=id.startsWith('r:')?state.resources.find(n=>n.id===Number(id.slice(2))&&n.ready<=state.seconds):undefined;
 const building=id.startsWith('b:')?state.buildings.find(b=>b.id===Number(id.slice(2))):undefined;
 const entity=resource??building??(id==='grave'?state.death:null);
 const eye={x:player.x,y:player.y+.8,z:player.z};
 const length=Math.hypot(target.x-eye.x,target.y-eye.y,target.z-eye.z);
 if(!entity||![target.x,target.y,target.z,length].every(Number.isFinite)||length>3.7||Math.hypot(entity.x-player.x,entity.z-player.z)>4.5)throw new Error('照準の対象へ近づいてください');
 if(building){
  const pose=buildingPose(building),point=localPoint(target,pose,pose.rotation),bounds=voxelBounds(buildingVoxels(building.definition));
  if((['x','y','z'] as const).some(axis=>point[axis]<bounds.min[axis]-.2||point[axis]>bounds.max[axis]+.2))throw new Error('対象に照準を合わせてください');
 }else{
  const large=resource&&['altar','sacrifice','runestone','merchant'].includes(resource.kind),radius=large?1.2:.7,height=large?2.2:id==='grave'?1.6:.9;
  if(Math.abs(target.x-entity.x)>radius||Math.abs(target.z-entity.z)>radius||target.y<entity.y-.35||target.y>entity.y+height)throw new Error('対象に照準を合わせてください');
 }
 if(length<.1)return;
 const direction={x:(target.x-eye.x)/length,y:(target.y-eye.y)/length,z:(target.z-eye.z)/length};
 for(let d=.1;d<length-.1;d+=.1){const point={x:eye.x+direction.x*d,y:eye.y+direction.y*d,z:eye.z+direction.z*d};if(density(point)<-.08)throw new Error('対象が地面に遮られています');}
 const blocked=(distance:number|null)=>distance!==null&&distance<length-.12;
 for(const b of state.buildings){if(b===building||!BUILDINGS.some(d=>d.id===b.definition)||Math.hypot(b.x-player.x,b.z-player.z)>8)continue;const pose=buildingPose(b);if(blocked(rayVoxel(buildingVoxels(b.definition),localPoint(eye,pose,pose.rotation),localPoint(direction,{x:0,y:0,z:0},pose.rotation),b.removed,length)))throw new Error('対象が建物に遮られています');}
 for(const n of state.resources){if(n===resource||n.ready>state.seconds||!TREE_KINDS.has(n.kind)||Math.hypot(n.x-player.x,n.z-player.z)>7)continue;if(blocked(rayVoxel(treeVoxels(n.kind,n.id),localPoint(eye,n),direction,n.removed,length)))throw new Error('対象が木に遮られています');}
}
