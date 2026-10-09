import {global} from './orientation';
import {PART_HALF,type SkyPart,type SkyPartKind} from './types';
import type {Vec3} from '../../world/types';
import {snapConstruction} from './preview';
/** A visible draft stacked on the selected part. The authority still rechecks reach,
 * collisions, materials and other players before creating anything. */
export function adjacentConstructionPoint(part:SkyPart,kind:SkyPartKind):Vec3{
 const half=PART_HALF[part.kind],next=PART_HALF[kind];let maxY=-Infinity;
 for(const x of[-half.x,half.x])for(const y of[-half.y,half.y])for(const z of[-half.z,half.z]){
  const point=global({x,y,z},part);maxY=Math.max(maxY,point.y);
 }
 // Stack above the actual rotated bounds: placing beside a settled part can
 // bury the draft in an uphill slope. The small gap still permits joining.
 return snapConstruction({x:part.position.x,y:maxY+next.y+.125,z:part.position.z});
}
