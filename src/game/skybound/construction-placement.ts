import {global} from './orientation';
import {PART_HALF,type SkyPart,type SkyPartKind} from './types';
import type {Vec3} from '../../world/types';
import type {ProtectedVolume} from './protection';
import {snapConstruction} from './preview';
/** A visible draft stacked on the selected part. The authority still rechecks reach,
 * collisions, materials and other players before creating anything. */
export function adjacentConstructionPoint(part:SkyPart,kind:SkyPartKind,protectedVolumes:readonly ProtectedVolume[]=[]):Vec3{
 const half=PART_HALF[part.kind],next=PART_HALF[kind];let maxY=-Infinity;
 for(const x of[-half.x,half.x])for(const y of[-half.y,half.y])for(const z of[-half.z,half.z]){
  const point=global({x,y,z},part);maxY=Math.max(maxY,point.y);
 }
 // Stack above the actual rotated bounds: placing beside a settled part can
 // bury the draft in an uphill slope. The small gap still permits joining.
 const base=snapConstruction({x:part.position.x,y:maxY+next.y+.125,z:part.position.z});
 // A settled, tilted beam may just skirt a beacon. Replacing its footprint with
 // a grid-snapped upright one can enter that core. Prefer the nearest small
 // visible offset; do not silently move farther away or bypass any validation.
 const offsets:{x:number;z:number}[]=[];for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)if(x*x+z*z<=16)offsets.push({x:x/8,z:z/8});
 offsets.sort((a,b)=>a.x*a.x+a.z*a.z-b.x*b.x-b.z*b.z);
 for(const offset of offsets){const candidate={x:base.x+offset.x,y:base.y,z:base.z+offset.z};
  if(protectedVolumes.every(v=>{
   if(candidate.y+next.y<v.center.y-v.below||candidate.y-next.y>v.center.y+v.above)return true;
   return Math.hypot(Math.max(0,Math.abs(candidate.x-v.center.x)-next.x),Math.max(0,Math.abs(candidate.z-v.center.z)-next.z))>v.radius+.01;
  }))return candidate;
 }
 return base;
}
