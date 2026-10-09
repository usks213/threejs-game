import {VoxelField,type Vec3} from '../prototype/core/voxel';
import type {Door} from './types';
export interface Wall {min:Vec3;max:Vec3}
const wall=(x:number,z:number,w:number,d:number):Wall=>({min:{x,y:0,z},max:{x:x+w,y:3.8,z:z+d}});
/** Original cross-vault plan. Shared analytic bounds generate the SDF samples too. */
export function walls(seed:number):Wall[]{const shift=seed%2?1:-1;return [wall(-16,-16,32,.5),wall(-16,15.5,32,.5),wall(-16,-16,.5,32),wall(15.5,-16,.5,32),wall(-15.5,-5,12.5,.5),wall(3,-5,12.5,.5),wall(-15.5,5,12.5,.5),wall(3,5,12.5,.5),wall(-5,-15.5,.5,7.5),wall(4.5,8.5,.5,7),wall(shift*8-1,-1,2,2),wall(-shift*9-1,8,2,2)];}
export function solidWalls(seed:number,doors:Door[]){return [...walls(seed),...doors.filter(d=>!d.open).map(d=>({min:{x:d.position.x-3,y:0,z:d.position.z-.15},max:{x:d.position.x+3,y:2.8,z:d.position.z+.15}}))];}
export function blocked(point:Vec3,seed:number,doors:Door[],radius=.3){return solidWalls(seed,doors).some(w=>point.x>w.min.x-radius&&point.x<w.max.x+radius&&point.z>w.min.z-radius&&point.z<w.max.z+radius&&point.y<w.max.y);}
export function wallRay(from:Vec3,to:Vec3,seed:number,doors:Door[]):Vec3|null{let closest=1.001;for(const w of solidWalls(seed,doors)){let lo=0,hi=1;for(const axis of ['x','y','z'] as const){const delta=to[axis]-from[axis];if(Math.abs(delta)<1e-8){if(from[axis]<w.min[axis]||from[axis]>w.max[axis]){hi=-1;break;}}else{const a=(w.min[axis]-from[axis])/delta,b=(w.max[axis]-from[axis])/delta;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));}}if(lo<=hi&&lo>=0&&lo<=1)closest=Math.min(closest,lo);}return closest<=1?{x:from.x+(to.x-from.x)*closest,y:from.y+(to.y-from.y)*closest,z:from.z+(to.z-from.z)*closest}:null;}
export function dungeonField(seed:number,doors:Door[],field=new VoxelField(.25)){field.box({x:-16,y:-.5,z:-16},{x:16,y:0,z:16},3,undefined,.05);for(const w of walls(seed))field.box(w.min,w.max,3,undefined,.05);for(const d of doors)if(!d.open)field.box({x:d.position.x-3,y:0,z:d.position.z-.15},{x:d.position.x+3,y:2.8,z:d.position.z+.15},4,d.id,.04);return field;}
export const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
