import {REGIONS} from './regions';
import type {Vec3} from './voxel';
/** Shared hazard bounds. The deep band covers the authored world's full width. */
export const SHROUD_ZONES=[
 {id:'shroud-pocket',minX:5,maxX:11,minZ:-15,maxZ:-5,deep:false,floor:.15,height:6},
 {id:'shroud-band',minX:null,maxX:null,minZ:-26,maxZ:-18,deep:true,floor:.15,height:7},
] as const;
export function shroudZoneAt(p:Vec3){return SHROUD_ZONES.find(z=>p.z>z.minZ&&p.z<z.maxZ&&(z.minX===null||p.x>z.minX&&p.x<z.maxX));}
export function nearShroudBoundary(p:Vec3,radius=2){return [...SHROUD_ZONES,...REGIONS.filter(r=>r.climate==='ash').map(r=>r.bounds)].some(z=>{const dx=z.minX===null?0:Math.max(z.minX-p.x,0,p.x-z.maxX),dz=Math.max(z.minZ-p.z,0,p.z-z.maxZ);return Math.hypot(dx,dz)<=radius;});}
