import type {Vec3} from './voxel';
/** A fixed 1.5m plan grid matches the authored wall/floor width. Height stays on the actual support. */
export function buildTarget(point:Vec3,snap:boolean):Vec3{return snap?{x:Math.round(point.x/1.5)*1.5,y:point.y,z:Math.round(point.z/1.5)*1.5}:{...point};}
