import type {SkyContext,SkyPart} from './types';
import type {Vec3} from '../../world/types';
import {PART_HALF} from './types';
import {global,cross} from './orientation';
/** Nine samples per part. Material lift coefficients use game units, not SI water density. */
export function assemblyBuoyancy(parts:readonly SkyPart[],context:SkyContext):{force:Vec3;torque:Vec3;wet:number}{
 const mass=parts.reduce((sum,p)=>sum+p.mass,0),center={x:0,y:0,z:0},force={x:0,y:0,z:0},torque={x:0,y:0,z:0};for(const p of parts)for(const axis of['x','y','z']as const)center[axis]+=p.position[axis]*p.mass/mass;let submerged=0;
 for(const p of parts){const half=PART_HALF[p.kind],probes=[{...p.position}];for(const x of[-.75,.75])for(const y of[-.75,.75])for(const z of[-.75,.75])probes.push(global({x:x*half.x,y:y*half.y,z:z*half.z},p));
  for(const point of probes){const sample=context.hullWaterFraction?.(parts,point,.04)??context.waterFraction?.(point,.04)??context.immersion?.(point)??0,wet=Number.isFinite(sample)?Math.max(0,Math.min(1,sample)):0,lift=(p.mass-(p.cargoMass??0))*(p.material==='wood'?14:4)*wet/probes.length;submerged+=p.mass*wet/probes.length;force.y+=lift;const moment=cross({x:point.x-center.x,y:point.y-center.y,z:point.z-center.z},{x:0,y:lift,z:0});torque.x+=moment.x;torque.y+=moment.y;torque.z+=moment.z;}
 }
 return{force,torque,wet:mass?submerged/mass:0};
}
