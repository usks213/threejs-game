import {direction,type Vec3} from '../core/voxel';
export type ExplorationCameraMode='first'|'third';
export interface CameraDistanceField {distance(point:Vec3):number}
export interface CameraPlacement {position:Vec3;target:Vec3;distance:number;showBody:boolean}
/** A small swept camera sphere shares the rendered world's SDF. The camera never
 * changes the player's aim, weapon ray or collision body. At most42 SDF samples. */
export function explorationCamera(field:CameraDistanceField,eye:Vec3,yaw:number,pitch:number,requested=3,previous=3,dt=1/60,aimTarget?:Vec3):CameraPlacement {
 const forward=direction(yaw,pitch),distance=Math.max(1.4,Math.min(4,Number.isFinite(requested)?requested:3));
 const desired={x:eye.x-forward.x*distance+Math.cos(yaw)*.35,y:eye.y-forward.y*distance+.25,z:eye.z-forward.z*distance-Math.sin(yaw)*.35};
 const delta={x:desired.x-eye.x,y:desired.y-eye.y,z:desired.z-eye.z},length=Math.hypot(delta.x,delta.y,delta.z),unit={x:delta.x/length,y:delta.y/length,z:delta.z/length};
 const at=(d:number)=>({x:eye.x+unit.x*d,y:eye.y+unit.y*d,z:eye.z+unit.z*d});
 let clear=0,limit=length;const radius=.18;
 for(let d=Math.min(.12,length);d<=length+.001;d+=.12){const sample=Math.min(d,length);if(field.distance(at(sample))<radius){let lo=clear,hi=sample;for(let n=0;n<6;n++){const mid=(lo+hi)/2;if(field.distance(at(mid))>=radius)lo=mid;else hi=mid;}limit=lo;break;}clear=sample;}
 // Test the residual endpoint too: the step grid need not land on the requested distance.
 if(limit===length&&field.distance(at(length))<radius)limit=clear;
 const old=Number.isFinite(previous)?Math.max(0,previous):limit;
 const resolved=limit<old?limit:old+(limit-old)*(1-Math.exp(-Math.max(0,Math.min(.1,dt))*10));
 return {position:at(resolved),target:aimTarget??{x:eye.x+forward.x*8,y:eye.y+forward.y*8,z:eye.z+forward.z*8},distance:resolved,showBody:resolved>.7};
}
