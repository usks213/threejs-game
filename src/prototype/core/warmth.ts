import {materialDefinition} from './materials';
import type {Vec3,VoxelField} from './voxel';
export interface WarmthSource {position:Vec3;radius:number;strength:number;object?:string;cell?:{x:number;y:number;z:number}}
/** Heat is local and occluded. A hearth must still have its physical body; a
 * burning sample must still exist. Multiple fires never multiply the cap. */
export function sampleWarmth(position:Vec3,field:VoxelField,sources:Iterable<WarmthSource>){
 const body={x:position.x,y:position.y+.85,z:position.z},near:{source:WarmthSource;distance:number}[]=[];let scanned=0,rays=0;
 for(const source of sources){if(scanned++>=272)break;if(source.cell){const c=field.get(source.cell.x,source.cell.y,source.cell.z);if(!c||c.distance>=0||!materialDefinition(c.material).combustible)continue;}const distance=Math.hypot(source.position.x-body.x,source.position.y-body.y,source.position.z-body.z);if(Number.isFinite(distance)&&Number.isFinite(source.radius)&&source.radius>0&&source.strength>0&&distance<source.radius)near.push({source,distance});}
 near.sort((a,b)=>a.distance-b.distance);let strength=0;
 for(const {source:s,distance} of near.slice(0,8)){
  if(s.cell){const c=field.get(s.cell.x,s.cell.y,s.cell.z);if(!c||c.distance>=0||!materialDefinition(c.material).combustible)continue;}
  else if(s.object){rays++;const support=field.ray(s.position,{x:0,y:-1,z:0},2);if(support?.cell.object!==s.object)continue;}
  else continue;
  rays++;const hit=distance>.001?field.ray(body,{x:s.position.x-body.x,y:s.position.y-body.y,z:s.position.z-body.z},distance+.03):null;
  if(hit&&(!s.cell?hit.cell.object!==s.object:hit.cell.x!==s.cell.x||hit.cell.y!==s.cell.y||hit.cell.z!==s.cell.z))continue;
  strength=Math.max(strength,Math.min(1,s.strength)*(1-distance/s.radius));
 }
 return {strength,rays};
}
/** Per-actor cache bounds heat visibility work to four scans per second while
 * stationary. Position/terrain changes invalidate it; rewinding a save does too. */
export class WarmthProbe {
 private last:{at:number;revision:number;position:Vec3;strength:number}|null=null;
 lastRays=0;
 sample(position:Vec3,field:VoxelField,seconds:number,sources:()=>Iterable<WarmthSource>){
  const previous=this.last;
  if(previous&&seconds>=previous.at&&seconds-previous.at<.25&&field.revision===previous.revision&&Math.hypot(position.x-previous.position.x,position.y-previous.position.y,position.z-previous.position.z)<.35)return previous.strength;
  const result=sampleWarmth(position,field,sources());this.lastRays=result.rays;this.last={at:seconds,revision:field.revision,position:{...position},strength:result.strength};return result.strength;
 }
}
